/**
 * Edit history L_t — port of rrsi/history.py.
 *
 *   L_t = {(t_i, l_i, h_i, ΔS_i, ΔC_i, a_i) : i ≤ n_t}
 *   T_t = {l_i}                                    (tried components)
 *   g_t(l) = max{ΔS_i : l_i = l, t − t_i ≤ n_prune}   (recent yield)
 *   B_t = {l ∈ T_t : g_t(l) ≤ 0}                    (prune set)
 *
 * One JSONL record per EDIT. A candidate bundling n edits receives one
 * measurement and every edit carries it. Candidates dropped before
 * measurement record delta_S = null and do not enter T_t or g_t.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { K, type MeasuredOutcome } from '../types';

export interface HistoryRecord {
  t: number;
  variant: string;
  editId: string | null;
  component: string | null;
  hypothesis: string | null;
  diff: string | null;
  deltaS: number | null;
  deltaC: number | null;
  accepted: boolean;
  outcome: string;
  S: number | null;
  C: number | null;
  bundle: number;
  detail?: string;
  ts?: string;
}

export class History {
  constructor(private readonly filePath: string) {}

  records(): HistoryRecord[] {
    if (!fs.existsSync(this.filePath)) return [];
    const text = fs.readFileSync(this.filePath, 'utf-8');
    return text
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as HistoryRecord);
  }

  private append(rec: HistoryRecord): void {
    const full = { ts: new Date().toISOString(), ...rec };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, JSON.stringify(full) + '\n');
  }

  appendCandidate(input: {
    t: number;
    variant: string;
    edits: Array<Record<string, unknown>>;
    outcome: string;
    deltaS: number | null;
    deltaC: number | null;
    accepted: boolean;
    S: number | null;
    C: number | null;
    diff: string | null;
    detail?: string;
  }): void {
    const edits = input.edits.length
      ? input.edits
      : [{ id: 'C1', component: null, hypothesis: null }];
    for (const e of edits) {
      this.append({
        t: input.t,
        variant: input.variant,
        editId: (e.id as string) ?? null,
        component: (e.component as string) ?? null,
        hypothesis: (e.hypothesis as string) ?? null,
        diff: input.diff,
        deltaS: input.deltaS == null ? null : round6(input.deltaS),
        deltaC: input.deltaC == null ? null : round6(input.deltaC),
        accepted: input.accepted,
        outcome: input.outcome as MeasuredOutcome | string,
        S: input.S == null ? null : round6(input.S),
        C: input.C == null ? null : round6(input.C),
        bundle: input.edits.length,
        detail: input.detail?.slice(0, 600) || undefined,
      });
    }
  }

  measured(): HistoryRecord[] {
    return this.records().filter(
      (r) => r.deltaS != null && K.includes(r.component as never)
    );
  }

  /** T_t — components with at least one measured edit. */
  tried(): Set<string> {
    return new Set(this.measured().map((r) => r.component as string));
  }

  /** g_t(l) — best ΔS for a component within the prune window. */
  recentYield(t: number, nPrune: number): Map<string, number> {
    const out = new Map<string, number>();
    for (const r of this.measured()) {
      if (t - r.t > nPrune) continue;
      const cur = out.get(r.component as string) ?? -Infinity;
      if (r.deltaS! > cur) out.set(r.component as string, r.deltaS!);
    }
    return out;
  }

  /** B_t — measured components whose recent yield is non-positive. */
  pruneSet(t: number, nPrune: number): Array<{ component: string; best: number }> {
    const g = this.recentYield(t, nPrune);
    return [...g.entries()]
      .filter(([, best]) => best <= 0)
      .map(([component, best]) => ({ component, best }));
  }

  incumbentComponentCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const r of this.records()) {
      if (!r.accepted || r.component == null) continue;
      counts[r.component] = (counts[r.component] ?? 0) + 1;
    }
    return counts;
  }

  has(t: number, variant: string): boolean {
    return this.records().some((r) => r.t === t && r.variant === variant);
  }

  /** Rendered rows for the proposer prompt. */
  render(): string[] {
    return this.records().map((r) =>
      [
        `t=${r.t}`,
        `${r.variant}`,
        r.component ?? '-',
        r.deltaS == null ? 'dS=n/a' : `dS=${r.deltaS!.toFixed(4)}`,
        r.deltaC == null ? 'dC=n/a' : `dC=${r.deltaC!.toFixed(3)}`,
        r.outcome,
        (r.hypothesis ?? '').slice(0, 160),
      ].join(' | ')
    );
  }
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}
