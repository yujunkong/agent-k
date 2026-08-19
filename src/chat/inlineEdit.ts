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

/**
 * chat.send `inlineEdit` field (flat Agent request).
 * Also accepts nested `selection` if a host payload is passed through.
 */
export function parseInlineEditAgentRequest(
  data: unknown
): InlineEditAgentRequest | null {
  const root = asRecord(data);
  if (!root) return null;
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
    instruction: asString(root.instruction ?? src.instruction).trim(),
    selectedText,
    uri,
    languageId: asString(src.languageId || src.language).trim() || 'text',
    startLine: asInt(src.startLine),
    startColumn,
    endLine: asInt(src.endLine),
    endColumn
  };
}

export function inlineEditFsPath(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed.startsWith('file:')) {
    return trimmed.replace(/\\/g, '/');
  }
  try {
    const u = new URL(trimmed);
    let p = decodeURIComponent(u.pathname);
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    return p;
  } catch {
    return trimmed.replace(/^file:\/\//, '');
  }
}

/**
 * Protected system/sticky context for AgentLoop.
 * Instruction + exact range + selected source — not a composer dump.
 */
export function formatInlineEditSystemContext(
  request: InlineEditAgentRequest
): string {
  const file = inlineEditFileLabel(request.uri);
  const path = inlineEditFsPath(request.uri);
  const range = inlineEditRangeLabel(request);
  const lang = request.languageId || 'text';
  const body = request.selectedText.replace(/\s+$/, '');
  const readOffset = request.startLine + 1;
  const lineCount = inlineEditLineCount(request);
  const instruction =
    request.instruction.trim() || '(see the latest user message)';
  return [
    '## Inline Edit (mandatory this turn)',
    'You are applying a scoped editor selection edit. This is not a whole-file rewrite.',
    '',
    'Target:',
    `- uri: ${request.uri}`,
    `- path: ${path}`,
    `- file: ${file}`,
    `- languageId: ${lang}`,
    `- startLine: ${request.startLine} (0-based)`,
    `- startColumn: ${request.startColumn} (0-based)`,
    `- endLine: ${request.endLine} (0-based)`,
    `- endColumn: ${request.endColumn} (0-based)`,
    `- displayRange: ${range}`,
    '',
    'Instruction:',
    instruction,
    '',
    'Selected source (this MUST be edit_file hunks[].oldText — unique match):',
    `\`\`\`${lang}`,
    body,
    '```',
    '',
    'Rules:',
    `1. Call edit_file on path \`${path}\` only. Do not write_file or delete_file.`,
    '2. hunks[0].oldText MUST be the selected source above (or the smallest unique substring of it).',
    '3. hunks[0].newText is that region after applying the instruction. Change nothing else in the file.',
    `4. Optional: read_file with offset=${readOffset} and limit=${lineCount} before editing.`,
    '5. After the patch, briefly confirm the range you changed.'
  ].join('\n');
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
