/**
 * HARNESS-002 — Verification-first protocol prompt (v2.1 VerificationFirstPrompt port).
 * Injected into protected system slot when harness.verificationFirst is enabled.
 */

export const VERIFICATION_FIRST_PROMPT = `
## Verification-First Protocol (HARNESS-002)

Follow **gather → act → verify** each turn. Do not stop with a final answer until verification passes.

### Pre-edit
1. **Read first** — \`read_file\` / \`read_files\` before \`edit_file\` / \`write_file\`.
2. **Plan briefly** — one-line intent before broad edits.
3. **Ask once** — use \`ask_question\` only when a single irreversible decision is blocked.

### Post-edit (verify phase)
4. After every \`edit_file\` or \`write_file\`, run \`read_lints\` on touched paths.
5. Fix lint/type errors before declaring done.
6. Run relevant tests when the task implies it (\`run_terminal_cmd\`).

### Exit criteria (/goal-like)
7. Before finishing with no more tools: confirm lints are clean on files you edited this run.
8. Errors from tools are data — read, fix, retry (up to harness retry cap).
9. Do not end with "I'll write…" prose — call the write tool, then verify.

Remember: verify first, restrict later.
`.trim();

/** Idempotent inject — skips when block already present. */
export function injectVerificationFirst(systemPrompt: string): string {
  if (systemPrompt.includes('Verification-First Protocol')) {
    return systemPrompt;
  }
  const base = systemPrompt.trim();
  return base ? `${base}\n\n${VERIFICATION_FIRST_PROMPT}` : VERIFICATION_FIRST_PROMPT;
}
