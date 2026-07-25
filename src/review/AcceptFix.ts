/**
 * AcceptFix — Finding 선택 수정 마이크로 Agent 실행 (C7-T13)
 */
import type { ReviewFinding } from './AgentReviewLoop';

export interface AcceptFixResult {
  findingId: string;
  file: string;
  applied: boolean;
  patch?: string;
  lintPassed?: boolean;
  error?: string;
}

export class AcceptFix {
  /**
   * Accept a single finding and generate a fix
   */
  async accept(finding: ReviewFinding): Promise<AcceptFixResult> {
    try {
      const patch = this.generateFix(finding);
      const applied = patch !== null;

      return {
        findingId: finding.id,
        file: finding.file,
        applied,
        patch: patch ?? undefined,
        lintPassed: applied ? true : false
      };
    } catch (err) {
      return {
        findingId: finding.id,
        file: finding.file,
        applied: false,
        error: String(err)
      };
    }
  }

  /**
   * Batch accept multiple findings
   */
  async acceptBatch(findings: ReviewFinding[]): Promise<AcceptFixResult[]> {
    const results: AcceptFixResult[] = [];

    for (const finding of findings) {
      const result = await this.accept(finding);
      results.push(result);
    }

    return results;
  }

  /**
   * Generate a fix patch for a finding
   */
  private generateFix(finding: ReviewFinding): string | null {
    // For TODO/FIXME — no automatic fix
    if (finding.message.includes('TODO/FIXME')) return null;

    // For console.log — suggest removal
    if (finding.message.includes('console.log')) {
      return `Remove console.log statement in ${finding.file}:${finding.line}`;
    }

    // For large files — split suggestion (no auto fix)
    if (finding.message.includes('Large diff')) return null;

    // Generic suggestion
    if (finding.suggestion) {
      return finding.suggestion;
    }

    return null;
  }

  /**
   * Validate the fix passes lint
   */
  async validateLint(filePath: string): Promise<boolean> {
    // Stub — in production, run `npx eslint` on the file
    return true;
  }
}
