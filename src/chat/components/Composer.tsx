import React, { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import type { Attachment, ModePicker } from '../types';
import {
  inlineEditFileLabel,
  inlineEditLineCount,
  inlineEditRangeLabel,
  type InlineEditContext
} from '../inlineEdit';
import { ModeSelector } from './ModeSelector';
import { ModelSelector, type ModelSelectorOption } from './ModelSelector';
import { IconQueue } from './Icons';
import { ComposerPalette, type PaletteItem } from './ComposerPalette';
import {
  THINKING_EFFORT_OPTIONS,
  type ThinkingEffort
} from '../../agent/thinkingEffort';
import {
  attachmentDisplayLabel,
  attachmentId,
  looksLikeLogOrSnippet,
  makeLogAttachment,
  parseLineRangeInput
} from '../attachmentFormat';
import {
  detectComposerTrigger,
  filterSlashCommands,
  replaceTriggerRange,
  type ActiveTrigger,
  type MentionHit,
  type SlashCommand
} from '../composerPalette';

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
  /** Plan V2 generation after clarifying questions */
  isGeneratingPlan?: boolean;
  /** Mode pill (Cursor: left of model). `auto` classifies on send. */
  mode: ModePicker;
  onModeChange: (mode: ModePicker) => void;
  modeLabels: Record<string, string>;
  modeTooltips: Record<string, string>;
  /** Short model label next to mode */
  modelLabel: string;
  /** Full model id (for select value) */
  modelId?: string;
  /** Models from provider /v1/models (Composer picker) */
  modelOptions?: Array<string | ModelSelectorOption>;
  /** User picked a model from the composer dropdown */
  onModelChange?: (modelId: string) => void;
  /** Thinking effort (Off / Low / Med / High / Max) */
  thinkingEffort?: ThinkingEffort;
  onThinkingEffortChange?: (effort: ThinkingEffort) => void;
  /** Model-specific effort levels; empty/omitted → hide Thinking control */
  thinkingOptions?: Array<{ value: ThinkingEffort; label: string; title: string }>;
  /** 0–100 estimated context fill */
  contextUsagePercent?: number;
  contextUsageLabel?: string;
  /** Prefill composer (e.g. Stop on user bubble → same text for resend) */
  seedText?: string | null;
  seedNonce?: number;
  /** Inline Edit selection chip — instruction stays in the textarea */
  inlineEdit?: InlineEditContext | null;
  onClearInlineEdit?: () => void;
  /** Slash command actions (/new, /agent, /compact, /cost, /model, /permissions, /help, …) */
  onSlashCommand?: (cmd: SlashCommand) => void;
}

