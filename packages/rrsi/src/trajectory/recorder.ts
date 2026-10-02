/**
 * V31-TEL → RRSI Phase 1 — Trajectory Recorder.
 *
 * Records one JSONL line per agent run (task-level evidence for the RRSI
 * evaluator): outcome, verification facts and cost. Pure host logic — no
 * vscode import. Written to the profile storage path by the extension.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface TrajectoryRecord {
  sessionId: string;
  requestId: string;
  mode: string;
  intentKind?: string;
  /** Terminal reason from the loop (completed / max_turns / doom_loop...). */
  stopReason: string;
  turns: number;
  /** Task-level reward in [0,1] — evaluator fills this from evidence. */
  reward: number | null;
  /** Verification evidence. */
  testsPassed?: number;
  testsFailed?: number;
  lintErrors?: number;
  requirementsVerified?: boolean;
  /** Cost. */
  tokens?: number;
  toolCalls?: number;
  ts: string;
}

export class TrajectoryRecorder {
  constructor(private readonly filePath: string) {}

  records(): TrajectoryRecord[] {
    if (!fs.existsSync(this.filePath)) return [];
    return fs
      .readFileSync(this.filePath, 'utf-8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as TrajectoryRecord);
  }

  append(rec: Omit<TrajectoryRecord, 'ts'>): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(
      this.filePath,
      JSON.stringify({ ts: new Date().toISOString(), ...rec }) + '\n'
    );
  }

  /** Aggregate into a TaskResult for the RRSI evaluator. */
  toTaskResult(sessionId: string, k: number): { rewards: number[]; tokens: Array<number | null> } {
    const recs = this.records().filter((r) => r.sessionId === sessionId);
    return {
      rewards: recs.map((r) => r.reward ?? 0),
      tokens: recs.map((r) => r.tokens ?? null),
    };
  }
}
