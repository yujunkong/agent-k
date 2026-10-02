/**
 * Proposer + Analyst LLM roles — ported from rrsi/propose.py / analyst.py.
 *
 * The search roles talk to a model through an injected `GenerateFn` so
 * Agent-K can route them through its own provider stack. The proposer edits
 * ONLY policy JSON files (data, not code) — the diff is validated against
 * the policy schema before it can become a candidate.
 */

import { recoverComponent, textOnly } from './components';
import type { Component, Edit } from '../types';

export type GenerateFn = (input: {
  system: string;
  prompt: string;
}) => Promise<string>;

export interface PolicyEditProposal {
  file: string;
  /** Full new JSON content for the policy file. */
  content: string;
  component: Component;
  hypothesis: string;
  targetsMode?: string;
  triggerCondition?: string;
}

const PROPOSER_SYSTEM = `You are a harness engineer for the Agent-K coding agent.
The policy LLM is frozen; you evolve the HARNESS by editing policy files
(verification.prefetch/worker/microloop JSON) — never agent source code.
Respond with EXACTLY ONE JSON object, no prose:
{"edits": [
  {"file": "verification.policy.json" | "microloop.policy.json" |
           "prefetch.policy.json" | "worker.policy.json",
   "content": "<full new JSON content for that file>",
   "component": "prompt|control_flow|config|output_plumbing|context_mgmt|client_tool|skill|memory|subagent",
   "hypothesis": "one sentence: the mechanism and WHY it should move the score",
   "targets_mode": "failure mode it targets",
   "trigger_condition": "checkable activation condition"}
]}
Rules: at most b_t edits. General procedures only — no task names, no
expected answers, no per-task templates. Every edit must still make sense on
an unfamiliar task from a different suite.`;

const ANALYST_SYSTEM = `You are the batch analyst in a harness-evolution loop.
You receive digests of failed and successful agent runs and produce a
three-lens report. Respond with EXACTLY ONE JSON object:
{"failure_modes": [{"mode": "...", "evidence": ["..."], "count": 1}],
 "capability_gaps": ["..."],
 "success_habits": ["..."]}`;

/** Extract the first JSON object from a model reply. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in reply');
  return JSON.parse(text.slice(start, end + 1));
}

export interface AnalyzeReport {
  failureModes: Array<{ mode: string; evidence: string[]; count: number }>;
  capabilityGaps: string[];
  successHabits: string[];
}

/** Analyze(H_t, D) -> F_t (Algorithm 1, line 1). */
export async function analyze(
  generate: GenerateFn,
  digests: string[]
): Promise<AnalyzeReport> {
  const prompt =
    `Digests of the incumbent's runs (failure lens first):\n\n` +
    digests.map((d, i) => `--- digest ${i + 1} ---\n${d}`).join('\n\n');
  const raw = await generate({ system: ANALYST_SYSTEM, prompt });
  const obj = extractJson(raw) as Record<string, unknown>;
  return {
    failureModes: Array.isArray(obj.failure_modes)
      ? (obj.failure_modes as AnalyzeReport['failureModes'])
      : [],
    capabilityGaps: Array.isArray(obj.capability_gaps)
      ? (obj.capability_gaps as string[])
      : [],
    successHabits: Array.isArray(obj.success_habits)
      ? (obj.success_habits as string[])
      : [],
  };
}

export interface ProposeInput {
  generate: GenerateFn;
  /** Current policy files: name -> JSON string. */
  currentPolicies: Record<string, string>;
  report: AnalyzeReport;
  /** Annealed budget b_t. */
  budget: number;
  /** Components to prune (do not re-propose). */
  pruneSet: string[];
  historyRows: string[];
}

/** Propose ≤ b_t policy edits targeting the report's failure modes. */
export async function proposeEdits(
  input: ProposeInput
): Promise<PolicyEditProposal[]> {
  const prompt = [
    `b_t = ${input.budget} (max edits this round).`,
    input.pruneSet.length
      ? `Pruned components (do NOT re-propose): ${input.pruneSet.join(', ')}`
      : '',
    'Edit history (do not redraw falsified hypotheses):',
    input.historyRows.length ? input.historyRows.join('\n') : '(none yet)',
    '',
    'Current policy files:',
    ...Object.entries(input.currentPolicies).map(
      ([f, c]) => `--- ${f} ---\n${c}`
    ),
    '',
    'Failure modes to target:',
    ...input.report.failureModes.map(
      (m) => `- ${m.mode} (x${m.count}): ${m.evidence.join(' | ')}`
    ),
    ...(input.report.capabilityGaps.length
      ? ['Capability gaps:', ...input.report.capabilityGaps.map((g) => `- ${g}`)]
      : []),
    ...(input.report.successHabits.length
      ? ['Keep these success habits:', ...input.report.successHabits.map((h) => `- ${h}`)]
      : []),
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await input.generate({ system: PROPOSER_SYSTEM, prompt });
  const obj = extractJson(raw) as { edits?: Array<Record<string, unknown>> };
  const edits = (obj.edits ?? []).slice(0, input.budget);
  return edits.map((e, i) => {
    const file = String(e.file ?? 'verification.policy.json');
    const declared = String(e.component ?? '');
    const content = String(e.content ?? '');
    // Tag validation: recover from content when the declaration is missing
    // or invalid so a mislabelled edit cannot pass (rrsi/components.py).
    const component = isValidComponent(declared)
      ? (declared as Component)
      : recoverComponent(content ? `+ ${content}` : '');
    return {
      file,
      content,
      component,
      hypothesis: String(e.hypothesis ?? ''),
      targetsMode: e.targets_mode ? String(e.targets_mode) : undefined,
      triggerCondition: e.trigger_condition ? String(e.trigger_condition) : undefined,
      ...(i >= input.budget ? {} : {}),
    };
  });
}

function isValidComponent(c: string): boolean {
  return (
    [
      'prompt',
      'control_flow',
      'config',
      'output_plumbing',
      'context_mgmt',
      'client_tool',
      'skill',
      'memory',
      'subagent',
    ].includes(c)
  );
}

/** Convert a policy proposal into an Edit record for the history. */
export function toEdit(p: PolicyEditProposal): Edit {
  return {
    id: '',
    component: p.component,
    hypothesis: p.hypothesis,
    targetsMode: p.targetsMode,
    triggerCondition: p.triggerCondition,
  };
}

/** Guard: policy-file-only writes. Any path outside the policy set is rejected. */
export const POLICY_FILES = new Set([
  'verification.policy.json',
  'microloop.policy.json',
  'prefetch.policy.json',
  'worker.policy.json',
]);

export function isPolicyFile(file: string): boolean {
  return POLICY_FILES.has(file);
}

/** Re-export for the loop: prompt-only edits are always safe to tag. */
export { textOnly };
