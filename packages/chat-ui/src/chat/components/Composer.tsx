import React, { useState, useRef, useEffect, useLayoutEffect, KeyboardEvent, useCallback } from 'react';
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
  isOpenableAttachment,
  makeLogAttachment,
  makeImageAttachment,
  makeSnippetAttachment,
  parseVsCodeEditorClipboard,
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
import { debugLog } from '../debugLog';

interface ComposerProps {
  onSend: (text: string, files: Attachment[]) => void;
  disabled: boolean;
  onStop: () => void;
  /**
   * Optional fallback when streaming Enter has no onResynthesize.
   * No dedicated ↻ UI — re-run is pencil Save & Run.
   */
  onRegenerate?: () => void;
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
  /** Visible footer text — used tokens/percent only (no provider/source) */
  contextUsageLabel?: string;
  /** Optional hover title; may include budget hint */
  contextUsageTitle?: string;
  /** Prefill composer (e.g. Stop on user bubble → same text for resend) */
  seedText?: string | null;
  seedNonce?: number;
  /** Bump to focus the textarea (session tab click, even same tab) */
  focusNonce?: number;
  /** Seed attachments with seedText (pencil edit) */
  seedAttachments?: Attachment[] | null;
  /** Inline Edit selection chip — instruction stays in the textarea */
  inlineEdit?: InlineEditContext | null;
  onClearInlineEdit?: () => void;
  /** Slash command actions (/new, /agent, /compact, /cost, /model, /permissions, /help, …) */
  onSlashCommand?: (cmd: SlashCommand) => void;
  /** CHAT-007 — park/restore draft text + attachments when switching chat tabs */
  sessionId?: string;
  /**
   * `inline-edit` — same Composer chrome inside a user bubble (pencil).
   * Hides usage bar. Outside click / Esc dismiss via ChatApp + onDismiss.
   */
  variant?: 'default' | 'inline-edit';
  /** inline-edit: leave edit mode without sending (Esc) */
  onDismiss?: () => void;
}

/** Props shared by footer Composer and pencil inline-edit Composer */
export type ComposerChromeProps = Pick<
  ComposerProps,
  | 'mode'
  | 'onModeChange'
  | 'modeLabels'
  | 'modeTooltips'
  | 'modelLabel'
  | 'modelId'
  | 'modelOptions'
  | 'onModelChange'
  | 'thinkingEffort'
  | 'onThinkingEffortChange'
  | 'thinkingOptions'
  | 'onSlashCommand'
>;

function getVsCodeApi(): { postMessage: (msg: unknown) => void } | null {
  try {
    const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
    return api?.postMessage ? api : null;
  } catch {
    return null;
  }
}

/** Collect file:// / path URIs from explorer, editor tabs, or OS drop. */
function collectUrisFromDataTransfer(dt: DataTransfer): string[] {
  const uris: string[] = [];
  const push = (raw: string) => {
    const t = raw.trim();
    if (!t || t.startsWith('#')) return;
    uris.push(t);
  };
  const pushUriList = (blob: string) => {
    for (const line of blob.split(/\r?\n/)) push(line);
  };
  const tryJsonUris = (raw: string) => {
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      for (const item of arr) {
        if (typeof item === 'string') push(item);
        else if (item && typeof item === 'object') {
          // Comment: editor-tab drag — { uri } | { resource } | VS Code Uri DTO
          const u =
            (item as { uri?: unknown }).uri ??
            (item as { resource?: unknown }).resource;
          if (typeof u === 'string') push(u);
          else if (u && typeof u === 'object' && 'path' in (u as object)) {
            const dto = u as { scheme?: string; path?: string; external?: string };
            if (typeof dto.external === 'string') push(dto.external);
            else if (dto.path)
              push(
                dto.scheme === 'file' || !dto.scheme
                  ? `file://${dto.path}`
                  : `${dto.scheme}:${dto.path}`
              );
          }
        }
      }
    } catch {
      /* ignore */
    }
  };

  // Comment: VS Code editor-tab / explorer → webview (Shift+drop) MIME variants
  for (const mime of [
    'text/uri-list',
    'application/vnd.code.uri-list',
    'ResourceURLs',
    'resourceurls'
  ]) {
    try {
      const data = dt.getData(mime);
      if (!data) continue;
      if (mime.toLowerCase().includes('resource')) tryJsonUris(data);
      else pushUriList(data);
    } catch {
      /* ignore */
    }
  }

  try {
    const editors = dt.getData('application/vnd.code.editors');
    if (editors) tryJsonUris(editors);
  } catch {
    /* ignore */
  }

  const plain = dt.getData('text/plain');
  if (plain) {
    for (const line of plain.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('file:') || t.startsWith('/') || /^[A-Za-z]:[\\/]/.test(t)) {
        push(t);
      }
    }
  }

  if (dt.files?.length) {
    for (const f of Array.from(dt.files)) {
      const p = (f as File & { path?: string }).path;
      if (p) push(p.startsWith('file:') ? p : `file://${p}`);
    }
  }

  return [...new Set(uris)];
}

