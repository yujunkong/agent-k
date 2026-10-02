/**
 * Critic LLM layer — port of rrsi/critic.py `review`.
 *
 * Reads the candidate diff BEFORE any evaluation is spent and rejects
 * leakage / degenerate / grader-gaming / undeclared-bundling / runtime-
 * memory-leak / unbounded-work edits. The deterministic precheck lives in
 * critic.ts; this module adds the model review with bounded retries.
 */

import { screenDiff, type CriticPattern } from './critic';
import type { GenerateFn } from './propose';

const CRITIC_SYSTEM = `You are a strict reviewer of agent harness (scaffold) policy
changes in an evolution loop. The harness is evolved against the very tasks it
is measured on, so anti-overfitting review is critical. The change was made by
another model in response to aggregated failure modes. Your job: catch changes
that would be cheating, degenerate, or self-destructive.

REJECT if ANY of:

1. LEAKAGE / TASK-SPECIALIZATION: hard-codes knowledge of specific evolve-set
   tasks: task names or ids, entity/case names, task-specific file names,
   expected outputs or answers, magic constants meaningful only for one task,
   per-task templates, or branching on task-identifying features. General
   professional practice and general procedure are fine. Litmus test: would
   this change still make sense on an unfamiliar task from a different suite?
2. DEGENERATE: effectively a no-op while claiming a mechanism, or it
   disables an existing safety mechanism (output truncation, error handling,
   termination guards) without a working replacement.
3. GRADER GAMING: tries to read/detect/influence the verifier at runtime,
   hard-codes thresholds that could only have come from a grader, or games
   the output format for the grader rather than improving real performance.
4. UNDECLARED BUNDLING: reject only if the diff contains independent changes
   not covered by ANY declared edit.
5. RUNTIME MEMORY LEAKAGE: if the change persists/injects runtime data across
   trials (captured file contents, tool outputs, answers, task names),
   that is memorization, not a general improvement.
6. UNBOUNDED WORK: an added retry/"keep improving" loop with no give-up path.

Otherwise ACCEPT. You review intent and content, not style. Return STRICT
JSON: {"verdict": "accept" | "reject", "reasons": ["..."], "risk_notes": ["..."]}`;

export interface CriticVerdict {
  verdict: 'accept' | 'reject';
  reasons: string[];
  riskNotes: string[];
}

/** Deterministic + LLM review. `hard` rejections short-circuit the model. */
export async function reviewDiff(input: {
  generate: GenerateFn;
  diff: string;
  summary: string;
  targetsMode: string;
  declaredEdits: Array<Record<string, unknown>>;
  domainPatterns?: CriticPattern[];
  maxAttempts?: number;
}): Promise<CriticVerdict> {
  const hard = screenDiff(input.diff, input.domainPatterns ?? []);
  if (hard.length) {
    return { verdict: 'reject', reasons: hard.map((h) => `precheck: ${h}`), riskNotes: [] };
  }
  if (!input.diff.trim()) {
    return { verdict: 'reject', reasons: ['empty diff'], riskNotes: [] };
  }
  const payload = [
    `CANDIDATE SUMMARY: ${input.summary}`,
    `TARGETS: ${input.targetsMode}`,
    '',
    '=== DECLARED EDITS ===',
    JSON.stringify(input.declaredEdits, null, 1).slice(0, 20_000),
    '',
    '=== DIFF ===',
    input.diff.slice(0, 120_000),
  ].join('\n');

  const attempts = input.maxAttempts ?? 3;
  let last = '';
  for (let i = 0; i < attempts; i++) {
    const out = await input.generate({ system: CRITIC_SYSTEM, prompt: payload });
    last = out;
    try {
      const start = out.indexOf('{');
      const end = out.lastIndexOf('}');
      if (start < 0 || end <= start) continue;
      const v = JSON.parse(out.slice(start, end + 1)) as {
        verdict?: string;
        reasons?: string[];
        risk_notes?: string[];
      };
      if (v.verdict === 'accept' || v.verdict === 'reject') {
        return {
          verdict: v.verdict,
          reasons: Array.isArray(v.reasons) ? v.reasons : [],
          riskNotes: Array.isArray(v.risk_notes) ? v.risk_notes : [],
        };
      }
    } catch {
      /* retry */
    }
  }
  return {
    verdict: 'reject',
    reasons: [`critic output unparseable after ${attempts} attempts: ${last.slice(0, 200)}`],
    riskNotes: [],
  };
}
