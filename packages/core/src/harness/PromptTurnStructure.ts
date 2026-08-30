/**
 * HARNESS-007 — Turn structure rules for medium models.
 */
export const TURN_STRUCTURE_PROMPT = `
## Turn Structure Rules (HARNESS-007)

- Read-only tools may run in parallel; up to 12 tool calls per turn.
- Write tools (\`edit_file\`, \`write_file\`, \`delete_file\`, \`run_terminal_cmd\`): up to 6 per turn.
- Each tool result capped at 32KB; use windowed reads instead of whole files.
- Use exact tool JSON from schemas — no markdown tool-call dumps.
`.trim();

export function injectTurnStructure(systemPrompt: string): string {
  if (systemPrompt.includes('Turn Structure Rules')) return systemPrompt;
  const base = systemPrompt.trim();
  return base ? `${base}\n\n${TURN_STRUCTURE_PROMPT}` : TURN_STRUCTURE_PROMPT;
}
