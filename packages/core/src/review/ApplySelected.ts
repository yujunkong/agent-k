/**
 * ApplySelected — REVIEW-006: 체크된 파일/헌크만 적용 (v2.1 C2-T16 동작 동등 이식)
 *
 * 적용 전 checkpoint 생성 (REVIEW-004). 현재 safety CheckpointManager는
 * snapshot-map-only 계약 — 적용 결과는 modified content 맵으로 반환하고
 * host가 fs에 적용한다 (core에서 fs 직접 쓰기 최소화).
 */
import { CheckpointManager } from '@agent-k/safety';
import * as fs from 'fs';
import type { PendingChange } from './PendingStore';

export interface ApplyResult {
  applied: string[];
  skipped: string[];
  failed: Array<{ filePath: string; error: string }>;
  /** modified content for the host to write (path → content) */
  contents: Record<string, string>;
}

export class ApplySelected {
  private checkpointManager: CheckpointManager;

  constructor(checkpointManager: CheckpointManager) {
    this.checkpointManager = checkpointManager;
  }

  async apply(
    changes: PendingChange[],
    selectedFiles: string[],
    selectedHunks: Map<string, Set<number>>
  ): Promise<ApplyResult> {
    const filesToApply = changes.filter(c => selectedFiles.includes(c.filePath));
    const applied: string[] = [];
    const skipped: string[] = [];
    const failed: Array<{ filePath: string; error: string }> = [];
    const contents: Record<string, string> = {};

    // Create checkpoint (REVIEW-004) from current on-disk contents
    if (filesToApply.length > 0) {
      const snapshots: Record<string, string> = {};
      for (const c of filesToApply) {
        try {
          if (fs.existsSync(c.filePath)) {
            snapshots[c.filePath] = fs.readFileSync(c.filePath, 'utf-8');
          }
        } catch { /* snapshot best-effort */ }
      }
      this.checkpointManager.create(snapshots, {
        label: `Apply ${filesToApply.length} file(s)`,
        trigger: 'n_files',
        turnNumber: 0,
        mode: 'agent',
      });
    }

    for (const change of filesToApply) {
      try {
        if (!fs.existsSync(change.filePath)) {
          skipped.push(change.filePath);
          continue;
        }

        const hunkSelections = selectedHunks.get(change.filePath);
        const hunksToApply = hunkSelections
          ? change.hunks.filter((_, idx) => hunkSelections.has(idx))
          : change.hunks;

        if (hunksToApply.length === 0) {
          skipped.push(change.filePath);
          continue;
        }

        // Stage modified content for the host to apply
        contents[change.filePath] = change.modifiedContent;
        applied.push(change.filePath);
      } catch (error: unknown) {
        failed.push({ filePath: change.filePath, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return { applied, skipped, failed, contents };
  }
}
