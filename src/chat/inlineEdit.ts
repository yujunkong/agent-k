/**
 * Inline Edit (1-4d) — instruction stays in the composer; selection is context.
 * Do not dump selected code into seedText.
 */

export type InlineEditContext = {
  requestId?: string;
  uri: string;
  languageId: string;
  /** 0-based, VS Code Range.line */
  startLine: number;
  /** 0-based, VS Code Range.character */
  startColumn: number;
  endLine: number;
  endColumn: number;
  selectedText: string;
};

/** Structured fields on chat.send for the Agent (1-4e consumes this). */
export type InlineEditAgentRequest = {
  instruction: string;
  selectedText: string;
  uri: string;
  languageId: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return value == null ? '' : String(value);
}

function asInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * Host → webview `inline.edit.request`.
 * Accepts nested `selection` (InlineEditController) or a flat payload.
 */
export function parseInlineEditHostMessage(
  data: unknown
): { instruction: string; context: InlineEditContext } | null {
  const root = asRecord(data);
  if (!root) return null;
  if (root.type != null && root.type !== 'inline.edit.request') return null;

  const nested = asRecord(root.selection);
  const src = nested ?? root;
  const uri = asString(src.uri || src.file || src.path).trim();
  const selectedText = asString(src.selectedText ?? src.text);
  if (!uri || !selectedText) return null;

  const startColumn = asInt(
    src.startColumn != null ? src.startColumn : src.startCharacter
  );
  const endColumn = asInt(
    src.endColumn != null ? src.endColumn : src.endCharacter
  );

  return {
    instruction: asString(root.instruction).trim(),
    context: {
      requestId: root.requestId != null ? asString(root.requestId) : undefined,
      uri,
      languageId: asString(src.languageId || src.language).trim() || 'text',
      startLine: asInt(src.startLine),
      startColumn,
      endLine: asInt(src.endLine),
      endColumn,
      selectedText
    }
  };
}

export function toInlineEditAgentRequest(
  instruction: string,
  context: InlineEditContext
): InlineEditAgentRequest {
  return {
    instruction: instruction.trim(),
    selectedText: context.selectedText,
    uri: context.uri,
    languageId: context.languageId,
    startLine: context.startLine,
    startColumn: context.startColumn,
    endLine: context.endLine,
    endColumn: context.endColumn
  };
}

/** API/harness context only — never used as composer seedText. */
export function formatInlineEditForPayload(context: InlineEditContext): string {
  const file = inlineEditFileLabel(context.uri);
  const range = inlineEditRangeLabel(context);
  const lang = context.languageId || 'text';
  const body = context.selectedText.replace(/\s+$/, '');
  return [
    'Inline edit target:',
    `- file: ${file}`,
    `- uri: ${context.uri}`,
    `- range: ${range} (lines 1-based; columns 0-based)`,
    `- language: ${lang}`,
    `- startLine: ${context.startLine}`,
    `- startColumn: ${context.startColumn}`,
    `- endLine: ${context.endLine}`,
    `- endColumn: ${context.endColumn}`,
    '',
    'Selected code:',
    `\`\`\`${lang}`,
    body,
    '```'
  ].join('\n');
}

export function inlineEditFileLabel(uri: string): string {
  let path = uri.trim();
  if (path.startsWith('file:')) {
    try {
      const u = new URL(path);
      path = decodeURIComponent(u.pathname);
      if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
    } catch {
      path = path.replace(/^file:\/\//, '');
    }
  }
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join('/');
  return parts[0] || uri;
}

/** 1-based display range, e.g. L42-L58 */
export function inlineEditRangeLabel(context: InlineEditContext): string {
  const start = context.startLine + 1;
  const end = context.endLine + 1;
  return start === end ? `L${start}` : `L${start}-L${end}`;
}

export function inlineEditLineCount(context: InlineEditContext): number {
  const fromText = context.selectedText.split(/\r?\n/).length;
  const fromRange = Math.max(1, context.endLine - context.startLine + 1);
  return Math.max(fromText, fromRange);
}
