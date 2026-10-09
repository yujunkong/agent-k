/**
 * V31-LOOP-01 — Phase prompt injector (short per-phase instruction block).
 * Idempotent: a previous `## Loop phase` block is replaced, never stacked.
 */
import type { LoopPhase } from '../loop/phases';

export const PHASE_PROMPTS: Record<LoopPhase, string> = {
  plan: 'Current phase: PLAN — decide the minimal next action before editing.',
  execute:
    'Current phase: EXECUTE — make the change with tools; keep prose minimal.',
  verify:
    'Current phase: VERIFY — run read_lints/tests on edited paths before finishing.',
  fix: 'Current phase: FIX — resolve the verification failures above, then re-verify.',
  done: 'Current phase: DONE — summarize what changed and the verification result.',
};

const PHASE_HEADER = '## Loop phase';

/** Append the current phase instruction; repeated calls do not stack. */
export function injectPhasePrompt(
  systemPrompt: string,
  phase: LoopPhase,
): string {
  const base = stripPhaseBlock(systemPrompt);
  return `${base}\n\n${PHASE_HEADER}\n${PHASE_PROMPTS[phase]}`;
}

function stripPhaseBlock(prompt: string): string {
  const marker = `\n\n${PHASE_HEADER}`;
  const idx = prompt.indexOf(marker);
  if (idx >= 0) return prompt.slice(0, idx).trimEnd();

  if (prompt.startsWith(PHASE_HEADER)) {
    const lines = prompt.split('\n');
    return lines.slice(2).join('\n').trim();
  }
  return prompt.trimEnd();
}