/** CHAT-012 — image/* from clipboard paste or OS drop (path-less blobs OK). */
function isLikelyImageFile(f: File, itemType?: string): boolean {
  const mime = (f.type || itemType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  // Comment: some Electron/macOS clipboard pastes leave type empty but name/ext set
  if (/\.(png|jpe?g|gif|webp|tiff?|bmp)$/i.test(f.name || '')) return true;
  // Comment: screenshot paste often has empty name+type with non-zero size
  if (!mime && !f.name && f.size > 32) return true;
  return false;
}

function collectImageFiles(dt: DataTransfer): File[] {
  const out: File[] = [];
  const seen = new Set<string>();
  const push = (f: File | null, itemType?: string) => {
    if (!f || !isLikelyImageFile(f, itemType)) return;
    const key = `${f.name}:${f.size}:${f.type || itemType || ''}:${f.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };
  // Comment: getAsFile() must run sync during paste — do items before any getData
  if (dt.items?.length) {
    for (const item of Array.from(dt.items)) {
      if (item.kind !== 'file') continue;
      if (
        item.type.startsWith('image/') ||
        item.type === '' ||
        item.type === 'application/octet-stream'
      ) {
        push(item.getAsFile(), item.type);
      }
    }
  }
  if (dt.files?.length) {
    for (const f of Array.from(dt.files)) push(f);
  }
  return out;
}

function hasFileDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  try {
    const types = Array.from(dt.types || []);
    // Comment: editor tabs use vnd.code.* / ResourceURLs — not always "Files"
    if (
      types.some((t) =>
        /files|resource|uri|vnd\.code|editors/i.test(String(t))
      )
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return Boolean(dt.files?.length);
}

/** Screenshot / image paste — even when clipboardData.files is empty (VS Code webview). */
function looksLikeImagePaste(dt: DataTransfer): boolean {
  try {
    const types = Array.from(dt.types || []);
    if (types.some((t) => /^image\//i.test(t))) return true;
    if (collectImageFiles(dt).length > 0) return true;
    const text = (dt.getData('text/plain') || '').trim();
    // Comment: macOS screenshot paste is often Files + empty plain text
    if (types.includes('Files') && !text) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Comment: CHAT-012 — clipboard File blobs are often revoked when the paste
 * event ends; kick off arrayBuffer() synchronously during the handler.
 */
function snapshotClipboardFiles(files: File[]): Promise<File[]> {
  const jobs = files.map(async (f) => {
    const type = f.type || 'image/png';
    const name = f.name || `Screenshot.${type.includes('jpeg') ? 'jpg' : 'png'}`;
    const buf = await f.arrayBuffer();
    return new File([buf], name, { type });
  });
  return Promise.all(jobs);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

async function readImagesFromClipboardApi(): Promise<File[]> {
  try {
    const nav = navigator as Navigator & {
      clipboard?: { read?: () => Promise<ClipboardItem[]> };
    };
    if (!nav.clipboard?.read) return [];
    const items = await nav.clipboard.read();
    const out: File[] = [];
    for (const item of items) {
      for (const type of item.types) {
        if (!type.startsWith('image/')) continue;
        const blob = await item.getType(type);
        const ext = type.split('/')[1] || 'png';
        out.push(new File([blob], `Screenshot.${ext}`, { type }));
      }
    }
    return out;
  } catch {
    return [];
  }
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
  contextUsageTitle,
  seedText = null,
  seedNonce = 0,
  focusNonce = 0,
  seedAttachments = null,
  inlineEdit = null,
  onClearInlineEdit,
  onSlashCommand,
  sessionId,
  variant = 'default',
  onDismiss
}: ComposerProps) {
  const isInlineEdit = variant === 'inline-edit';
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRootRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(52);
  const composingRef = useRef(false);
  const suppressCommitRef = useRef(false);
  const lastSubmitRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const dragDepthRef = useRef(0);

  // Per-tab draft while Composer stays mounted across session switches
  const draftBySessionRef = useRef(
    new Map<string, { text: string; attachments: Attachment[] }>()
  );
  const draftSessionIdRef = useRef<string | undefined>(sessionId);
  const textRef = useRef(text);
  const attachmentsRef = useRef(attachments);
  textRef.current = text;
  attachmentsRef.current = attachments;

  const [paletteTrigger, setPaletteTrigger] = useState<ActiveTrigger | null>(
    null
  );
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [mentionHits, setMentionHits] = useState<MentionHit[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const searchReqRef = useRef(0);
  const paletteTriggerRef = useRef<ActiveTrigger | null>(null);
  paletteTriggerRef.current = paletteTrigger;

  // CHAT-007: swap draft before paint so the wrong tab's text never flashes
  useLayoutEffect(() => {
    const prev = draftSessionIdRef.current;
    const next = sessionId;
    if (!next || prev === next) {
      if (next) draftSessionIdRef.current = next;
      return;
    }
    if (prev) {
      draftBySessionRef.current.set(prev, {
        text: textRef.current,
        attachments: attachmentsRef.current
      });
    }
    draftSessionIdRef.current = next;
    const parked = draftBySessionRef.current.get(next);
    setText(parked?.text ?? '');
    setAttachments(parked?.attachments ?? []);
    setPaletteTrigger(null);
    setMentionHits([]);
    // Comment: tab switch → focus input after draft paint
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [sessionId]);

  // Comment: same-tab re-click (and explicit focus requests) still focus the input
  useEffect(() => {
    if (!focusNonce || isInlineEdit) return;
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      debugLog('composer.attach', 'textarea focus (nonce)', { focusNonce });
    });
  }, [focusNonce, isInlineEdit]);

  // Comment: CHAT-012 — claim caret on mount so first paste does not require a prior click
  useLayoutEffect(() => {
    if (isInlineEdit) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    debugLog('composer.attach', 'textarea focus (mount)');
  }, [isInlineEdit]);

  // Comment: when workbench finally focuses the iframe, re-focus Composer (flaky claim)
  useEffect(() => {
    if (isInlineEdit) return;
    const onWinFocus = () => {
      if (document.visibilityState !== 'visible') return;
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
        debugLog('composer.attach', 'textarea focus (window focus)');
      });
    };
    window.addEventListener('focus', onWinFocus);
    document.addEventListener('visibilitychange', onWinFocus);
    return () => {
      window.removeEventListener('focus', onWinFocus);
      document.removeEventListener('visibilitychange', onWinFocus);
    };
  }, [isInlineEdit]);

  useEffect(() => {
    if (seedNonce <= 0 || seedText == null) return;
    setText(seedText);
    if (seedAttachments) {
      setAttachments([...seedAttachments]);
    }
    // Seed belongs to the active session draft
    const id = draftSessionIdRef.current || sessionId;
    if (id) {
      draftBySessionRef.current.set(id, {
        text: seedText,
        attachments: seedAttachments
          ? [...seedAttachments]
          : attachmentsRef.current
      });
    }
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
  }, [seedNonce, seedText, seedAttachments, sessionId]);

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
    // Keep parked draft in sync so tab switch does not revive sent text
    const id = draftSessionIdRef.current || sessionId;
    if (id) {
      draftBySessionRef.current.set(id, { text: '', attachments: [] });
    }
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
      // Comment: keep per-tab draft map warm so a remount/switch does not drop chips
      const sid = draftSessionIdRef.current || sessionId;
      if (sid) {
        draftBySessionRef.current.set(sid, {
          text: textRef.current,
          attachments: next
        });
      }
      return next;
    });
  }, [sessionId]);

  /** Replace a pending image chip path after host save (CHAT-012). */
  const finalizeImageAttachment = useCallback(
    (pendingId: string, chip: Attachment) => {
      setAttachments((prev) => {
        const next = prev.map((a) =>
          a.id === pendingId || a.path === pendingId ? { ...chip, id: chip.id || a.id } : a
        );
        if (!next.some((a) => a.id === (chip.id || pendingId) || a.path === chip.path)) {
          next.push({ ...chip, id: chip.id || pendingId });
        }
        const sid = draftSessionIdRef.current || sessionId;
        if (sid) {
          draftBySessionRef.current.set(sid, {
            text: textRef.current,
            attachments: next
          });
        }
        return next;
      });
    },
    [sessionId]
  );

  // Editor selection / host → attach chip
  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'attachments.add') return;
      const items = Array.isArray(data.items) ? data.items : [];
      const mapped: Attachment[] = items
        .filter((x: any) => x && (x.path || x.content))
        .map((x: any) => {
          const path = String(x.path || x.id || `att_${Date.now()}`);
          const content = x.content != null ? String(x.content) : undefined;
          const startLine =
            x.startLine != null && Number.isFinite(Number(x.startLine))
              ? Number(x.startLine)
              : undefined;
          const endLine =
            x.endLine != null && Number.isFinite(Number(x.endLine))
              ? Number(x.endLine)
              : undefined;
          const label = x.label != null ? String(x.label) : undefined;
          // Comment: host selection → file chip with range (never anonymous log)
          if (
            content &&
            path &&
            !/^(log_|snip_|att_)/.test(path) &&
            (x.type === 'snippet' || x.type === 'file' || startLine != null)
          ) {
            return makeSnippetAttachment(content, {
              path,
              label,
              startLine,
              endLine
            });
          }
          return {
            id: x.id ? String(x.id) : undefined,
            type: (['file', 'folder', 'snippet', 'log', 'symbol', 'codebase'].includes(
              x.type
            )
              ? x.type
              : content && (!x.path || /^(log_|snip_)/.test(path))
                ? 'log'
                : 'file') as Attachment['type'],
            path,
            content,
            startLine,
            endLine,
            label
          };
        });
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

  /** CHAT-012 — paste/drop image → optimistic chip, then host temp path */
  const saveImagesFromFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const api = getVsCodeApi();
      const ownerId = draftSessionIdRef.current || sessionId;

      for (const file of files.slice(0, 5)) {
        try {
          const dataUrl = await readFileAsDataUrl(file);
          const dataBase64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
          if (!dataBase64) continue;
          const mimeType = file.type || 'image/png';
          const label = file.name || 'Screenshot';
          const pendingId = `img_pending_${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 7)}`;
          // Comment: show chip immediately — waiting on host made paste feel like “need twice”
          const pending = makeImageAttachment({
            path: pendingId,
            mimeType,
            label,
            previewUrl: dataUrl
          });
          pending.id = pendingId;

          const activeNow = draftSessionIdRef.current || sessionId;
          if (!ownerId || activeNow === ownerId) {
            addAttachments([pending]);
          } else if (ownerId) {
            const prev = draftBySessionRef.current.get(ownerId) || {
              text: '',
              attachments: []
            };
            draftBySessionRef.current.set(ownerId, {
              ...prev,
              attachments: [...prev.attachments, pending]
            });
          }

          if (!api) continue;

          const requestId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              window.removeEventListener('message', onMsg);
              resolve();
            };
            const onMsg = (event: MessageEvent) => {
              const data = event.data;
              if (
                !data ||
                data.type !== 'attachments.saveImage.result' ||
                data.requestId !== requestId
              ) {
                return;
              }
              if (data.item?.path) {
                const chip = makeImageAttachment({
                  path: String(data.item.path),
                  mimeType: String(data.item.mimeType || mimeType),
                  label:
                    data.item.label != null ? String(data.item.label) : label,
                  previewUrl: dataUrl
                });
                chip.id = pendingId;
                const active = draftSessionIdRef.current || sessionId;
                if (!ownerId || active === ownerId) {
                  finalizeImageAttachment(pendingId, chip);
                } else if (ownerId) {
                  const prev = draftBySessionRef.current.get(ownerId) || {
                    text: '',
                    attachments: []
                  };
                  const nextAtt = prev.attachments.map((a) =>
                    a.id === pendingId || a.path === pendingId ? chip : a
                  );
                  if (!nextAtt.some((a) => a.id === pendingId || a.path === chip.path)) {
                    nextAtt.push(chip);
                  }
                  draftBySessionRef.current.set(ownerId, {
                    ...prev,
                    attachments: nextAtt
                  });
                }
              }
              finish();
            };
            window.addEventListener('message', onMsg);
            api.postMessage({
              type: 'attachments.saveImage',
              requestId,
              mimeType,
              dataBase64,
              fileName: file.name || undefined
            });
            window.setTimeout(finish, 8000);
          });
        } catch {
          /* skip unreadable blob */
        }
      }
    },
    [addAttachments, finalizeImageAttachment, sessionId]
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
      setTimeout(() => onRegenerate?.(), 100);
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

    // Pencil inline-edit: Esc closes without sending
    if (e.key === 'Escape' && isInlineEdit) {
      e.preventDefault();
      onDismiss?.();
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
    const next = e.target.value;
    setText(next);
    syncPalette(next, e.target.selectionStart ?? next.length);
  };

  /** CHAT-012 — OS clipboard via host (osascript/etc.); Files fallback if host misses */
  const requestHostClipboardImage = useCallback(
    (fallbackFiles?: File[]) => {
      const api = getVsCodeApi();
      if (!api) {
        debugLog('composer.attach', 'paste: no vscode api — Files fallback only', {
          fallbackCount: fallbackFiles?.length ?? 0
        });
        if (fallbackFiles?.length) void saveImagesFromFiles(fallbackFiles);
        return;
      }
      const ownerId = draftSessionIdRef.current || sessionId;
      const requestId = `clipimg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      debugLog('composer.attach', '→ readClipboardImage', {
        requestId,
        ownerId,
        fallbackCount: fallbackFiles?.length ?? 0
      });
      const onMsg = (event: MessageEvent) => {
        const data = event.data;
        if (
          !data ||
          data.type !== 'attachments.saveImage.result' ||
          data.requestId !== requestId
        ) {
          return;
        }
        window.removeEventListener('message', onMsg);
        if (!data.item?.path) {
          debugLog('composer.attach', '← readClipboardImage miss', {
            requestId,
            error: data.error ?? '(no path)',
            willFallback: Boolean(fallbackFiles?.length)
          });
          if (fallbackFiles?.length) void saveImagesFromFiles(fallbackFiles);
          return;
        }
        debugLog('composer.attach', '← readClipboardImage ok', {
          requestId,
          path: String(data.item.path),
          mime: data.item.mimeType
        });
        const chip = makeImageAttachment({
          path: String(data.item.path),
          mimeType: String(data.item.mimeType || 'image/png'),
          label:
            data.item.label != null ? String(data.item.label) : 'Screenshot.png'
        });
        const active = draftSessionIdRef.current || sessionId;
        if (!ownerId || active === ownerId) {
          addAttachments([chip]);
        } else if (ownerId) {
          const prev = draftBySessionRef.current.get(ownerId) || {
            text: '',
            attachments: []
          };
          draftBySessionRef.current.set(ownerId, {
            ...prev,
            attachments: [...prev.attachments, chip]
          });
        }
      };
      window.addEventListener('message', onMsg);
      api.postMessage({ type: 'attachments.readClipboardImage', requestId });
      window.setTimeout(() => {
        window.removeEventListener('message', onMsg);
      }, 8000);
    },
    [addAttachments, saveImagesFromFiles, sessionId]
  );

  // Comment: CHAT-012 — image paste → host clipboard; snapshot Files sync for fallback
  useEffect(() => {
    const onPasteCapture = (e: ClipboardEvent) => {
      const dt = e.clipboardData;
      if (!dt) return;
      const types = Array.from(dt.types || []);
      const files = collectImageFiles(dt);
      const looks = looksLikeImagePaste(dt);
      debugLog('composer.attach', 'paste capture', {
        looks,
        types,
        fileCount: files.length,
        sizes: files.map((f) => f.size),
        names: files.map((f) => f.name || '(empty)')
      });
      if (!looks) return;
      e.preventDefault();
      e.stopPropagation();
      // Comment: snapshot before paste ends — blobs revoke after handler returns
      const snap = files.length ? snapshotClipboardFiles(files) : Promise.resolve([]);
      void snap.then((stable) => {
        requestHostClipboardImage(stable.length ? stable : undefined);
      });
    };
    window.addEventListener('paste', onPasteCapture, true);
    return () => window.removeEventListener('paste', onPasteCapture, true);
  }, [requestHostClipboardImage]);

  // Comment: DnD — listen on window always (do not bail if ref null on first effect tick)
  useEffect(() => {
    if (isInlineEdit) return;
    let loggedEnter = false;
    const composerRoot = () =>
      composerRootRef.current ||
      (document.querySelector('[data-ak-composer-root="1"]') as HTMLElement | null);

    const onDocDragEnter = (e: DragEvent) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      // Comment: focus textarea while drag is over webview so drop/hover are not eaten
      if (document.activeElement !== textareaRef.current) {
        textareaRef.current?.focus();
        debugLog('composer.attach', 'dnd dragenter → focus textarea');
      }
      const root = composerRoot();
      if (root?.contains(e.target as Node)) {
        e.preventDefault();
        setDragOver(true);
      }
    };
    const onDocDragOver = (e: DragEvent) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      const root = composerRoot();
      const over = Boolean(root?.contains(e.target as Node));
      if (over) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        if (!loggedEnter) {
          loggedEnter = true;
          debugLog('composer.attach', 'dnd dragover enter composer', {
            types: Array.from(e.dataTransfer?.types || [])
          });
        }
        setDragOver(true);
      }
    };
    const onDocDrop = () => {
      dragDepthRef.current = 0;
      loggedEnter = false;
      setDragOver(false);
    };
    const onDocDragEnd = () => {
      dragDepthRef.current = 0;
      loggedEnter = false;
      setDragOver(false);
    };
    // Comment: also focus when user clicks anywhere in the chat shell (first click was "wasted")
    const onPointerDown = (e: PointerEvent) => {
      const root = composerRoot();
      if (!root) return;
      const t = e.target as Node;
      if (root.contains(t) && document.activeElement !== textareaRef.current) {
        // Let the click land; rAF focus keeps caret ready for immediate paste
        window.requestAnimationFrame(() => textareaRef.current?.focus());
      }
    };
    window.addEventListener('dragenter', onDocDragEnter, true);
    window.addEventListener('dragover', onDocDragOver, true);
    window.addEventListener('drop', onDocDrop, true);
    window.addEventListener('dragend', onDocDragEnd, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('dragenter', onDocDragEnter, true);
      window.removeEventListener('dragover', onDocDragOver, true);
      window.removeEventListener('drop', onDocDrop, true);
      window.removeEventListener('dragend', onDocDragEnd, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [isInlineEdit]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const dt = e.clipboardData;
    if (!dt) return;
    // Comment: capture handler owns image pastes; text/URI paths continue here
    if (looksLikeImagePaste(dt as unknown as DataTransfer)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const uris = collectUrisFromDataTransfer(dt as unknown as DataTransfer);
    if (uris.length && (dt.files?.length || dt.types.includes('text/uri-list'))) {
      e.preventDefault();
      resolveAndAdd(uris);
      return;
    }
    // Comment: VS Code editor selection paste → file chip with path/range
    const editorRaw =
      dt.getData('vscode-editor-data') || dt.getData('application/vnd.code.uri');
    const pasted = dt.getData('text/plain');
    if (editorRaw) {
      const parsed = parseVsCodeEditorClipboard(editorRaw);
      if (parsed?.path) {
        e.preventDefault();
        addAttachments([
          makeSnippetAttachment(pasted || '', {
            path: parsed.path,
            startLine: parsed.startLine,
            endLine: parsed.endLine
          })
        ]);
        return;
      }
    }
    // Multi-line paste → host resolves path from copy-time stash (Cmd/Ctrl+C).
    // No stash match → anonymous log chip.
    if (pasted && looksLikeLogOrSnippet(pasted)) {
      e.preventDefault();
      const api = getVsCodeApi();
      if (!api) {
        addAttachments([makeLogAttachment(pasted)]);
        return;
      }
      const requestId = `paste_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const onMsg = (event: MessageEvent) => {
        const data = event.data;
        if (
          !data ||
          data.type !== 'attachments.matchPaste.result' ||
          data.requestId !== requestId
        ) {
          return;
        }
        window.removeEventListener('message', onMsg);
        const item = data.item;
        if (item?.path && !/^(log_|snip_|att_)/.test(String(item.path))) {
          addAttachments([
            makeSnippetAttachment(String(item.content ?? pasted), {
              path: String(item.path),
              label: item.label != null ? String(item.label) : undefined,
              startLine:
                item.startLine != null && Number.isFinite(Number(item.startLine))
                  ? Number(item.startLine)
                  : undefined,
              endLine:
                item.endLine != null && Number.isFinite(Number(item.endLine))
                  ? Number(item.endLine)
                  : undefined
            })
          ]);
          return;
        }
        addAttachments([makeLogAttachment(pasted)]);
      };
      window.addEventListener('message', onMsg);
      api.postMessage({ type: 'attachments.matchPaste', requestId, content: pasted });
      window.setTimeout(() => {
        window.removeEventListener('message', onMsg);
      }, 4000);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasFileDrag(e.dataTransfer)) return;
    dragDepthRef.current += 1;
    debugLog('composer.attach', 'dnd dragenter', {
      depth: dragDepthRef.current,
      types: Array.from(e.dataTransfer.types || [])
    });
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
    if (!hasFileDrag(e.dataTransfer)) return;
    setDragOver(true);
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragOver(false);
    const types = Array.from(e.dataTransfer.types || []);
    const images = collectImageFiles(e.dataTransfer);
    const uris = collectUrisFromDataTransfer(e.dataTransfer);
    debugLog('composer.attach', 'dnd drop', {
      imageCount: images.length,
      uriCount: uris.length,
      shiftKey: e.shiftKey,
      types,
      uris: uris.slice(0, 5)
    });
    // Comment: without Shift, VS Code often never delivers this event (webview pointer-events)
    if (!e.shiftKey && !images.length && !uris.length) {
      debugLog(
        'composer.attach',
        'dnd drop empty — hold Shift while dropping editor tabs / explorer files'
      );
    }
    if (images.length) {
      const snap = snapshotClipboardFiles(images);
      void snap.then((stable) => saveImagesFromFiles(stable));
      return;
    }
    if (uris.length) {
      resolveAndAdd(uris);
      return;
    }
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
      ref={composerRootRef}
      data-ak-composer-root="1"
      className={`composer composer--cursor${dragOver ? ' drag-over' : ''}${
        isInlineEdit ? ' user-turn-composer' : ''
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragOver ? (
        <div className="composer-drop-hint" aria-live="polite">
          <span className="composer-drop-hint__title">Drop to attach</span>
          <span className="composer-drop-hint__sub">
            Hold <kbd>Shift</kbd> — required for editor tabs &amp; explorer
            <span className="composer-drop-hint__shift">
              {' '}
              (VS Code blocks webview DnD without Shift)
            </span>
          </span>
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
        <div
          className={`composer-box${dragOver ? ' composer-box--drag' : ''}`}
          title="Click to focus chat input"
          onMouseDown={(e) => {
            // Comment: box chrome click → focus textarea (toolbar/chips keep their own hit targets)
            const t = e.target as HTMLElement | null;
            if (!t) return;
            if (t.closest('textarea, button, select, a, input, label')) return;
            if (t.closest('.composer-toolbar, .composer-chip-remove, .composer-palette')) {
              return;
            }
            e.preventDefault();
            textareaRef.current?.focus();
          }}
        >
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
                const openable = isOpenableAttachment(a) || a.type === 'image';
                const isLog = a.type === 'log' && !openable;
                const isImage = a.type === 'image';
                return (
                  <span
                    key={id}
                    className={`composer-chip composer-chip--${
                      isImage ? 'image' : openable ? 'file' : a.type
                    }${a.startLine != null ? ' composer-chip--ranged' : ''}`}
                    title={
                      isImage
                        ? a.path
                        : openable
                        ? a.startLine != null
                          ? `${a.path}:${a.startLine}${
                              a.endLine != null ? `-${a.endLine}` : ''
                            }`
                          : a.path
                        : (a.content || '').slice(0, 500)
                    }
                  >
                    <span className="composer-chip-icon" aria-hidden>
                      {isImage && a.previewUrl ? (
                        <img
                          src={a.previewUrl}
                          alt=""
                          className="composer-chip-thumb"
                        />
                      ) : a.type === 'folder' ? (
                        '📁'
                      ) : isLog ? (
                        '📋'
                      ) : isImage ? (
                        '🖼'
                      ) : (
                        '📄'
                      )}
                    </span>
                    <button
                      type="button"
                      className="composer-chip-label"
                      onClick={() => {
                        // Comment: openable file chip → reveal in editor (link), not range prompt
                        if (openable) {
                          const api = getVsCodeApi();
                          api?.postMessage?.({
                            type: 'file.open',
                            path: a.path,
                            ...(a.startLine != null
                              ? { startLine: a.startLine }
                              : {}),
                            ...(a.endLine != null ? { endLine: a.endLine } : {})
                          });
                          return;
                        }
                        if (a.type !== 'log') editLineRange(a);
                      }}
                      title={
                        openable
                          ? `Open ${a.path}`
                          : a.type === 'file' || a.type === 'snippet'
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
                  // Mid-thread pencil edit opens down; footer new-input opens up.
                  menuPlacement={isInlineEdit ? 'down' : 'up'}
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

      {/* Footer usage — hide when Composer is embedded in a user bubble */}
      {!isInlineEdit ? (
        <div
          className="composer-usage"
          title={contextUsageTitle || contextUsageLabel || 'Context usage'}
        >
          <span className="composer-usage__icon" aria-hidden>
            ◔
          </span>
          <span className="composer-usage__text">
            {contextUsageLabel ||
              (usagePct > 0 ? `Context: ${usagePct}% used` : 'Context: —')}
          </span>
        </div>
      ) : null}
    </div>
  );
}
