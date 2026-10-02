/**
 * Parameterized harness policy — the ONLY write surface RRSI has into
 * Agent-K. A policy file is pure data (JSON, schema-validated); it can never
 * introduce code paths. Loader maps validated policies onto AgentLoopConfig
 * fields that already exist, so the loop keeps its stable surface.
 *
 * Layout (Agent-K root):
 *   harness/policies/verification.policy.json
 *   harness/policies/microloop.policy.json
 *   harness/policies/prefetch.policy.json
 *   harness/policies/worker.policy.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface VerificationPolicy {
  /** HARNESS-002 — verify-first exit gate. */
  verificationFirst: boolean;
  /** HARNESS-004 — post-edit lint micro-loop. */
  verificationMicroLoop: boolean;
  /** Ordered verification steps appended to the worker prompt. */
  steps: string[];
  /** Number of lint failures tolerated before the post-edit nudge hardens. */
  maxPostEditAttempts: number;
}

export interface MicroloopPolicy {
  /** Observe→act→verify cycle on by default for task intents. */
  enabled: boolean;
  /** Extra phase steps allowed by evolution (validated against enum). */
  extraSteps: string[];
}

export interface PrefetchPolicy {
  enabled: boolean;
  /** Heuristics the host may consult, in priority order. */
  signals: string[];
}

export interface WorkerPolicy {
  /** Extra system-prompt appendix (general procedure text only). */
  appendix: string;
  /** Max turns the worker may take. */
  maxTurns: number;
}

export interface HarnessPolicyBundle {
  verification: VerificationPolicy;
  microloop: MicroloopPolicy;
  prefetch: PrefetchPolicy;
  worker: WorkerPolicy;
}

const POLICY_FILES: Record<keyof HarnessPolicyBundle, string> = {
  verification: 'verification.policy.json',
  microloop: 'microloop.policy.json',
  prefetch: 'prefetch.policy.json',
  worker: 'worker.policy.json',
};

const ALLOWED_EXTRA_STEPS = new Set([
  'prefetch',
  'plan',
  'act',
  'targeted_verify',
  'inspect_evidence',
  'repair',
  'full_verify',
  'finalize',
]);

const ALLOWED_SIGNALS = new Set([
  'stack_trace',
  'error_message',
  'failing_test',
  'recent_edits',
  'open_editors',
  'workspace_rules',
  'git_status',
]);

export function defaultPolicy(): HarnessPolicyBundle {
  return {
    verification: {
      verificationFirst: true,
      verificationMicroLoop: true,
      steps: [
        'inspect git diff',
        'map requirements -> changed files',
        'run targeted tests',
        'run typecheck/lint',
        'verify each requirement',
        'only then finalize',
      ],
      maxPostEditAttempts: 3,
    },
    microloop: { enabled: true, extraSteps: [] },
    prefetch: { enabled: true, signals: ['stack_trace', 'error_message', 'open_editors'] },
    worker: { appendix: '', maxTurns: 25 },
  };
}

/**
 * Parse + validate one policy section. Unknown keys, out-of-enum values and
 * type drift are rejected (an RRSI proposer cannot smuggle new semantics in).
 */
export function validatePolicySection(
  kind: keyof HarnessPolicyBundle,
  raw: unknown
): { ok: true; value: unknown } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return { ok: false, errors: [`${kind}: not an object`] };
  const def = defaultPolicy()[kind] as unknown as Record<string, unknown>;
  for (const key of Object.keys(d)) {
    if (!(key in def)) errors.push(`${kind}: unknown key "${key}"`);
  }
  for (const [key, dv] of Object.entries(def)) {
    const v = (d as Record<string, unknown>)[key];
    if (v === undefined) continue;
    if (Array.isArray(dv) && !Array.isArray(v)) errors.push(`${kind}.${key}: expected array`);
    else if (typeof dv === 'boolean' && typeof v !== 'boolean')
      errors.push(`${kind}.${key}: expected boolean`);
    else if (typeof dv === 'string' && typeof v !== 'string')
      errors.push(`${kind}.${key}: expected string`);
    else if (typeof dv === 'number' && typeof v !== 'number')
      errors.push(`${kind}.${key}: expected number`);
  }
  if (kind === 'microloop' && Array.isArray(d.extraSteps)) {
    for (const s of d.extraSteps) {
      if (!ALLOWED_EXTRA_STEPS.has(String(s)))
        errors.push(`microloop.extraSteps: "${s}" not in enum`);
    }
  }
  if (kind === 'prefetch' && Array.isArray(d.signals)) {
    for (const s of d.signals) {
      if (!ALLOWED_SIGNALS.has(String(s)))
        errors.push(`prefetch.signals: "${s}" not in enum`);
    }
  }
  if (kind === 'worker' && typeof d.maxTurns === 'number') {
    if (!Number.isInteger(d.maxTurns) || d.maxTurns < 1 || d.maxTurns > 100)
      errors.push('worker.maxTurns: out of range 1..100');
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: raw };
}

/** Load a bundle from a directory; missing files fall back to defaults. */
export function loadPolicyBundle(dir: string): {
  bundle: HarnessPolicyBundle;
  errors: string[];
  loaded: string[];
} {
  const bundle = defaultPolicy();
  const errors: string[] = [];
  const loaded: string[] = [];
  if (!fs.existsSync(dir)) return { bundle, errors, loaded };
  for (const [kind, file] of Object.entries(POLICY_FILES) as Array<[keyof HarnessPolicyBundle, string]>) {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const res = validatePolicySection(kind as keyof HarnessPolicyBundle, raw);
      if (!res.ok) {
        errors.push(...res.errors);
        continue;
      }
      Object.assign(
        bundle[kind] as unknown as Record<string, unknown>,
        res.value
      );
      loaded.push(file);
    } catch (e) {
      errors.push(`${file}: ${String(e)}`);
    }
  }
  return { bundle, errors, loaded };
}

/** Apply a policy bundle onto AgentLoopConfig-compatible fields. */
export function policyToLoopConfig(bundle: HarnessPolicyBundle): {
  verificationFirst: boolean;
  verificationMicroLoop: boolean;
  maxTurns: number;
  workerAppendix: string;
} {
  return {
    verificationFirst: bundle.verification.verificationFirst,
    verificationMicroLoop: bundle.verification.verificationMicroLoop,
    maxTurns: bundle.worker.maxTurns,
    workerAppendix: bundle.worker.appendix,
  };
}
