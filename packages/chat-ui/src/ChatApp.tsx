/**
 * CHAT-001 — Chat application shell (v2.1 chrome: tabs + history + thread + composer).
 * SET-001/SET-002 — Settings gear opens Models hub overlay.
 * UI chrome shells: session tabs, history, queue, changed-files (host wiring later).
 */

import { useCallback, useEffect, useState, type JSX } from 'react';
import { PROTOCOL_VERSION, type AgentMode } from '@agent-k/shared';
import { Composer, type ComposerSubmit } from './Composer';
import { MessageList, type ChatBubble } from './MessageList';
import {
  SettingsPanel,
  modelSettingsFromConfig,
  type ModelSettings,
} from './SettingsPanel';
import {
  ChangedFilesBar,
  ChatSessionTabs,
  HistoryPanel,
  IconHistory,
  IconPlus,
  MessageQueueUI,
  type ChatSession,
  type HistoryItem,
  type QueueItem,
} from './components';
import { getVsCodeApi } from './vscodeApi';
import './chatApp.css';
import './styles/conversation-variants.css';

type ConnPhase = 'pending' | 'ok' | 'error';

function readHostHello(
  raw: unknown,
): { protocolVersion: number; extensionVersion: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const msg = raw as Record<string, unknown>;
  if (msg.type !== 'host.hello') return undefined;
  if (typeof msg.protocolVersion !== 'number') return undefined;
  if (typeof msg.extensionVersion !== 'string') return undefined;
  return {
    protocolVersion: msg.protocolVersion,
    extensionVersion: msg.extensionVersion,
  };
}

/** Classify host chat.stream payload for UI rendering. */
function classifyStream(payload: Record<string, unknown>): {
  kind: 'delta' | 'replace' | 'status' | 'none';
  text?: string;
} {
  const event = payload.event;
  if (event === 'error' && typeof payload.error === 'string') {
    return { kind: 'replace', text: `⚠ ${payload.error}` };
  }
  if (event === 'status' && typeof payload.status === 'string') {
    return { kind: 'status', text: `(status: ${payload.status})` };
  }
  if (event === 'delta') {
    const content =
      typeof payload.content === 'string' ? payload.content : '';
    if (content) return { kind: 'delta', text: content };
    return { kind: 'none' };
  }
  if (event === 'tool.start' && typeof payload.toolName === 'string') {
    return { kind: 'status', text: `(tool: ${payload.toolName})` };
  }
  if (event === 'stopped') return { kind: 'replace', text: '(stopped)' };
  return { kind: 'none' };
}

let bubbleSeq = 0;
function nextId(prefix: string): string {
  bubbleSeq += 1;
  return `${prefix}_${Date.now()}_${bubbleSeq}`;
}

const EMPTY_SETTINGS: ModelSettings = { model: '', baseUrl: '', apiKey: '' };

