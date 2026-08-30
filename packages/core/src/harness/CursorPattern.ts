/**
 * HARNESS-007 — Cursor operating pattern prompt inject.
 */
export const CURSOR_PATTERN_PROMPT = `
## Cursor Operating Pattern (HARNESS-007)

Follow gather → explore → plan → execute → verify → close:
- User-visible text stays short: verdict / what changed first; skip padded summaries.
- Search (\`grep\` / \`glob\` / \`codebase_search\`) before \`read_file\`.
- Batch reads (up to 12 paths per turn); window ~250 lines around hits.
- Real edits via \`write_file\` / \`edit_file\` only — never markdown "Edit N:" theater.
- Verify with \`read_lints\` after edits; fix before finishing.
`.trim();

export function injectCursorPattern(systemPrompt: string): string {
  if (systemPrompt.includes('Cursor Operating Pattern')) return systemPrompt;
  const base = systemPrompt.trim();
  return base ? `${base}\n\n${CURSOR_PATTERN_PROMPT}` : CURSOR_PATTERN_PROMPT;
}
