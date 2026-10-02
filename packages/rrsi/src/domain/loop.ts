/**
 * Round driver — ported from rrsi/loop.py, adapted to Agent-K's policy-file
 * harness. Algorithm 1 (analyze/propose/evaluate) + Algorithm 2 (select),
 * with candidates isolated in git worktrees via the injected evaluator.
 *
 * The host supplies: the domain (how to run/score tasks), the model bridge
 * (proposer/analyst/critic calls) and the policy directory (RRSI's only
 * write surface). This module has no vscode and no AgentLoop import.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  History,
  editBudget,
  selectRound,
  stallFlag,
  loadPolicyBundle,
  validatePolicySection,
  scoreRuns,
  type Domain,
  type EvalResult,
  type GenerateFn,
  type HarnessPolicyBundle,
  type RRSIConfig,
  type TaskSpec,
  analyze as runAnalyst,
  proposeEdits,
  toEdit,
  isPolicyFile,
} from '../index';

export interface LoopPaths {
  /** RRSI state dir (frontier.json, history.jsonl, rounds/). */
  runsDir: string;
  /** Agent-K harness policy dir candidates may rewrite. */
  policiesDir: string;
}

export interface LoopDeps {
  domain: Domain;
  generate: GenerateFn;
  /**
   * Evaluate the CURRENT policy dir on the evolve set with k trials.
   * Implementations should run in a worktree when `worktreePath` is given.
   */
  evaluate: (input: {
    policyDir: string;
    worktreePath?: string;
    tasks: TaskSpec[];
    k: number;
  }) => Promise<Record<string, Awaited<ReturnType<Domain['run']>>[]>>;
  /** Create an isolated worktree; return its path. */
  createWorktree: (name: string) => Promise<string>;
  removeWorktree?: (wt: string) => Promise<void>;
  log?: (msg: string) => void;
}

export interface Frontier {
  t: number;
  SStar: number;
  incumbent: { job: string; S: number; C: number | null; policyDir: string };
  trajectory: Array<{ t: number; S: number; C: number | null }>;
}

const POLICY_FILENAMES = [
  'verification.policy.json',
  'microloop.policy.json',
  'prefetch.policy.json',
  'worker.policy.json',
];

export class RRSILoop {
  private readonly history: History;
  private cfg: RRSIConfig;
  private readonly p: LoopPaths;
  private readonly deps: LoopDeps;
  private frontier: Frontier | null = null;

  constructor(paths: LoopPaths, deps: LoopDeps, cfg: RRSIConfig) {
    this.p = paths;
    this.deps = deps;
    this.cfg = cfg;
    this.history = new History(path.join(paths.runsDir, 'history.jsonl'));
    fs.mkdirSync(paths.runsDir, { recursive: true });
  }

  private log(msg: string): void {
    this.deps.log?.(msg);
  }