function getVsCodeApi(): { postMessage: (msg: unknown) => void } | null {
  try {
    const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
    return api?.postMessage ? api : null;
  } catch {
    return null;
  }
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
  isGeneratingPlan = false,
  mode,
  onModeChange,
  modeLabels,
  modeTooltips,
  modelLabel,
  modelId,
  modelOptions = [],
  onModelChange,
  thinkingEffort = 'medium',
  onThinkingEffortChange,
  thinkingOptions,
  contextUsagePercent = 0,
  contextUsageLabel,
  seedText = null,
  seedNonce = 0,
  inlineEdit = null,
  onClearInlineEdit,
  onSlashCommand
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

  const [paletteTrigger, setPaletteTrigger] = useState<ActiveTrigger | null>(
    null
  );
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [mentionHits, setMentionHits] = useState<MentionHit[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const searchReqRef = useRef(0);
  const paletteTriggerRef = useRef<ActiveTrigger | null>(null);
  paletteTriggerRef.current = paletteTrigger;

  useEffect(() => {
    if (seedNonce <= 0 || seedText == null) return;
    setText(seedText);
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const len = seedText.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    });
  }, [seedNonce, seedText]);

  const syncPalette = useCallback((nextText: string, cursor: number) => {
    const trigger = detectComposerTrigger(nextText, cursor);
    setPaletteTrigger(trigger);
    setPaletteIndex(0);
    if (!trigger || trigger.kind !== 'mention') {
      setMentionHits([]);
      setMentionLoading(false);
    }
  }, []);

  // Debounced workspace search for @
  useEffect(() => {
    if (!paletteTrigger || paletteTrigger.kind !== 'mention') return;
    const api = getVsCodeApi();
    if (!api) {
      setMentionHits([]);
      setMentionLoading(false);
      return;
    }
    const reqId = `cs_${++searchReqRef.current}_${Date.now()}`;
    setMentionLoading(true);
    const query = paletteTrigger.query;
    const t = window.setTimeout(() => {
      api.postMessage({
        type: 'composer.search',
        requestId: reqId,
        query,
        kind: 'file'
      });
    }, 80);

    const onMsg = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'composer.search.result') return;
      if (data.requestId !== reqId) return;
      const results = Array.isArray(data.results) ? data.results : [];
      setMentionHits(
        results.map((r: any) => ({
          kind: r.kind === 'folder' ? 'folder' : 'file',
          path: String(r.path || ''),
          label: String(r.label || r.path || ''),
          description: r.description != null ? String(r.description) : undefined
        }))
      );
      setMentionLoading(false);
    };
    window.addEventListener('message', onMsg);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('message', onMsg);
    };
  }, [paletteTrigger]);

  const paletteItems: PaletteItem[] = (() => {
    if (!paletteTrigger) return [];
    if (paletteTrigger.kind === 'slash') {
      return filterSlashCommands(paletteTrigger.query).map((cmd) => ({
        type: 'slash' as const,
        cmd
      }));
    }
    return mentionHits.map((hit) => ({ type: 'mention' as const, hit }));
  })();

  const applyTextAndCursor = (next: string, cursor: number) => {
    setText(next);
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      try {
        el.setSelectionRange(cursor, cursor);
      } catch {
        /* ignore */
      }
    });
  };

  const closePalette = () => {
    setPaletteTrigger(null);
    setMentionHits([]);
    setMentionLoading(false);
    setPaletteIndex(0);
  };

  const selectPaletteItem = useCallback(
    (item: PaletteItem) => {
      const trigger = paletteTriggerRef.current;
      const el = textareaRef.current;
      if (!trigger || !el) return;
      const cursor = el.selectionStart ?? text.length;

      if (item.type === 'mention') {
        const { hit } = item;
        const att: Attachment = {
          type: hit.kind === 'folder' ? 'folder' : 'file',
          path: hit.path,
          label: hit.label
        };
        setAttachments((prev) => {
          const normalized = { ...att, id: attachmentId(att) };
          const id = attachmentId(normalized);
          if (prev.some((a) => attachmentId(a) === id)) return prev;
          return [...prev, normalized];
        });
        const { text: next, cursor: nextCursor } = replaceTriggerRange(
          text,
          trigger.start,
          cursor,
          ''
        );
        applyTextAndCursor(next, nextCursor);
        closePalette();
        return;
      }

      const { cmd } = item;
      const { text: next, cursor: nextCursor } = replaceTriggerRange(
        text,
        trigger.start,
        cursor,
        ''
      );
      applyTextAndCursor(next, nextCursor);
      closePalette();
      onSlashCommand?.(cmd);
    },
    [text, onSlashCommand]
  );

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
    closePalette();
    window.setTimeout(() => {
      suppressCommitRef.current = false;
    }, 100);
  };

  const addAttachments = useCallback((items: Attachment[]) => {
    setAttachments((prev) => {
      const next = [...prev];
      for (const item of items) {
        if (!item.path && !item.content) continue;
        const normalized: Attachment = {
          ...item,
          id: item.id || attachmentId(item)
        };
        const id = attachmentId(normalized);
        const idx = next.findIndex((a) => attachmentId(a) === id);
        if (idx >= 0) {
          next[idx] = { ...next[idx], ...normalized, id };
        } else {
          next.push(normalized);
        }
      }
      return next;
    });
  }, []);

  // Editor selection / host → attach chip
  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'attachments.add') return;
      const items = Array.isArray(data.items) ? data.items : [];
      const mapped: Attachment[] = items
        .filter((x: any) => x && (x.path || x.content))
        .map((x: any) => ({
          id: x.id ? String(x.id) : undefined,
          type: (['file', 'folder', 'snippet', 'log', 'symbol', 'codebase'].includes(x.type)
            ? x.type
            : x.content && !x.path
              ? 'log'
              : 'file') as Attachment['type'],
          path: String(x.path || x.id || `att_${Date.now()}`),
          content: x.content != null ? String(x.content) : undefined,
          startLine:
            x.startLine != null && Number.isFinite(Number(x.startLine))
              ? Number(x.startLine)
              : undefined,
          endLine:
            x.endLine != null && Number.isFinite(Number(x.endLine))
              ? Number(x.endLine)
              : undefined,
          label: x.label != null ? String(x.label) : undefined
        }));
      if (mapped.length) addAttachments(mapped);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [addAttachments]);

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

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => attachmentId(a) !== id));
  };

  const editLineRange = (att: Attachment) => {
    if (att.type === 'folder' || att.type === 'log') return;
    const current =
      att.startLine != null
        ? att.endLine != null && att.endLine !== att.startLine
          ? `${att.startLine}-${att.endLine}`
          : String(att.startLine)
        : '';
    const raw = window.prompt(
      'Line range (e.g. 10-30). Leave empty for the whole file.',
      current
    );
    if (raw == null) return;
    const parsed = parseLineRangeInput(raw);
    if (parsed == null) {
      window.alert('Invalid format. Example: 10-30');
      return;
    }
    setAttachments((prev) =>
      prev.map((a) => {
        if (attachmentId(a) !== attachmentId(att)) return a;
        const next: Attachment = {
          ...a,
          startLine: parsed.startLine,
          endLine: parsed.endLine
        };
        // Drop stale selection body when range changes without matching content
        if (parsed.startLine == null) {
          delete next.startLine;
          delete next.endLine;
        }
        next.id = attachmentId({ ...next, id: undefined });
        return next;
      })
    );
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

    // @ / palette navigation
    if (paletteTrigger && paletteItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPaletteIndex((i) => (i + 1) % paletteItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPaletteIndex(
          (i) => (i - 1 + paletteItems.length) % paletteItems.length
        );
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closePalette();
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        const item = paletteItems[paletteIndex];
        if (item) selectPaletteItem(item);
        return;
      }
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
    const next = e.target.value;
    setText(next);
    syncPalette(next, e.target.selectionStart ?? next.length);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const dt = e.clipboardData;
    if (!dt) return;
    const uris = collectUrisFromDataTransfer(dt as unknown as DataTransfer);
    if (uris.length && (dt.files?.length || dt.types.includes('text/uri-list'))) {
      e.preventDefault();
      resolveAndAdd(uris);
      return;
    }
    const pasted = dt.getData('text/plain');
    // Multi-line / log paste → chip (not dumped into the composer text)
    if (pasted && looksLikeLogOrSnippet(pasted)) {
      e.preventDefault();
      addAttachments([makeLogAttachment(pasted)]);
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
      return 'Waiting for your answer…';
    }
    if (isGeneratingPlan) {
      return 'Creating plan…';
    }
    if (isStreaming) {
      return 'Streaming… (Enter: queue · ⌘/Ctrl+Enter: interrupt)';
    }
    if (attachments.length) {
      return 'Add a message, or send attachments only… (paste logs · click a chip for line range)';
    }
    if (inlineEdit) {
      return 'Describe the change…';
    }
    return 'Type a message · @ files · / commands…';
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
      {dragOver ? (
        <div className="composer-drop-hint">
          Hold <kbd>Shift</kbd> and drop files/folders to attach
        </div>
      ) : null}

      <div className="composer-box-wrap">
        {paletteTrigger ? (
          <ComposerPalette
            kind={paletteTrigger.kind}
            items={paletteItems}
            selectedIndex={paletteIndex}
            loading={mentionLoading}
            query={paletteTrigger.query}
            onHover={setPaletteIndex}
            onSelect={selectPaletteItem}
          />
        ) : null}
        <div className="composer-box">
          {inlineEdit ? (
            <div className="composer-inline-edit" role="status" aria-label="Inline Edit context">
              <div className="composer-inline-edit-head">
                <span className="composer-inline-edit-title">Inline Edit</span>
                {onClearInlineEdit ? (
                  <button
                    type="button"
                    className="composer-inline-edit-remove"
                    onClick={onClearInlineEdit}
                    title="Remove inline edit context"
                    aria-label="Remove inline edit context"
                  >
                    ×
                  </button>
                ) : null}
              </div>
              <div className="composer-inline-edit-meta">
                {inlineEditFileLabel(inlineEdit.uri)} · {inlineEditRangeLabel(inlineEdit)}
              </div>
              <div className="composer-inline-edit-detail">
                {inlineEditLineCount(inlineEdit)}{' '}
                {inlineEditLineCount(inlineEdit) === 1 ? 'line' : 'lines'} selected
              </div>
            </div>
          ) : null}
          {attachments.length > 0 ? (
            <div className="composer-chips" aria-label="Attached context">
              {attachments.map((a) => {
                const id = attachmentId(a);
                const label = attachmentDisplayLabel(a);
                const isLog = a.type === 'log' || a.type === 'snippet';
                return (
                  <span
                    key={id}
                    className={`composer-chip composer-chip--${a.type}${
                      a.startLine != null ? ' composer-chip--ranged' : ''
                    }`}
                    title={
                      isLog
                        ? (a.content || '').slice(0, 500)
                        : a.startLine != null
                          ? `${a.path}:${a.startLine}${
                              a.endLine != null ? `-${a.endLine}` : ''
                            }`
                          : a.path
                    }
                  >
                    <span className="composer-chip-icon" aria-hidden>
                      {a.type === 'folder' ? '📁' : isLog ? '📋' : '📄'}
                    </span>
                    <button
                      type="button"
                      className="composer-chip-label"
                      onClick={() => editLineRange(a)}
                      title={
                        a.type === 'file' || a.type === 'snippet'
                          ? 'Click to set a line range'
                          : undefined
                      }
                    >
                      {label}
                    </button>
                    <button
                      type="button"
                      className="composer-chip-remove"
                      onClick={() => removeAttachment(id)}
                      title="Remove attachment"
                      aria-label={`Remove ${label}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
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
            onClick={(e) =>
              syncPalette(
                e.currentTarget.value,
                e.currentTarget.selectionStart ?? 0
              )
            }
            onKeyUp={(e) => {
              if (
                e.key === 'ArrowLeft' ||
                e.key === 'ArrowRight' ||
                e.key === 'Home' ||
                e.key === 'End'
              ) {
                syncPalette(
                  e.currentTarget.value,
                  e.currentTarget.selectionStart ?? 0
                );
              }
            }}
            placeholder={getPlaceholder()}
            disabled={disabled && !isStreaming}
            rows={1}
            style={{ height: `${height}px`, minHeight: '52px', maxHeight: '200px' }}
          />

          <div className="composer-toolbar" role="toolbar" aria-label="Composer controls">
            <div className="composer-toolbar__left">
              <ModeSelector
                value={mode}
                onChange={onModeChange}
                labels={modeLabels}
                tooltips={modeTooltips}
              />
              {onModelChange && (modelOptions.length > 0 || modelId) ? (
                <ModelSelector
                  value={
                    modelId ||
                    (typeof modelOptions[0] === 'string'
                      ? modelOptions[0]
                      : modelOptions[0]?.id) ||
                    ''
                  }
                  options={modelOptions}
                  onChange={onModelChange}
                  disabled={isStreaming}
                  label={modelLabel}
                />
              ) : (
                <span className="composer-model" title={modelLabel}>
                  {modelLabel}
                </span>
              )}
              {onThinkingEffortChange &&
              (thinkingOptions?.length ?? THINKING_EFFORT_OPTIONS.length) > 0 ? (
                <select
                  className="composer-thinking-select"
                  value={thinkingEffort}
                  onChange={(e) =>
                    onThinkingEffortChange(e.target.value as ThinkingEffort)
                  }
                  disabled={isStreaming}
                  title={
                    (thinkingOptions || THINKING_EFFORT_OPTIONS).find(
                      (o) => o.value === thinkingEffort
                    )?.title || 'Thinking effort'
                  }
                  aria-label="Thinking effort"
                >
                  {(thinkingOptions || THINKING_EFFORT_OPTIONS).map((o) => (
                    <option key={o.value} value={o.value} title={o.title}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <div className="composer-toolbar__right">
              <button
                type="button"
                onClick={pickAttachments}
                disabled={disabled && !isStreaming}
                className="composer-icon-btn"
                title="Attach file or folder"
                aria-label="Attach file or folder"
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
                      title="Add to queue (Enter) — sent after the current turn"
                      aria-label="Add to queue"
                    >
                      <IconQueue />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => submitResynth(text)}
                    className="composer-icon-btn"
                    title="Interrupt and merge (⌘/Ctrl+Enter)"
                    aria-label="Interrupt and merge"
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
          title="Regenerate"
          aria-label="Regenerate"
        >
          <span aria-hidden>↻</span>
        </button>
      </div>
    </div>
  );
}
