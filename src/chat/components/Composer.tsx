import React, { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import type { Attachment } from '../types';

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

  // VS Code explorer custom mime
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
      // Windows: /C:/Users/... → C:/Users/...
      if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
      return p;
    } catch {
      return uri.replace(/^file:\/\//, '');
    }
  }
  return uri;
}

/**
 * Composer — IME-safe send + Cursor-like drag/drop attachment chips.
 */
export function Composer({
  onSend,
  disabled,
  onStop,
  onRegenerate,
  onQueueMessage,
  onResynthesize,
  isStreaming,
  isAwaitingUser = false
}: ComposerProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [height, setHeight] = useState(44);
  /** true while Hangul/CJK IME composition is active */
  const composingRef = useRef(false);
  /** After send/clear, IME may re-insert the last syllable via compositionend — drop it */
  const suppressCommitRef = useRef(false);
  /** Last submitted text + time — ignore residual syllable re-send */
  const lastSubmitRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const dragDepthRef = useRef(0);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
      setHeight(newHeight);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [text]);

  /** Drop IME leftover that is just the last syllable of what we already sent */
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
    (
      results: Array<{ path?: string; type?: string }>
    ) => {
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

  /** Resolve URIs via Extension Host (file vs folder) */
  const resolveAndAdd = useCallback(
    (uris: string[]) => {
      if (!uris.length) return;

      // Optimistic chips from URI → path (file default)
      const optimistic: Attachment[] = uris.map((u) => {
        const path = uriToFsPath(u);
        const isFolderHint = /\/$/.test(u) || /\/$/.test(path);
        return {
          type: isFolderHint ? 'folder' : 'file',
          path
        };
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

  /** Paperclip: host showOpenDialog (no Shift required) */
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

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229 || composingRef.current) {
      return;
    }

    const isEnter = e.key === 'Enter' && !e.shiftKey;
    const isAltEnter = e.key === 'Enter' && e.altKey && !e.shiftKey;
    const isCtrlEnter = e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey;

    if (isAltEnter) {
      e.preventDefault();
      const value = text.trim();
      if ((value || attachments.length) && !disabled && onQueueMessage) {
        if (value && isImeResidual(value) && !attachments.length) return;
        onQueueMessage(value);
        clearAfterSubmit(value);
      }
      return;
    }

    if (isEnter || isCtrlEnter) {
      e.preventDefault();
      if (isStreaming) {
        submitResynth(text);
      } else {
        submitIdle(text);
      }
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
    // File paths pasted as uri-list / plain paths → chips
    const dt = e.clipboardData;
    if (!dt) return;
    const uris = collectUrisFromDataTransfer(dt as unknown as DataTransfer);
    if (uris.length && (dt.files?.length || dt.types.includes('text/uri-list'))) {
      // Only intercept when it's clearly file drop/paste, not normal text
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
      return 'Waiting for your answer above… (Stop cancels the question)';
    }
    if (isStreaming) {
      return 'Streaming… (Enter: Interrupt & Resynthesize, Alt+Enter: Queue-only, Stop: keep/discard queue)';
    }
    if (attachments.length) {
      return 'Add a message, or Send with attached files/folders…';
    }
    return 'Type a message… (📎 Attach · or hold Shift and drop files)';
  };

  return (
    <div
      className={`composer${dragOver ? ' drag-over' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Cursor-style attachment pills */}
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
        style={{ height: `${height}px`, minHeight: '44px', maxHeight: '200px' }}
      />
      <div className="composer-actions">
        {isStreaming ? (
          <button onClick={onStop} className="stop-btn" title="Stop (does not Resynthesize)">
            ⏹ Stop
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={pickAttachments}
              disabled={disabled}
              className="attach-btn"
              title="Attach files or folders"
            >
              📎 Attach
            </button>
            <button
              onClick={onRegenerate}
              disabled={disabled}
              className="regenerate-btn"
              title="Regenerate last response"
            >
              ↻ Regenerate
            </button>
            <button
              onClick={() => submitIdle(text)}
              disabled={disabled || !canSend}
              className="send-btn"
            >
              Send
            </button>
          </>
        )}
      </div>
    </div>
  );
}