  private readPolicies(dir: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of POLICY_FILENAMES) {
      const p = path.join(dir, f);
      if (fs.existsSync(p)) out[f] = fs.readFileSync(p, 'utf-8');
    }
    return out;
  }

  private writePolicies(dir: string, policies: Record<string, string>): void {
    fs.mkdirSync(dir, { recursive: true });
    for (const [f, content] of Object.entries(policies)) {
      if (!isPolicyFile(f)) continue; // hard guard: policy files only
      fs.writeFileSync(path.join(dir, f), content);
    }
  }

  private tasks(): TaskSpec[] {
    return this.deps.domain.evolveIds().map((id) => ({
      id,
      prompt: id, // domain adapter resolves the real prompt from the id
      repoRoot: process.cwd(),
    }));
  }

  private async evaluatePolicyDir(
    job: string,
    policyDir: string,
    worktreePath?: string
  ): Promise<EvalResult> {
    const k = this.cfg.k;
    const outs = await this.deps.evaluate({
      policyDir,
      worktreePath,
      tasks: this.tasks(),
      k,
    });
    return scoreRuns(this.deps.domain, job, k, outs);
  }

  /** Evaluate(H_0) and seed the frontier. */
  async baseline(): Promise<EvalResult> {
    const ev = await this.evaluatePolicyDir('base', this.p.policiesDir);
    this.frontier = {
      t: 0,
      SStar: ev.S,
      incumbent: {
        job: 'base',
        S: ev.S,
        C: ev.C,
        policyDir: this.p.policiesDir,
      },
      trajectory: [{ t: 0, S: ev.S, C: ev.C }],
    };
    fs.writeFileSync(
      path.join(this.p.runsDir, 'frontier.json'),
      JSON.stringify(this.frontier, null, 2)
    );
    this.log(`baseline: S=${ev.S.toFixed(4)} C=${ev.C ?? 'n/a'}`);
    return ev;
  }

  private loadFrontier(): Frontier {
    if (this.frontier) return this.frontier;
    const p = path.join(this.p.runsDir, 'frontier.json');
    this.frontier = JSON.parse(fs.readFileSync(p, 'utf-8')) as Frontier;
    return this.frontier!;
  }

  private saveFrontier(): void {
    fs.writeFileSync(
      path.join(this.p.runsDir, 'frontier.json'),
      JSON.stringify(this.frontier, null, 2)
    );
  }

  /**
   * One round: analyze -> propose -> screen -> evaluate -> select -> record.
   * Resume-safe per round via runs/r<t>/ artifacts.
   */
  async round(t: number): Promise<{ winner: string | null; decisions: unknown[] }> {
    const fr = this.loadFrontier();
    const delta = this.cfg.delta ?? 0.017; // calibration is a Phase-3 host step
    const rdir = path.join(this.p.runsDir, `r${t}`);
    fs.mkdirSync(rdir, { recursive: true });

    // 1) Analyze(H_t, D)
    const incEv = await this.evaluatePolicyDir(`incumbent_t${t}`, fr.incumbent.policyDir);
    const digests = Object.entries(incEv.perTask)
      .filter(([, tr]) => (tr.rewards[0] ?? 0) < 1)
      .slice(0, this.cfg.T)
      .map(([id, tr]) => `task ${id}: rewards=${JSON.stringify(tr.rewards)}`);
    const report = await runAnalyst(this.deps.generate, digests.length ? digests : ['(no failures)']);

    // 2-3) b_t, sigma_t, prune set
    const budget = editBudget(t, this.cfg.T, this.cfg.bMin, this.cfg.bMax);
    const sigma = stallFlag(
      fr.trajectory.map((x) => x.S),
      t,
      this.cfg.w,
      delta
    );
    const prune = this.history.pruneSet(t, this.cfg.nPrune).map((p) => p.component);

    // 4) Propose m candidates (policy-file diffs only)
    const variants = ['A', 'B', 'C', 'D'].slice(0, Math.max(1, this.cfg.m));
    const candidates: Array<{
      variant: string;
      policies: Record<string, string>;
      edits: Array<Record<string, unknown>>;
      gateFailure: string | null;
    }> = [];
    for (const variant of variants) {
      try {
        const proposals = await proposeEdits({
          generate: this.deps.generate,
          currentPolicies: this.readPolicies(fr.incumbent.policyDir),
          report,
          budget,
          pruneSet: prune,
          historyRows: this.history.render(),
        });
        // Validate every touched file against the policy schema — the screen
        // BEFORE any evaluation cost is spent (critic layer 1).
        let failure: string | null = null;
        for (const pr of proposals) {
          if (!isPolicyFile(pr.file)) {
            failure = `critic_reject: non-policy file ${pr.file}`;
            break;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(pr.content);
          } catch {
            failure = `critic_reject: ${pr.file} is not JSON`;
            break;
          }
          const kind = pr.file.replace('.policy.json', '') as
            | 'verification'
            | 'microloop'
            | 'prefetch'
            | 'worker';
          const res = validatePolicySection(kind, parsed);
          if (!res.ok) {
            failure = `critic_reject: ${res.errors.join('; ')}`;
            break;
          }
        }
        const policies: Record<string, string> = {};
        if (!failure) {
          policies[`${fr.incumbent.policyDir}`] = ''; // keep key shape for diffing
          for (const pr of proposals) policies[pr.file] = pr.content;
        }
        candidates.push({
          variant,
          policies,
          edits: proposals.map((p) => ({
            id: `C${p.file}`,
            component: p.component,
            hypothesis: p.hypothesis,
          })),
          gateFailure: failure,
        });
      } catch (e) {
        candidates.push({
          variant,
          policies: {},
          edits: [],
          gateFailure: `proposer_error: ${String(e).slice(0, 200)}`,
        });
      }
    }

    // 5) Evaluate screened candidates in isolated worktrees
    const evs: Record<string, EvalResult | null> = {};
    for (const c of candidates) {
      if (c.gateFailure) {
        evs[c.variant] = null;
        continue;
      }
      let wt: string | undefined;
      try {
        wt = await this.deps.createWorktree(`rrsi_r${t}_${c.variant}`);
        const candDir = path.join(rdir, `cand_${c.variant}`);
        // Start from the incumbent policies, apply the proposal, validate.
        fs.cpSync(fr.incumbent.policyDir, candDir, { recursive: true });
        for (const [f, content] of Object.entries(c.policies)) {
          if (f.startsWith('{') || !isPolicyFile(f)) continue;
          fs.writeFileSync(path.join(candDir, f), content);
        }
        const probe = loadPolicyBundle(candDir);
        if (probe.errors.length) {
          c.gateFailure = `eval_invalid: ${probe.errors[0]}`;
          evs[c.variant] = null;
          continue;
        }
        evs[c.variant] = await this.evaluatePolicyDir(`r${t}_${c.variant}`, candDir, wt);
        (c as { evaluatedDir?: string }).evaluatedDir = candDir;
      } catch (e) {
        c.gateFailure = `eval_error: ${String(e).slice(0, 200)}`;
        evs[c.variant] = null;
      } finally {
        if (wt) await this.deps.removeWorktree?.(wt);
      }
    }

    // 6) Algorithm 2
    const cands = candidates.map((c) => ({
      variant: c.variant,
      edits: c.edits as never,
      ev: evs[c.variant],
      diffPath: null,
      gateFailure: c.gateFailure,
      detail: '',
    }));
    const { winner, decisions } = selectRound(
      cands,
      incEv,
      fr.SStar,
      delta,
      this.cfg,
      this.history.incumbentComponentCounts(),
      (inc, cand) => this.deps.domain.guards({ incumbent: inc, candidate: cand })
    );

    for (const c of candidates) {
      if (this.history.has(t, c.variant)) continue;
      const ev = evs[c.variant];
      const dec = decisions.find((d) => d.variant === c.variant);
      if (!ev) {
        this.history.appendCandidate({
          t,
          variant: c.variant,
          edits: c.edits,
          outcome: c.gateFailure || 'not_evaluated',
          deltaS: null,
          deltaC: null,
          accepted: false,
          S: null,
          C: null,
          diff: null,
          detail: c.gateFailure ?? '',
        });
        continue;
      }
      const accepted = winner?.variant === c.variant;
      this.history.appendCandidate({
        t,
        variant: c.variant,
        edits: c.edits,
        outcome: accepted ? 'ACCEPTED' : dec?.admissible ? 'LOST' : 'REJECTED',
        deltaS: dec?.deltaS ?? ev.S - incEv.S,
        deltaC: dec?.deltaC ?? 0,
        accepted,
        S: ev.S,
        C: ev.C,
        diff: JSON.stringify(c.policies).slice(0, 2000),
        detail: dec?.reason ?? '',
      });
    }

    // 7) H_{t+1}: on acceptance the host copies the winning policy dir over
    // the incumbent (fast-forward equivalent for policy files).
    if (winner) {
      const winDir = (candidates.find((c) => c.variant === winner.variant) as unknown as { evaluatedDir?: string }).evaluatedDir;
      if (winDir) {
        fs.cpSync(winDir, fr.incumbent.policyDir, { recursive: true });
        const validated = loadPolicyBundle(fr.incumbent.policyDir);
        if (validated.errors.length === 0) {
          const bundle: HarnessPolicyBundle = validated.bundle;
          void bundle;
          fr.SStar = Math.max(fr.SStar, winner.ev!.S);
          fr.trajectory.push({ t: t + 1, S: winner.ev!.S, C: winner.ev!.C });
          this.log(
            `round ${t}: accepted ${winner.variant} S=${winner.ev!.S.toFixed(4)}`
          );
        } else {
          this.log(`round ${t}: winner failed post-validation; keeping incumbent`);
        }
      }
    } else {
      fr.trajectory.push({ t: t + 1, S: incEv.S, C: incEv.C });
      this.log(`round ${t}: no admissible candidate; incumbent retained`);
    }
    fr.t = t + 1;
    this.saveFrontier();
    return { winner: winner?.variant ?? null, decisions };
  }

  get config(): RRSIConfig {
    return this.cfg;
  }

  set config(c: RRSIConfig) {
    this.cfg = c;
  }
}
