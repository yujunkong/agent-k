/**
 * VerifyCleanup - 검증 + 청소 (C6-T12)
 */
import { RemoveInstrumentationTool } from '../tools/debug/RemoveInstrumentationTool';

export interface VerifyResult {
  hypothesisId: string;
  reproduced: boolean;
  fixApplied: boolean;
  markersRemoved: boolean;
  testsPassed: boolean;
  verified: boolean;
}

export class VerifyCleanup {
  private removeTool = new RemoveInstrumentationTool();

  /**
   * Verify a debug fix
   */
  async verify(params: {
    hypothesisId: string;
    fileContents: Map<string, string>;
    testResults: boolean;
  }): Promise<VerifyResult> {
    // Check markers removed
    let totalMarkers = 0;
    for (const [, content] of params.fileContents) {
      totalMarkers += this.removeTool.countRemaining(content);
    }

    const result: VerifyResult = {
      hypothesisId: params.hypothesisId,
      reproduced: true,
      fixApplied: true,
      markersRemoved: totalMarkers === 0,
      testsPassed: params.testResults,
      verified: totalMarkers === 0 && params.testResults
    };

    return result;
  }

  /**
   * Build cleanup steps
   */
  buildCleanupPlan(hypothesisId: string, files: string[]): string {
    return [
      '## Cleanup Plan',
      '',
      `**Hypothesis**: ${hypothesisId}`,
      `**Files to clean**: ${files.length}`,
      '',
      '### Steps',
      '1. Remove all DEBUG_INSTRUMENT markers',
      '2. Verify zero markers remain',
      '3. Run tests to confirm fix',
      '4. If tests fail, keep instrumentation and re-analyze',
      '5. If tests pass, finalize cleanup',
      '',
      '---',
      'Use `remove_instrumentation` to remove markers.'
    ].join('\n');
  }

  /**
   * Check if rollback is needed
   */
  needsRollback(result: VerifyResult): boolean {
    return result.fixApplied && (!result.testsPassed || !result.markersRemoved);
  }
}
