/**
 * INLINE-005 / REVIEW-004 — Host checkpoint spine (SAFE-006 apply path).
 * CheckpointManager (snapshot-map-only) + host fs apply.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CheckpointManager, type Checkpoint } from '@agent-k/safety';
import { hostLog } from './hostLog';

const checkpointManager = new CheckpointManager();

/** Session-scoped checkpoint manager — inline edit / review flows register here. */
export function getCheckpointManager(): CheckpointManager {
  return checkpointManager;
}

/** Real checkpoint list for the webview (replaces SAFE-006 empty stub). */
export function listCheckpoints(count = 50): Checkpoint[] {
  return checkpointManager.list().slice(-count).slice().reverse();
}

/**
 * Restore a checkpoint: CheckpointManager.restore → host applies file snapshots.
 * Never throws into the router — structured warning on failure.
 */
export async function restoreCheckpoint(id: string, reason?: string): Promise<void> {
  const result = checkpointManager.restore(id);
  if (!result.ok) {
    void vscode.window.showWarningMessage(
      `Agent K: checkpoint not found (${id})${reason ? ` — ${reason}` : ''}`,
    );
    return;
  }

  let restored = 0;
  let failed = 0;
  for (const snap of result.value.fileSnapshots) {
    try {
      fs.mkdirSync(path.dirname(snap.filePath), { recursive: true });
      fs.writeFileSync(snap.filePath, snap.content, 'utf-8');
      restored++;
    } catch {
      failed++;
    }
  }

  hostLog('checkpoint restore', `id=${id} restored=${restored} failed=${failed}`);

  if (failed > 0) {
    void vscode.window.showWarningMessage(
      `Agent K: checkpoint restored with errors (${restored} ok / ${failed} failed)`,
    );
  } else {
    void vscode.window.showInformationMessage(
      `Agent K: checkpoint restored (${restored} file(s))${reason ? ` — ${reason}` : ''}`,
    );
  }
}
