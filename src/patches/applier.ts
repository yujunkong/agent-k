/**
 * PatchApplier - 체크포인트 생성 → WorkspaceEdit 적용 → 롤백 연동 (C2-T08)
 * 
 * 파일 편집 시 체크포인트 자동 생성, 실패 시 롤백
 */
import * as fs from 'fs';
import * as path from 'path';
import type { SearchReplaceHunk } from '../tools/patchDocument';
import { applySearchReplace } from '../tools/patchDocument';
import { CheckpointManager } from '../checkpoint/CheckpointManager';
import type { PatchResult } from '../tools/patchDocument';

export class PatchApplier {
  private checkpointManager: CheckpointManager;

  constructor(checkpointManager: CheckpointManager) {
    this.checkpointManager = checkpointManager;
  }

  /**
   * 파일에 search-replace 패치 적용
   * 1. 체크포인트 생성 (첫 수정 전)
   * 2. 헌크 적용
   * 3. 검증
   */
  async apply(
    filePath: string,
    hunks: SearchReplaceHunk[],
    options?: {
      createCheckpoint?: boolean;
      isComplete?: boolean;
    }
  ): Promise<{
    success: boolean;
    modified: boolean;
    checkpointId?: string;
    result?: PatchResult;
    error?: string;
  }> {
    try {
      // Read current content
      if (!fs.existsSync(filePath)) {
        return { success: false, modified: false, error: `File not found: ${filePath}` };
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      // Create checkpoint if needed
      let checkpointId: string | undefined;
      if (options?.createCheckpoint !== false) {
        const checkpoint = await this.checkpointManager.createCheckpoint(
          [filePath],
          `Pre-edit: ${path.basename(filePath)}`,
          { turnNumber: 0, mode: 'agent', trigger: 'first_write' }
        );
        checkpointId = checkpoint.id;
      }

      // Apply hunks
      const result = applySearchReplace(content, hunks, !options?.isComplete);

      if (!result.success) {
        // Rollback if any hunk failed and we have a checkpoint
        if (checkpointId && !options?.isComplete) {
          await this.checkpointManager.restore(checkpointId);
        }
        return {
          success: false,
          modified: false,
          checkpointId,
          result,
          error: result.failedHunks.map((h: { error?: string }) => h.error || '').join('; ')
        };
      }

      if (result.modified) {
        // Write result back
        fs.writeFileSync(filePath, result.resultContent, 'utf-8');

        // Update checkpoint hash
        this.checkpointManager.updateHash(filePath);

        return { success: true, modified: true, checkpointId, result };
      }

      return { success: true, modified: false, checkpointId, result };
    } catch (error: any) {
      return { success: false, modified: false, error: error.message };
    }
  }

  /**
   * 여러 파일에 패치 일괄 적용
   */
  async applyBatch(
    patches: Array<{ filePath: string; hunks: SearchReplaceHunk[] }>
  ): Promise<Array<{ filePath: string; success: boolean; error?: string }>> {
    const results: Array<{ filePath: string; success: boolean; error?: string }> = [];

    // Create checkpoint for all files first
    const filePaths = patches.map(p => p.filePath);
    if (filePaths.length > 0) {
      await this.checkpointManager.createCheckpoint(
        filePaths,
        `Batch edit: ${filePaths.length} files`,
        { turnNumber: 0, mode: 'agent', trigger: 'n_files' }
      );
    }

    // Apply each file
    for (const patch of patches) {
      try {
        const result = await this.apply(patch.filePath, patch.hunks, { createCheckpoint: false });
        results.push({
          filePath: patch.filePath,
          success: result.success,
          error: result.error
        });
      } catch (error: any) {
        results.push({ filePath: patch.filePath, success: false, error: error.message });
      }
    }

    return results;
  }
}
