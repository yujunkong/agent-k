/**
 * HARNESS-007 — Cursor operating pattern prompt inject.
 * Comment: V31-THOUGHT — thinking-channel brevity (Cursor-short mid-explore).
 */
export const CURSOR_PATTERN_PROMPT = `
## Cursor Operating Pattern (HARNESS-007)

Follow gather → explore → plan → execute → verify → close:
- User-visible text stays short: verdict / what changed first; skip padded summaries.
- Search (\`grep\` / \`glob\` / \`codebase_search\`) before \`read_file\`.
- Batch reads (up to 12 paths per turn); window ~250 lines around hits.
- Real edits via \`write_file\` / \`edit_file\` only — never markdown "Edit N:" theater.
- Verify with \`read_lints\` after edits; fix before finishing.

### Thinking channel (keep Cursor-short)
- Put deep chain-of-thought **only** in the thinking/reasoning channel — not in user-visible content.
- **Opening Thought** (before first tools): at most **3–5 short sentences** — goal + next tool batch. No essay.
- **Mid-explore Thought** (between tool rounds): at most **2–4 short sentences** naming what you learned and the next tool. Do **not** restate long plans or dump file contents into thinking.
- Prefer one-sentence progress lines when continuing exploration; finish thinking quickly and call tools.
- Save longer analysis for the **final user-visible answer** after tools finish.
`.trim();

export function injectCursorPattern(systemPrompt: string): string {
  if (systemPrompt.includes('Cursor Operating Pattern')) return systemPrompt;
  const base = systemPrompt.trim();
  return base ? `${base}\n\n${CURSOR_PATTERN_PROMPT}` : CURSOR_PATTERN_PROMPT;
}
