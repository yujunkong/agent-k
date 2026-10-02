/**
 * RRSI Phase 3 — host wiring for the TrajectoryRecorder and the harness
 * policy directory. RRSI itself stays pure; this module owns the vscode
 * side (profile storage paths) and per-run evidence capture.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { TrajectoryRecorder } from '@agent-k/rrsi';

let recorder: TrajectoryRecorder | undefined;
let policiesDir: string | undefined;

/** Bind the recorder to the extension's global storage. Safe to call once. */
export function bindRRSIStorage(globalStoragePath: string): void {
  const rrsiDir = path.join(globalStoragePath, 'rrsi');
  recorder = new TrajectoryRecorder(path.join(rrsiDir, 'trajectories.jsonl'));
  policiesDir = path.join(globalStoragePath, 'harness', 'policies');
  fs.mkdirSync(policiesDir, { recursive: true });
}

/** Current recorder, or undefined before bind (host tests run unbound). */
export function getTrajectoryRecorder(): TrajectoryRecorder | undefined {
  return recorder;
}

/** RRSI-writeable policy dir (harness/policies), undefined before bind. */
export function getRRSIPoliciesDir(): string | undefined {
  return policiesDir;
}

/** Record one finished run. No-op when RRSI is not bound. */
export function recordRunTrajectory(rec: {
  sessionId: string;
  requestId: string;
  mode: string;
  intentKind?: string;
  stopReason: string;
  turns: number;
  reward?: number | null;
  testsPassed?: number;
  testsFailed?: number;
  lintErrors?: number;
  requirementsVerified?: boolean;
  tokens?: number;
  toolCalls?: number;
}): void {
  if (!recorder) return;
  recorder.append({ reward: rec.reward ?? null, ...rec });
}
