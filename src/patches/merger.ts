/**
 * Multi-hunk merger - 라인 번호 재계산 후 단일 WorkspaceEdit (C2-T07)
 * 
 * 여러 헌크를 bottom-up 순으로 적용하여 라인 번호 오프셋 유지
 */
import type { SearchReplaceHunk, PatchResult } from '../tools/patchDocument';
import { applySearchReplace, validateHunk } from '../tools/patchDocument';

export interface MergedHunk {
  filePath: string;
  hunks: SearchReplaceHunk[];
  valid: boolean;
  errors: string[];
}

export class HunkMerger {
  /**
   * 여러 헌크를 bottom-up 순으로 병합
   * 파일 내 여러 위치 수정 시 라인 번호 영향 방지
   */
  merge(filePath: string, hunks: SearchReplaceHunk[]): MergedHunk {
    const errors: string[] = [];

    // Validate each hunk first
    for (let i = 0; i < hunks.length; i++) {
      // We can't fully validate without file content here, but check basics
      if (!hunks[i].oldText || !hunks[i].newText) {
        errors.push(`Hunk ${i}: oldText and newText required`);
      }
      if (hunks[i].oldText === hunks[i].newText) {
        errors.push(`Hunk ${i}: oldText and newText are identical (no change)`);
      }
    }

    return {
      filePath,
      hunks,
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 실제 파일 내용에 헌크들 적용 (bottom-up)
   */
  applyAll(content: string, hunks: SearchReplaceHunk[]): PatchResult {
    // Sort hunks by position (bottom-up to preserve line numbers)
    const indexedHunks = hunks.map((hunk, idx) => ({
      hunk,
      idx,
      position: content.indexOf(hunk.oldText)
    }));

    // Sort by position descending (bottom-up)
    indexedHunks.sort((a, b) => b.position - a.position);

    let currentContent = content;
    let hunksApplied = 0;
    let hunksFailed = 0;
    const failedHunks: Array<{ index: number; error: string }> = [];

    for (const { hunk, idx } of indexedHunks) {
      const result = applySearchReplace(currentContent, [hunk]);
      if (result.success) {
        currentContent = result.resultContent;
        hunksApplied++;
      } else {
        hunksFailed++;
        const error = result.failedHunks[0]?.error || 'Unknown error';
        failedHunks.push({ index: idx, error });
      }
    }

    return {
      success: hunksFailed === 0,
      modified: hunksApplied > 0,
      hunksApplied,
      hunksFailed,
      failedHunks,
      resultContent: currentContent
    };
  }
}
