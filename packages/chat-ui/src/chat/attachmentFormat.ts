/**
 * Attachment helpers — line ranges + log/snippet chips
 */
import type { Attachment } from './types';

export function attachmentId(a: Attachment): string {
  if (a.id) return a.id;
  const range =
    a.startLine != null
      ? `:${a.startLine}${a.endLine != null ? `-${a.endLine}` : ''}`
      : '';
  return `${a.type}:${a.path}${range}`;
}

/** Synthetic chip path (paste log / anonymous snippet) — not openable. */
export function isSyntheticAttachmentPath(path?: string): boolean {
  if (!path) return true;
  return /^(log_|snip_|att_)/.test(path);
}

/** File / editor selection with a real workspace path — openable chip. */
export function isOpenableAttachment(a: Attachment): boolean {
  if (a.type === 'folder' || a.type === 'log') return false;
  if (a.type === 'file' || a.type === 'snippet' || a.type === 'symbol') {
    return !isSyntheticAttachmentPath(a.path);
  }
  return !isSyntheticAttachmentPath(a.path);
}

function basenamePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || path;
}

function lineCountLabel(content?: string): string | null {
  if (!content) return null;
  const lines = content.replace(/\r\n/g, '\n').split('\n').length;
  return lines > 1 ? `${lines} lines` : null;
}

export function attachmentDisplayLabel(a: Attachment): string {
  if (a.type === 'image') {
    return a.label || basenamePath(a.path) || 'Screenshot';
  }
  // Comment: editor selection / file range → filename + lines; never "log (N) (N)"
  if (isOpenableAttachment(a) || (a.type === 'file' && a.path)) {
    const name =
      (a.label && !/^log\b/i.test(a.label) && !/^selection$/i.test(a.label)
        ? a.label
        : null) || basenamePath(a.path);
    if (a.startLine != null && a.endLine != null && a.endLine !== a.startLine) {
      return `${name} (${a.startLine}-${a.endLine})`;
    }
    if (a.startLine != null) {
      return `${name} (${a.startLine})`;
    }
    return name;
  }

  if (a.type === 'log' || a.type === 'snippet') {
    const count = lineCountLabel(a.content);
    const raw = (a.label || (a.type === 'log' ? 'log' : 'snippet')).trim();
    // Avoid "log (6 lines) (6 lines)" when makeLogAttachment already baked count
    if (/\(\d+\s*lines?\)/i.test(raw)) return raw;
    return count ? `${raw} (${count})` : raw;
  }

  const name = basenamePath(a.path);
  if (a.startLine != null && a.endLine != null && a.endLine !== a.startLine) {
    return `${name} (${a.startLine}-${a.endLine})`;
  }
  if (a.startLine != null) {
    return `${name} (${a.startLine})`;
  }
  return name;
}