export function ChatApp(): JSX.Element {
  const [phase, setPhase] = useState<ConnPhase>('pending');
  const [statusDetail, setStatusDetail] = useState('Waiting for host.hello…');
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<AgentMode>('agent');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [modelSettings, setModelSettings] =
    useState<ModelSettings>(EMPTY_SETTINGS);

  // CHAT-007 / CHAT-008 / CHAT-006 / Changed-files — UI shells (host later)
  const [sessions, setSessions] = useState<ChatSession[]>([
    { id: 'main', title: 'Agent K' },
  ]);
  const [activeSessionId, setActiveSessionId] = useState('main');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems] = useState<HistoryItem[]>([]);
  const [queueItems] = useState<QueueItem[]>([]);
  const [changedFiles] = useState<
    Array<{ path: string; additions?: number; deletions?: number }>
  >([]);
  const [changedExpanded, setChangedExpanded] = useState(false);

  useEffect(() => {
    const api = getVsCodeApi();

    const onMessage = (event: MessageEvent): void => {
      const data = event.data;

      const hello = readHostHello(data);
      if (hello) {
        if (hello.protocolVersion !== PROTOCOL_VERSION) {
          setPhase('error');
          setStatusDetail(`Protocol mismatch (got v${hello.protocolVersion})`);
          return;
        }
        setPhase('ok');
        setStatusDetail(
          `Connected · ext ${hello.extensionVersion} · protocol v${hello.protocolVersion}`,
        );
        return;
      }

      if (!data || typeof data !== 'object') return;
      const msg = data as Record<string, unknown>;

      if (msg.type === 'settings.open') {
        setSettingsOpen(true);
        return;
      }

      if (msg.type === 'config.hydrate') {
        const values =
          msg.values && typeof msg.values === 'object'
            ? (msg.values as Record<string, unknown>)
            : {};
        setModelSettings(modelSettingsFromConfig(values));
        setSettingsSaving(false);
        return;
      }

      if (msg.type !== 'chat.stream') return;
      const payload =
        msg.payload && typeof msg.payload === 'object'
          ? (msg.payload as Record<string, unknown>)
          : (msg as Record<string, unknown>);
      const classified = classifyStream(payload);
      if (classified.kind === 'delta' && classified.text) {
        const chunk = classified.text;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (
            last &&
            last.role === 'assistant' &&
            last.id.startsWith('a_stream_')
          ) {
            return [
              ...prev.slice(0, -1),
              { ...last, text: last.text + chunk },
            ];
          }
          return [
            ...prev,
            { id: `a_stream_${Date.now()}`, role: 'assistant', text: chunk },
          ];
        });
      } else if (
        (classified.kind === 'replace' || classified.kind === 'status') &&
        classified.text
      ) {
        const line = classified.text;
        setMessages((prev) => [
          ...prev,
          { id: nextId('a'), role: 'assistant', text: line },
        ]);
      }
      if (
        payload.event === 'error' ||
        payload.event === 'complete' ||
        payload.event === 'stopped'
      ) {
        setSending(false);
      }
    };

    window.addEventListener('message', onMessage);
    api.postMessage({ type: 'ui.ready', protocolVersion: PROTOCOL_VERSION });

    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  const onSubmit = useCallback(
    (value: ComposerSubmit) => {
      const api = getVsCodeApi();
      const requestId = nextId('req');
      const model = value.model.trim() || modelSettings.model.trim();
      setMode(value.mode);
      setMessages((prev) => [
        ...prev,
        { id: nextId('u'), role: 'user', text: value.text },
      ]);
      setSending(true);
      api.postMessage({
        type: 'chat.send',
        payload: {
          requestId,
          messages: [{ role: 'user', content: value.text }],
          mode: value.mode,
          ...(model ? { model } : {}),
        },
      });
    },
    [modelSettings.model],
  );

  const onSaveSettings = useCallback((next: ModelSettings) => {
    const api = getVsCodeApi();
    setSettingsSaving(true);
    setModelSettings(next);
    api.postMessage({
      type: 'config.update',
      key: 'provider.model',
      value: next.model,
    });
    api.postMessage({
      type: 'config.update',
      key: 'provider.baseUrl',
      value: next.baseUrl,
    });
    api.postMessage({
      type: 'config.update',
      key: 'provider.apiKey',
      value: next.apiKey,
    });
    setSettingsOpen(false);
  }, []);

  const startNewSession = () => {
    const id = `s_${Date.now()}`;
    setSessions((prev) => [...prev, { id, title: 'New chat' }]);
    setActiveSessionId(id);
    setMessages([]);
  };

  const empty = messages.length === 0;
  const mainClass = empty
    ? 'chat-main chat-main--empty'
    : 'chat-main chat-main--active';

  return (
    // Host webviewHtml boot looks for .ak-app / .ak-shell as "React mounted".
    <div className="ak-app ak-shell chat-container" data-testid="chat-app">
      <div className="chat-shell">
        <div className={mainClass}>
          <header className="chat-header">
            <ChatSessionTabs
              sessions={sessions}
              activeId={activeSessionId}
              onSelect={setActiveSessionId}
              onClose={(id) => {
                setSessions((prev) => {
                  if (prev.length <= 1) return prev;
                  const next = prev.filter((s) => s.id !== id);
                  if (id === activeSessionId) {
                    setActiveSessionId(next[0]?.id ?? 'main');
                  }
                  return next;
                });
              }}
              onNew={startNewSession}
            />
            <div className="chat-header-meta">
              <span
                className="chat-header-meta__mode"
                data-testid="chat-active-mode"
              >
                {mode}
              </span>
              {modelSettings.model ? (
                <span
                  className="chat-header-meta__model"
                  data-testid="chat-active-model"
                  title={modelSettings.model}
                >
                  {modelSettings.model}
                </span>
              ) : null}
            </div>
            <div className="chat-actions">
              <button
                type="button"
                className="composer-icon-btn"
                data-testid="chat-history-btn"
                aria-label="Open history"
                title="History"
                onClick={() => setHistoryOpen(true)}
              >
                <IconHistory size={14} />
              </button>
              <button
                type="button"
                className="composer-icon-btn"
                data-testid="chat-new-btn"
                aria-label="New chat"
                title="New chat"
                onClick={startNewSession}
              >
                <IconPlus size={14} />
              </button>
              <button
                type="button"
                className="composer-icon-btn composer-icon-btn--gear"
                data-testid="chat-settings-btn"
                aria-label="Open settings"
                onClick={() => setSettingsOpen(true)}
                title="Settings"
              >
                ⚙
              </button>
            </div>
          </header>

          <HistoryPanel
            open={historyOpen}
            items={historyItems}
            onClose={() => setHistoryOpen(false)}
            onSelect={(id) => {
              setActiveSessionId(id);
              setHistoryOpen(false);
            }}
          />

          <div
            className="chat-status"
            data-state={phase}
            data-testid="chat-shell-status"
            role="status"
          >
            {statusDetail}
          </div>

          <div className="message-list" data-testid="chat-shell">
            <MessageList messages={messages} connected={phase === 'ok'} />
          </div>

          <footer className="chat-footer">
            <ChangedFilesBar
              files={changedFiles}
              expanded={changedExpanded}
              onToggle={() => setChangedExpanded((v) => !v)}
            />
            <MessageQueueUI items={queueItems} />
            <Composer
              disabled={phase !== 'ok'}
              sending={sending}
              model={modelSettings.model}
              onModelChange={(m) =>
                setModelSettings((prev) => ({ ...prev, model: m }))
              }
              onOpenSettings={() => setSettingsOpen(true)}
              onSubmit={onSubmit}
            />
          </footer>

          <SettingsPanel
            open={settingsOpen}
            initial={modelSettings}
            saving={settingsSaving}
            onClose={() => setSettingsOpen(false)}
            onSave={onSaveSettings}
          />
        </div>
      </div>
    </div>
  );
}
