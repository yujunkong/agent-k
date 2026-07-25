/**
 * TargetedFixGenerator - 최소 패치 생성 (C6-T10)
 */
export interface PatchSuggestion {
  hypothesisId: string;
  filePath: string;
  originalCode: string;
  patchedCode: string;
  description: string;
  linesChanged: number;
}

export class TargetedFixGenerator {
  /**
   * Generate a minimal fix patch
   */
  generateFix(params: {
    hypothesisId: string;
    filePath: string;
    originalCode: string;
    patchedCode: string;
    description: string;
  }): PatchSuggestion {
    const originalLines = params.originalCode.split('\n');
    const patchedLines = params.patchedCode.split('\n');
    const diffLines = this.countDiffLines(originalLines, patchedLines);

    return {
      hypothesisId: params.hypothesisId,
      filePath: params.filePath,
      originalCode: params.originalCode,
      patchedCode: params.patchedCode,
      description: params.description,
      linesChanged: diffLines
    };
  }

  /**
   * Verify the fix is minimal (less than 20 lines changed)
   */
  isMinimal(patch: PatchSuggestion): boolean {
    return patch.linesChanged <= 20;
  }

  /**
   * Build a verification prompt for the fix
   */
  buildVerificationPrompt(patch: PatchSuggestion): string {
    return [
      '## 🔧 Verify Fix',
      '',
      `**File**: ${patch.filePath}`,
      `**Hypothesis**: ${patch.hypothesisId}`,
      `**Description**: ${patch.description}`,
      `**Lines changed**: ${patch.linesChanged}`,
      '',
      '```diff',
      ...this.generateDiff(patch.originalCode, patch.patchedCode),
      '```',
      '',
      'Please verify this fix addresses the root cause.'
    ].join('\n');
  }

  /**
   * Validate a fix patch
   */
  validatePatch(patch: PatchSuggestion): { valid: boolean; reason?: string } {
    if (!patch.filePath) return { valid: false, reason: 'No file path specified' };
    if (!patch.originalCode) return { valid: false, reason: 'No original code' };
    if (!patch.patchedCode) return { valid: false, reason: 'No patched code' };
    if (patch.originalCode === patch.patchedCode) {
      return { valid: false, reason: 'No changes made' };
    }
    if (patch.linesChanged > 50) {
      return { valid: false, reason: `Fix too large: ${patch.linesChanged} lines. Expected < 20 for a minimal fix` };
    }
    return { valid: true };
  }

  private countDiffLines(original: string[], patched: string[]): number {
    let changes = 0;
    const maxLen = Math.max(original.length, patched.length);
    for (let i = 0; i < maxLen; i++) {
      if (original[i] !== patched[i]) changes++;
    }
    return changes;
  }

  private generateDiff(original: string, patched: string): string[] {
    const origLines = original.split('\n');
    const patchLines = patched.split('\n');
    const diff: string[] = [];
    
    const maxLen = Math.max(origLines.length, patchLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (origLines[i] !== patchLines[i]) {
        if (origLines[i] !== undefined) diff.push(`- ${origLines[i]}`);
        if (patchLines[i] !== undefined) diff.push(`+ ${patchLines[i]}`);
      } else {
        diff.push(`  ${origLines[i]}`);
      }
    }
    
    return diff;
  }
}
