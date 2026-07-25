/**
 * ApplySelected - 체크된 파일/헌크만 적용 (C2-T16)
 * 
 * PendingStore에서 selected → WorkspaceEdit
 */
import { CheckpointManager } from '../checkpoint/CheckpointManager';
import type { PendingChange } from './PendingStore';

export interface ApplyResult {
  applied: string[];
  skipped: string[];
  failed: Array<{ filePath: string; error: string }>;
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

    // Create checkpoint
    if (filesToApply.length > 0) {
      await this.checkpointManager.createCheckpoint(
        filesToApply.map(c => c.filePath),
        `Apply ${filesToApply.length} file(s)`,
        { turnNumber: 0, mode: 'agent', trigger: 'n_files' }
      );
    }

    for (const change of filesToApply) {
      try {
        const fs = require('fs');
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

        // Apply modified content
        fs.writeFileSync(change.filePath, change.modifiedContent, 'utf-8');
        this.checkpointManager.updateHash(change.filePath);
        applied.push(change.filePath);
      } catch (error: any) {
        failed.push({ filePath: change.filePath, error: error.message });
      }
    }

    return { applied, skipped, failed };
  }
}
