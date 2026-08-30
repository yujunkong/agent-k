/**
 * INLINE-003 — Inline edit prompt blocks for AgentLoop (host/core).
 */
export interface InlineEditAgentRequest {
  instruction: string;
  selectedText: string;
  uri: string;
  languageId: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export function inlineEditFsPath(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed.startsWith('file:')) return trimmed.replace(/\\/g, '/');
  try {
    const u = new URL(trimmed);
    let p = decodeURIComponent(u.pathname);
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    return p;
  } catch {
    return trimmed.replace(/^file:\/\//, '');
  }
}

function inlineEditFileLabel(uri: string): string {
  const path = inlineEditFsPath(uri);
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function inlineEditRangeLabel(req: InlineEditAgentRequest): string {
  return `${req.startLine + 1}:${req.startColumn + 1}-${req.endLine + 1}:${req.endColumn + 1}`;
}

/** Protected system context for scoped selection edit. */
export function formatInlineEditSystemContext(
  request: InlineEditAgentRequest,
): string {
  const path = inlineEditFsPath(request.uri);
  const range = inlineEditRangeLabel(request);
  return [
    '## Inline Edit (mandatory this turn)',
    'Apply a scoped editor selection edit — not a whole-file rewrite.',
    '',
    `Target: ${inlineEditFileLabel(request.uri)} (${path})`,
    `Range: ${range} (${request.languageId || 'text'})`,
    '',
    'Rules:',
    `1. edit_file on \`${path}\` only.`,
    '2. hunk oldText = selected source in sticky context.',
    '3. Change only the selected region.',
  ].join('\n');
}

/** Sticky: instruction + selected source. */
export function formatInlineEditStickyContext(
  request: InlineEditAgentRequest,
): string {
  const lang = request.languageId || 'text';
  const instruction =
    request.instruction.trim() || '(no instruction — improve the selection)';
  return [
    '## Inline Edit Selection',
    `Instruction: ${instruction}`,
    '',
    `Selected (${inlineEditRangeLabel(request)}):`,
    '```' + lang,
    request.selectedText.replace(/\s+$/, ''),
    '```',
  ].join('\n');
}
