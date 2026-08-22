/**
 * CHAT-002 — Composer: Cursor-like box + ModeSelector + ModelSelector (v2.1 chrome).
 */

import {
  useCallback,
  useMemo,
  useState,
  type FormEvent,
  type JSX,
  type KeyboardEvent,
} from 'react';
import type { AgentMode } from '@agent-k/shared';
import { ModeSelector, type ModePicker } from './components/ModeSelector';
import { ModelSelector, type ModelOption } from './components/ModelSelector';
import { ComposerPalette, type PaletteItem } from './components/ComposerPalette';

const MODE_LABELS: Record<string, string> = {
  agent: 'Agent',
  plan: 'Plan',
  debug: 'Debug',
  ask: 'Ask',
  auto: 'Auto',
};

const MODE_TOOLTIPS: Record<string, string> = {
  agent: 'Full tools — edit, terminal, browser',
  plan: 'Plan first, then execute with approval',
  debug: 'Hypothesis-driven debugging',
  ask: 'Read-only Q&A',
  auto: 'Pick the best mode for the task',
};

const DEFAULT_PALETTE: PaletteItem[] = [
  { id: 'mention-file', label: '@file', description: 'Attach a workspace file' },
  { id: 'mention-codebase', label: '@codebase', description: 'Search the codebase' },
  { id: 'slash-settings', label: '/settings', description: 'Open Settings hub' },
];

export type ComposerSubmit = {
  text: string;
  mode: AgentMode;
  model: string;
};

export type ComposerProps = {
  disabled?: boolean;
  sending?: boolean;
  model?: string;
  modelOptions?: ModelOption[];
  onModelChange?: (model: string) => void;
  onOpenSettings?: () => void;
  onSubmit: (value: ComposerSubmit) => void;
};

function toAgentMode(mode: ModePicker): AgentMode {
  if (mode === 'auto') return 'agent';
  return mode;
}

export function Composer(props: ComposerProps): JSX.Element {
  const {
    disabled,
    sending,
    model: modelProp,
    modelOptions,
    onModelChange,
    onOpenSettings,
    onSubmit,
  } = props;
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ModePicker>('agent');
  const [localModel, setLocalModel] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);

  const model = modelProp !== undefined ? modelProp : localModel;
  const setModel = (next: string) => {
    if (onModelChange) onModelChange(next);
    else setLocalModel(next);
  };

  const options = useMemo<ModelOption[]>(() => {
    if (modelOptions && modelOptions.length > 0) return modelOptions;
    if (model.trim()) return [{ id: model, label: model }];
    return [];
  }, [modelOptions, model]);

  const send = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled || sending) return;
    onSubmit({ text: trimmed, mode: toAgentMode(mode), model: model.trim() });
    setText('');
    setPaletteOpen(false);
  }, [text, mode, model, disabled, sending, onSubmit]);

  const onForm = (e: FormEvent) => {
    e.preventDefault();
    send();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    // Slash / @ opens palette chrome (CHAT-011 UI).
    if ((e.key === '/' || e.key === '@') && text.trim() === '') {
      setPaletteOpen(true);
    }
  };

  const busy = Boolean(disabled || sending);

  return (
    <form
      className="composer composer--cursor"
      data-testid="chat-composer"
      onSubmit={onForm}
    >
      <div className="composer-box-wrap">
        <ComposerPalette
          open={paletteOpen}
          items={DEFAULT_PALETTE}
          onClose={() => setPaletteOpen(false)}
          onSelect={(id) => {
            if (id === 'slash-settings') onOpenSettings?.();
            setPaletteOpen(false);
          }}
        />
        <div className="composer-box">
          <textarea
            data-testid="chat-input"
            rows={2}
            placeholder={disabled ? 'Host not connected…' : 'Message Agent K…'}
            value={text}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />

          <div className="composer-toolbar">
            <div className="composer-toolbar__left">
              <ModeSelector
                value={mode}
                onChange={setMode}
                disabled={busy}
                labels={MODE_LABELS}
                tooltips={MODE_TOOLTIPS}
              />
              {/* Keep chat-mode test id for CHAT-002 tests */}
              <span data-testid="chat-mode" hidden>
                {toAgentMode(mode)}
              </span>

              {options.length > 0 ? (
                <ModelSelector
                  value={model}
                  options={options}
                  disabled={busy}
                  onChange={setModel}
                  onOpenSettings={onOpenSettings}
                />
              ) : (
                <div className="model-selector-wrapper">
                  <input
                    className="model-selector-input"
                    data-testid="chat-model"
                    type="text"
                    placeholder="model…"
                    value={model}
                    disabled={busy}
                    onChange={(e) => setModel(e.target.value)}
                    title="Model id (open Settings for full config)"
                  />
                </div>
              )}
              {/* Stable test id when picker is used */}
              {options.length > 0 ? (
                <input
                  data-testid="chat-model"
                  type="hidden"
                  value={model}
                  readOnly
                />
              ) : null}
            </div>

            <div className="composer-toolbar__right">
              <button
                type="submit"
                className="composer-icon-btn composer-icon-btn--send"
                data-testid="chat-send"
                disabled={busy || !text.trim()}
                aria-label={sending ? 'Sending' : 'Send'}
              >
                {sending ? '…' : '↑'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
