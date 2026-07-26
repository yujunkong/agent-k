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

export function attachmentDisplayLabel(a: Attachment): string {
  if (a.type === 'log' || a.type === 'snippet') {
    const base = a.label || 'snippet';
    const lines = (a.content || '').split(/\r?\n/).length;
    return lines > 1 ? `${base} (${lines} lines)` : base;
  }
  const name = a.path.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || a.path;
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
  const lineCount = body.split('\n').length;
  return {
    id,
    type: 'log',
    path: id,
    label: label || `log (${lineCount} lines)`,
    content: body.slice(0, 200_000)
  };
}

export function makeSnippetAttachment(
  content: string,
  opts?: { path?: string; label?: string; startLine?: number; endLine?: number }
): Attachment {
  const body = content.replace(/\r\n/g, '\n');
  const id = `snip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    type: 'snippet',
    path: opts?.path || id,
    label: opts?.label || 'selection',
    content: body.slice(0, 200_000),
    startLine: opts?.startLine,
    endLine: opts?.endLine
  };
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
    if (f.type === 'folder') {
      parts.push(`@folder:${f.path}`);
      continue;
    }
    if (f.type === 'log' || f.type === 'snippet') {
      const label = f.label || f.path;
      const range =
        f.startLine != null
          ? f.endLine != null && f.endLine !== f.startLine
            ? `:${f.startLine}-${f.endLine}`
            : `:${f.startLine}`
          : '';
      const src = f.path && !f.path.startsWith('log_') && !f.path.startsWith('snip_')
        ? ` (${f.path}${range})`
        : '';
      const body = (f.content || '').slice(0, 100_000);
      parts.push(
        [
          `Attached ${f.type}${src}: ${label}`,
          '```',
          body,
          '```'
        ].join('\n')
      );
      continue;
    }
    // file / symbol / codebase
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
