/**
 * Evolve set — the task bundle RRSI evolves against (rrsi `domains/<name>/`).
 *
 * Layout (Agent-K root or global storage):
 *   evolve/
 *     tasks/*.json        — TaskSpecFile list (id, prompt, repo, verify)
 *     heldout/*.json      — optional OOD set (never evolved on)
 *
 * A task file is data: the coding adapter maps `verify` commands onto the
 * host's own executors (run_terminal_cmd/read_lints), never new code paths.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Domain,
  scoreRuns,
  type TaskRunOutput,
  type TaskSpec,
} from './domain';
import type { EvalResult } from '../types';

export interface VerifyStep {
  /** Shell command run in the task repo (e.g. "npm test -w pkg"). */
  cmd: string;
  /** Expected exit code; default 0. */
  expectExit?: number;
  /** Treat stderr patterns as non-fatal (regex source). */
  ignoreStderr?: string[];
}

export interface TaskSpecFile {
  id: string;
  prompt: string;
  /** Absolute or evolve-set-relative repo to run in. */
  repo?: string;
  /** Verification evidence collected AFTER the agent finishes. */
  verify: VerifyStep[];
  /** Requirement list mapped 1:1 onto verification steps. */
  requirements?: string[];
  timeoutMs?: number;
}

export interface EvolveSetDeps {
  /** Run a shell command in a directory; returns exit code + stdout/stderr. */
  exec: (
    cmd: string,
    cwd: string
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  /** The agent run itself — provided by the host loop bridge. */
  runAgent: (task: TaskSpec, ctx: { policyDir: string; worktreePath?: string }) => Promise<{
    completed: boolean;
    stopReason?: string;
    testsPassed?: number;
    testsFailed?: number;
    lintErrors?: number;
    requirementsVerified?: boolean;
    tokens?: number;
    toolCalls?: number;
    transcript?: string;
  }>;
}

export function loadTaskSpecs(dir: string): TaskSpecFile[] {
  const taskDir = path.join(dir, 'tasks');
  if (!fs.existsSync(taskDir)) return [];
  return fs
    .readdirSync(taskDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) =>
      JSON.parse(fs.readFileSync(path.join(taskDir, f), 'utf-8')) as TaskSpecFile
    );
}

export function loadHeldoutSpecs(dir: string): TaskSpecFile[] {
  const dirHeldout = path.join(dir, 'heldout');
  if (!fs.existsSync(dirHeldout)) return [];
  return fs
    .readdirSync(dirHeldout)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) =>
      JSON.parse(fs.readFileSync(path.join(dirHeldout, f), 'utf-8')) as TaskSpecFile
    );
}

/**
 * Agent-K self-hosting domain: the agent edits real code in a repo; the
 * reward comes from the task's own verify commands (tests/typecheck/lint).
 */
export class AgentKCodingDomain extends Domain {
  constructor(
    private readonly evolveSetDir: string,
    private readonly deps: EvolveSetDeps
  ) {
    super();
  }

  get name(): string {
    return 'agent-k-coding';
  }

  private specs(dir = this.evolveSetDir): TaskSpecFile[] {
    return loadTaskSpecs(dir);
  }

  evolveIds(): string[] {
    return this.specs().map((t) => t.id);
  }

  heldoutIds(): string[] {
    return loadHeldoutSpecs(this.evolveSetDir).map((t) => t.id);
  }

  private specFor(id: string): TaskSpecFile {
    const found = this.specs().find((t) => t.id === id) ??
      loadHeldoutSpecs(this.evolveSetDir).find((t) => t.id === id);
    if (!found) throw new Error(`unknown task id: ${id}`);
    return found;
  }

  async run(
    task: TaskSpec,
    ctx: { policyDir: string; worktreePath?: string; k: number }
  ): Promise<TaskRunOutput> {
    const spec = this.specFor(task.id);
    const repoRoot = path.resolve(
      ctx.worktreePath ?? this.evolveSetDir,
      spec.repo ?? '.'
    );
    // 1) Agent works in the repo (host loop bridge; policy drives the harness).
    const agent = await this.deps.runAgent(
      { ...task, repoRoot, timeoutMs: spec.timeoutMs },
      { policyDir: ctx.policyDir, worktreePath: ctx.worktreePath }
    );
    if (!agent.completed) return { ...agent, taskId: task.id };

    // 2) Verification evidence from the task's own verify steps.
    let failed = 0;
    const passedSteps: string[] = [];
    for (const step of spec.verify) {
      const r = await this.deps.exec(step.cmd, repoRoot);
      const ok = r.exitCode === (step.expectExit ?? 0);
      if (ok) passedSteps.push(step.cmd);
      else failed++;
    }
    const requirementsVerified =
      spec.requirements?.length != null
        ? passedSteps.length >= Math.ceil(spec.verify.length * 0.99) &&
          failed === 0
        : undefined;

    return {
      ...agent,
      taskId: task.id,
      testsPassed: passedSteps.length,
      testsFailed: failed,
      requirementsVerified,
    };
  }

  /** Non-compensatory: a candidate that breaks previously-passing tasks. */
  guards(input: { incumbent: EvalResult; candidate: EvalResult }): string[] {
    const violations: string[] = [];
    for (const [id, tr] of Object.entries(input.incumbent.perTask)) {
      const incMean = mean(tr.rewards);
      const cand = input.candidate.perTask[id];
      if (!cand) continue;
      const candMean = mean(cand.rewards);
      if (incMean >= 0.99 && candMean < incMean - 0.25) {
        violations.push(`regression: ${id} ${incMean.toFixed(2)} -> ${candMean.toFixed(2)}`);
      }
    }
    return violations;
  }
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export { scoreRuns };
