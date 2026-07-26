import React, { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import type { Attachment, Mode } from '../types';
import { ModeSelector } from './ModeSelector';

interface ComposerProps {
  onSend: (text: string, files: Attachment[]) => void;
  disabled: boolean;
  onStop: () => void;
  onRegenerate: () => void;
  /** Alt+Enter: Queue-only without abort */
  onQueueMessage?: (text: string) => void;
  /**
   * RW-P0-04: Enter while streaming → Interrupt & Resynthesize
   * (abort + new instruction). Pass composer text (may be empty → drain queue).
   */
  onResynthesize?: (text: string) => void;
  isStreaming: boolean;
  /** Host blocked on ask_question — show Waiting… instead of Streaming… */
  isAwaitingUser?: boolean;
  /** Mode pill (Cursor: left of model) */
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  modeLabels: Record<string, string>;
  modeTooltips: Record<string, string>;
  /** Short model label next to mode */
  modelLabel: string;
  /** Full model id (for select value) */
  modelId?: string;
  /** Registered models only (not full /v1/models catalog) */
  modelOptions?: string[];
  /** User picked a model from the composer dropdown */
  onModelChange?: (modelId: string) => void;
  /** 0–100 estimated context fill */
  contextUsagePercent?: number;
  contextUsageLabel?: string;
}

function getVsCodeApi(): { postMessage: (msg: unknown) => void } | null {
  try {
    const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
    return api?.postMessage ? api : null;
  } catch {
    return null;
  }
}

/** Basename for Cursor-like chip label */
function baseName(p: string): string {
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = norm.split('/');
  return parts[parts.length - 1] || p;
}

/** Collect file:// / path URIs from VS Code explorer or OS drop */
function collectUrisFromDataTransfer(dt: DataTransfer): string[] {
  const uris: string[] = [];

  const uriList = dt.getData('text/uri-list');
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) {
      const t = line.trim();
      if (t && !t.startsWith('#')) uris.push(t);
    }
  }

  try {
    const resourceUrls = dt.getData('resourceurls');
    if (resourceUrls) {
      const arr = JSON.parse(resourceUrls);
      if (Array.isArray(arr)) {
        for (const u of arr) {
          if (typeof u === 'string' && u) uris.push(u);
        }
      }
    }
  } catch {
    /* ignore */
  }

  const plain = dt.getData('text/plain');
  if (plain) {
    for (const line of plain.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('file:') || t.startsWith('/') || /^[A-Za-z]:[\\/]/.test(t)) {
        uris.push(t);
      }
    }
  }

  if (dt.files?.length) {
    for (const f of Array.from(dt.files)) {
      const p = (f as File & { path?: string }).path;
      if (p) uris.push(p.startsWith('file:') ? p : `file://${p}`);
    }
  }

  return [...new Set(uris)];
}