/** Multi-line / log-like paste → attach as chip instead of dumping into textarea */
export function looksLikeLogOrSnippet(text: string): boolean {
  const t = text.replace(/\r\n/g, '\n');
  if (!t.trim()) return false;
  const lines = t.split('\n');
  if (lines.length >= 3) return true;
  if (t.length >= 280 && lines.length >= 2) return true;
  if (
    /^\s*(\[?\d{4}-\d{2}-\d{2}|ERROR|WARN|WARNING|INFO|DEBUG|FATAL|Exception|Traceback|at\s+\S+\()/m.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

export function makeLogAttachment(content: string, label?: string): Attachment {
  const body = content.replace(/\r\n/g, '\n');
  const id = `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    type: 'log',
    path: id,
    // Comment: bare "log" — displayLabel appends "(N lines)" once
    label: label || 'log',
    content: body.slice(0, 200_000)
  };
}

/** CHAT-012 — screenshot / image chip after host save. */
export function makeImageAttachment(opts: {
  path: string;
  mimeType?: string;
  label?: string;
  previewUrl?: string;
}): Attachment {
  const id = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const name =
    opts.label ||
    basenamePath(opts.path) ||
    'Screenshot';
  return {
    id,
    type: 'image',
    path: opts.path,
    label: name,
    mimeType: opts.mimeType || 'image/png',
    previewUrl: opts.previewUrl
  };
}

export function makeSnippetAttachment(
  content: string,
  opts?: { path?: string; label?: string; startLine?: number; endLine?: number }
): Attachment {
  const body = content.replace(/\r\n/g, '\n');
  const id = `snip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const path = opts?.path || id;
  const name = opts?.label || (opts?.path ? basenamePath(opts.path) : 'selection');
  // Comment: real path → file chip (openable); anonymous paste stays snippet
  if (opts?.path && !isSyntheticAttachmentPath(opts.path)) {
    return {
      id,
      type: 'file',
      path,
      label: name,
      content: body.slice(0, 200_000),
      startLine: opts?.startLine,
      endLine: opts?.endLine
    };
  }
  return {
    id,
    type: 'snippet',
    path,
    label: name,
    content: body.slice(0, 200_000),
    startLine: opts?.startLine,
    endLine: opts?.endLine
  };
}

/**
 * Parse VS Code editor clipboard payload (drag/copy selection → file + range).
 * Returns null when the payload is missing or not a file selection.
 */
export function parseVsCodeEditorClipboard(
  raw: string
): {
  path: string;
  content?: string;
  startLine?: number;
  endLine?: number;
} | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const resource = String(data.resource || data.uri || '').trim();
    if (!resource) return null;
    let path = resource;
    if (resource.startsWith('file:')) {
      try {
        const u = new URL(resource);
        path = decodeURIComponent(u.pathname);
        if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
      } catch {
        path = resource.replace(/^file:\/\//, '');
      }
    }
    const selections = Array.isArray(data.selections) ? data.selections : [];
    const sel = selections[0] as Record<string, unknown> | undefined;
    const startLine =
      sel && Number.isFinite(Number(sel.startLineNumber))
        ? Number(sel.startLineNumber)
        : undefined;
    const endLine =
      sel && Number.isFinite(Number(sel.endLineNumber))
        ? Number(sel.endLineNumber)
        : startLine;
    return { path, startLine, endLine };
  } catch {
    return null;
  }
}

/** Parse "10-30", "10", "L10-L30" → range */
export function parseLineRangeInput(raw: string): { startLine?: number; endLine?: number } | null {
  const s = raw.trim();
  if (!s) return {}; // clear range
  const m =
    s.match(/^L?(\d+)\s*[-–—:]\s*L?(\d+)$/i) ||
    s.match(/^(\d+)\s*[-–—]\s*(\d+)$/) ||
    s.match(/^L?(\d+)$/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] != null ? Number(m[2]) : a;
  if (!Number.isFinite(a) || a < 1) return null;
  const startLine = Math.min(a, b);
  const endLine = Math.max(a, b);
  return { startLine, endLine };
}

/**
 * Build API context for attachments (mentions + inline log/snippet bodies).
 */
export function formatAttachmentsForPayload(files: Attachment[]): string {
  if (!files.length) return '';
  const parts: string[] = [];
  for (const f of files) {
    if (f.type === 'image') {
      // Comment: skip optimistic pending chips until host path lands
      if (!String(f.path || '').startsWith('img_pending_')) {
        parts.push(`@image:${f.path}`);
      }
      continue;
    }
    if (f.type === 'folder') {
      parts.push(`@folder:${f.path}`);
      continue;
    }
    if (f.type === 'log' || (f.type === 'snippet' && isSyntheticAttachmentPath(f.path))) {
      const label = f.label || f.path;
      const body = (f.content || '').slice(0, 100_000);
      parts.push(
        [
          `Attached ${f.type}: ${label}`,
          '```',
          body,
          '```'
        ].join('\n')
      );
      continue;
    }
    // file / snippet with path / symbol / codebase
    const range =
      f.startLine != null
        ? f.endLine != null && f.endLine !== f.startLine
          ? `:${f.startLine}-${f.endLine}`
          : `:${f.startLine}`
        : '';
    if (f.content?.trim()) {
      parts.push(
        [
          `@file:${f.path}${range}`,
          '```',
          f.content.trim().slice(0, 100_000),
          '```'
        ].join('\n')
      );
    } else {
      parts.push(`@file:${f.path}${range}`);
    }
  }
  return parts.join('\n\n');
}
