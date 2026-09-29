/**
 * V31-FRAME-01 — pull a problem_frame JSON block out of model text.
 * Malformed blocks are ignored. observationDone always starts false.
 */
import type { ProblemFrame } from '@agent-k/shared';

const BLOCK = /<problem_frame>\s*([\s\S]*?)\s*<\/problem_frame>/i;

export function parseProblemFrame(text: string | undefined): ProblemFrame | null {
  if (!text) return null;
  const match = BLOCK.exec(text);
  if (!match) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const intentRaw = obj.intent;
  if (!intentRaw || typeof intentRaw !== 'object') return null;
  const intent = intentRaw as Record<string, unknown>;
  const outcome = str(intent.outcome);
  if (!outcome) return null;
  const hypotheses = Array.isArray(obj.hypotheses)
    ? obj.hypotheses
        .map((h) => {
          if (!h || typeof h !== 'object') return null;
          const row = h as Record<string, unknown>;
          const claim = str(row.claim);
          const killIf = str(row.killIf);
          if (!claim || !killIf) return null;
          return { claim, killIf };
        })
        .filter((h): h is { claim: string; killIf: string } => h != null)
        .slice(0, 3)
    : [];
  return {
    intent: {
      outcome,
      constraints: strList(intent.constraints),
      ambiguous: intent.ambiguous === true,
      clarifyQuestion: str(intent.clarifyQuestion) || undefined,
    },
    symptom: str(obj.symptom),
    doneWhen: str(obj.doneWhen),
    hypotheses,
    nonGoals: strList(obj.nonGoals),
    observationDone: false,
  };
}

/** Thought line. Raw reasoning is not forwarded. */
export function formatFrameSummary(frame: ProblemFrame): string {
  const hyps = frame.hypotheses
    .map((h) => `- ${h.claim} (drop if ${h.killIf})`)
    .join('\n');
  return [
    `outcome: ${frame.intent.outcome}`,
    frame.intent.constraints.length
      ? `constraints: ${frame.intent.constraints.join('; ')}`
      : '',
    frame.doneWhen ? `doneWhen: ${frame.doneWhen}` : '',
    hyps,
    frame.nonGoals.length ? `nonGoals: ${frame.nonGoals.join('; ')}` : '',
    frame.intent.ambiguous
      ? `clarify: ${frame.intent.clarifyQuestion ?? 'one question'}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(str).filter(Boolean);
}