function uriToFsPath(uri: string): string {
  if (uri.startsWith('file:')) {
    try {
      const u = new URL(uri);
      let p = decodeURIComponent(u.pathname);
      if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
      return p;
    } catch {
      return uri.replace(/^file:\/\//, '');
    }
  }
  return uri;
}

/**
 * Composer — Cursor-like: mode+model left, attach/send|stop right, usage under box.
 */
export function Composer({
  onSend,
  disabled,
  onStop,
  onRegenerate,
  onQueueMessage,
  onResynthesize,
  isStreaming,
  isAwaitingUser = false,
  mode,
  onModeChange,
  modeLabels,
  modeTooltips,
  modelLabel,
  modelId,
  modelOptions = [],
  onModelChange,
  contextUsagePercent = 0,
  contextUsageLabel
}: ComposerProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [height, setHeight] = useState(52);
  const composingRef = useRef(false);
  const suppressCommitRef = useRef(false);
  const lastSubmitRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const dragDepthRef = useRef(0);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(Math.max(textareaRef.current.scrollHeight, 52), 200);
      setHeight(newHeight);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [text]);

  const isImeResidual = (candidate: string): boolean => {
    const trimmed = candidate.trim();
    if (!trimmed) return true;
    const { text: prev, at } = lastSubmitRef.current;
    if (!prev) return false;
    if (Date.now() - at > 800) return false;
    if (trimmed === prev) return true;
    if (prev.endsWith(trimmed) && trimmed.length <= 2) return true;
    return false;
  };

  const clearAfterSubmit = (submitted: string) => {
    lastSubmitRef.current = { text: submitted, at: Date.now() };
    suppressCommitRef.current = true;
    setText('');
    setAttachments([]);
    window.setTimeout(() => {
      suppressCommitRef.current = false;
    }, 100);
  };

  const addAttachments = useCallback((items: Attachment[]) => {
    setAttachments((prev) => {
      const next = [...prev];
      for (const item of items) {
        if (!item.path) continue;
        if (next.some((a) => a.path === item.path && a.type === item.type)) continue;
        next.push(item);
      }
      return next;
    });
  }, []);

  const applyResolvedResults = useCallback(
    (results: Array<{ path?: string; type?: string }>) => {
      if (!results.length) return;
      setAttachments((prev) => {
        const byPath = new Map(prev.map((a) => [a.path, a]));
        for (const r of results) {
          if (!r?.path) continue;
          byPath.set(r.path, {
            type: r.type === 'folder' ? 'folder' : 'file',
            path: String(r.path)
          });
        }
        return [...byPath.values()];
      });
    },
    []
  );

  const resolveAndAdd = useCallback(
    (uris: string[]) => {
      if (!uris.length) return;
      const optimistic: Attachment[] = uris.map((u) => {
        const path = uriToFsPath(u);
        const isFolderHint = /\/$/.test(u) || /\/$/.test(path);
        return { type: isFolderHint ? 'folder' : 'file', path };
      });
      addAttachments(optimistic);

      const api = getVsCodeApi();
      if (!api) return;

      const requestId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const onMsg = (event: MessageEvent) => {
        const data = event.data;
        if (!data || data.type !== 'attachments.resolve.result' || data.requestId !== requestId) {
          return;
        }
        window.removeEventListener('message', onMsg);
        applyResolvedResults(Array.isArray(data.results) ? data.results : []);
      };
      window.addEventListener('message', onMsg);
      api.postMessage({ type: 'attachments.resolve', requestId, uris });
      window.setTimeout(() => window.removeEventListener('message', onMsg), 5000);
    },
    [addAttachments, applyResolvedResults]
  );

  const pickAttachments = useCallback(() => {
    const api = getVsCodeApi();
    if (!api) return;
    const requestId = `pick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const onMsg = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'attachments.resolve.result' || data.requestId !== requestId) {
        return;
      }
      window.removeEventListener('message', onMsg);
      applyResolvedResults(Array.isArray(data.results) ? data.results : []);
    };
    window.addEventListener('message', onMsg);
    api.postMessage({ type: 'attachments.pick', requestId });
    window.setTimeout(() => window.removeEventListener('message', onMsg), 120_000);
  }, [applyResolvedResults]);

  const removeAttachment = (path: string) => {
    setAttachments((prev) => prev.filter((a) => a.path !== path));
  };

  const canSend = Boolean(text.trim() || attachments.length);

  const submitIdle = (raw: string) => {
    const value = raw.trim();
    if (attachments.length === 0) {
      if (!value || disabled || isImeResidual(value)) return;
    } else if (disabled) {
      return;
    } else if (value && isImeResidual(value) && !attachments.length) {
      return;
    }
    onSend(value, attachments);
    clearAfterSubmit(value || attachments.map((a) => a.path).join(','));
  };

  const submitResynth = (raw: string) => {
    const value = raw.trim();
    if (isImeResidual(value) && !attachments.length) {
      setText('');
      return;
    }
    if (onResynthesize) {
      onResynthesize(value);
      clearAfterSubmit(value || lastSubmitRef.current.text);
    } else {
      onStop();
      setTimeout(() => onRegenerate(), 100);
    }
  };

  const submitQueue = (raw: string) => {
    const value = raw.trim();
    if (!onQueueMessage) return;
    if (!value && !attachments.length) return;
    if (value && isImeResidual(value) && !attachments.length) return;
    // Queue must work while streaming even if disabled=true (idle-send lock)
    if (disabled && !isStreaming) return;
    onQueueMessage(value);
    clearAfterSubmit(value || attachments.map((a) => a.path).join(','));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229 || composingRef.current) {
      return;
    }

    const isEnterKey = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter';
    if (!isEnterKey || e.shiftKey) return;

    // Alt/Option+Enter → always queue (also works idle)
    if (e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      submitQueue(text);
      return;
    }

    const isCtrlEnter = e.ctrlKey || e.metaKey;
    e.preventDefault();
    if (isStreaming) {
      // Cursor-like: Enter queues (stays above composer, not in chat).
      // Cmd/Ctrl+Enter = interrupt & merge into current turn.
      if (isCtrlEnter) {
        submitResynth(text);
      } else if (onQueueMessage) {
        submitQueue(text);
      } else {
        submitResynth(text);
      }
    } else if (!disabled) {
      submitIdle(text);
    }
  };

  const handleCompositionStart = () => {
    composingRef.current = true;
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    composingRef.current = false;
    if (suppressCommitRef.current) {
      setText('');
      e.currentTarget.value = '';
      return;
    }
    setText(e.currentTarget.value);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (suppressCommitRef.current) {
      setText('');
      return;
    }
    setText(e.target.value);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const dt = e.clipboardData;
    if (!dt) return;
    const uris = collectUrisFromDataTransfer(dt as unknown as DataTransfer);
    if (uris.length && (dt.files?.length || dt.types.includes('text/uri-list'))) {
      if (dt.files?.length || dt.types.includes('text/uri-list')) {
        e.preventDefault();
        resolveAndAdd(uris);
      }
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragOver(false);
    const uris = collectUrisFromDataTransfer(e.dataTransfer);
    resolveAndAdd(uris);
  };

  const getPlaceholder = () => {
    if (isAwaitingUser) {
      return 'Waiting for your answer above…';
    }
    if (isStreaming) {
      return 'Streaming… (Enter: queue · ⌘/Ctrl+Enter: interrupt)';
    }
    if (attachments.length) {
      return 'Add a message, or Send with attachments…';
    }
    return 'Plan, Build, @ for context…';
  };

  const usagePct = Math.max(0, Math.min(100, Math.round(contextUsagePercent)));

  return (
    <div
      className={`composer composer--cursor${dragOver ? ' drag-over' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {attachments.length > 0 ? (
        <div className="composer-chips" aria-label="Attached files">
          {attachments.map((a) => (
            <span
              key={`${a.type}:${a.path}`}
              className={`composer-chip composer-chip--${a.type}`}
              title={a.path}
            >
              <span className="composer-chip-icon" aria-hidden>
                {a.type === 'folder' ? '📁' : '📄'}
              </span>
              <span className="composer-chip-label">{baseName(a.path)}</span>
              <button
                type="button"
                className="composer-chip-remove"
                onClick={() => removeAttachment(a.path)}
                title="Remove"
                aria-label={`Remove ${baseName(a.path)}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {dragOver ? (
        <div className="composer-drop-hint">
          Hold <kbd>Shift</kbd> and drop files/folders to attach
        </div>
      ) : null}

      <div className="composer-box">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onPaste={handlePaste}
          placeholder={getPlaceholder()}
          disabled={disabled && !isStreaming}
          rows={1}
          style={{ height: `${height}px`, minHeight: '52px', maxHeight: '200px' }}
        />

        <div className="composer-toolbar">
          <div className="composer-toolbar__left">
            <ModeSelector
              value={mode}
              onChange={onModeChange}
              disabled={isStreaming}
              labels={modeLabels}
              tooltips={modeTooltips}
            />
            {onModelChange && (modelOptions.length > 0 || modelId) ? (
              <select
                className="composer-model composer-model-select"
                value={modelId || modelOptions[0] || ''}
                onChange={(e) => onModelChange(e.target.value)}
                disabled={isStreaming}
                title={modelId || modelLabel}
                aria-label="Model"
              >
                {(modelOptions.includes(modelId || '')
                  ? modelOptions
                  : modelId
                    ? [modelId, ...modelOptions]
                    : modelOptions
                ).map((id) => {
                  const short = id.split('/').pop() || id;
                  const label = short.length > 32 ? `${short.slice(0, 30)}…` : short;
                  return (
                    <option key={id} value={id} title={id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            ) : (
              <span className="composer-model" title={modelLabel}>
                {modelLabel}
              </span>
            )}
          </div>

          <div className="composer-toolbar__right">
            <button
              type="button"
              onClick={pickAttachments}
              disabled={disabled && !isStreaming}
              className="composer-icon-btn"
              title="Attach files or folders"
              aria-label="Attach"
            >
              📎
            </button>
            {isStreaming ? (
              <>
                {onQueueMessage ? (
                  <button
                    type="button"
                    onClick={() => submitQueue(text)}
                    disabled={!canSend}
                    className="composer-icon-btn composer-icon-btn--queue"
                    title="Queue (Enter) — send after current turn finishes"
                    aria-label="Queue"
                  >
                    Queue
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => submitResynth(text)}
                  className="composer-icon-btn"
                  title="Interrupt & merge (⌘/Ctrl+Enter)"
                  aria-label="Interrupt and resynthesize"
                >
                  ⏎
                </button>
                <button
                  type="button"
                  onClick={onStop}
                  className="composer-icon-btn composer-icon-btn--stop"
                  title="Stop"
                  aria-label="Stop"
                >
                  <span className="composer-stop-square" aria-hidden />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => submitIdle(text)}
                disabled={disabled || !canSend}
                className="composer-icon-btn composer-icon-btn--send"
                title="Send"
                aria-label="Send"
              >
                ▲
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="composer-usage" title={contextUsageLabel || 'Context usage'}>
        <span className="composer-usage__icon" aria-hidden>
          ◔
        </span>
        <span className="composer-usage__text">
          {contextUsageLabel || `Context: ${usagePct}% used`}
        </span>
        <button
          type="button"
          className="composer-usage__regen"
          onClick={onRegenerate}
          disabled={disabled || isStreaming}
          title="Regenerate last response"
        >
          ↻
        </button>
      </div>
    </div>
  );
}
