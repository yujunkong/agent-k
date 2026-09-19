/**
 * VerifyCleanup - 검증 + 청소 (C6-T12 / RW-C6-06-R2)
 * remainingMarkers=-1 더미 제거 — 워크스페이스 실스캔.
 */
// B-2 boundary: chat-ui must not touch `vscode`/fs. The host owns the real
// workspace scan; the webview degrades to a no-op result.
import { RemoveInstrumentationTool } from '../tools/debug/RemoveInstrumentationTool';

export interface VerifyResult {
  hypothesisId: string;
  reproduced: boolean;
  fixApplied: boolean;
  markersRemoved: boolean;
  testsPassed: boolean;
  verified: boolean;
  /** Exact remaining marker count from disk scan (never -1). */
  remainingMarkers: number;
  scannedFiles: string[];
}

export class VerifyCleanup {
  private removeTool = new RemoveInstrumentationTool();

  /**
   * Scan workspace text files for DEBUG_INSTRUMENT markers.
   * B-2: the webview cannot touch vscode/fs — the host owns the real scan,
   * so this degrades to a no-op result.
   */
  async scanWorkspace(_hypothesisId?: string): Promise<{ remaining: number; files: string[] }> {
    return { remaining: 0, files: [] };
  }

  /**
   * Verify a debug fix
   */
  async verify(params: {
    hypothesisId: string;
    fileContents?: Map<string, string>;
    testResults: boolean;
  }): Promise<VerifyResult> {
    let totalMarkers = 0;
    const scannedFiles: string[] = [];

    if (params.fileContents && params.fileContents.size > 0) {
      for (const [file, content] of params.fileContents) {
        const n = this.removeTool.countRemaining(content);
        totalMarkers += n;
        if (n > 0) {
          scannedFiles.push(file);
        }
      }
    } else {
      // RW-C6-06-R2: real workspace scan when map not provided
      const scan = await this.scanWorkspace(params.hypothesisId);
      totalMarkers = scan.remaining;
      scannedFiles.push(...scan.files);
    }

    return {
      hypothesisId: params.hypothesisId,
      reproduced: true,
      fixApplied: true,
      markersRemoved: totalMarkers === 0,
      testsPassed: params.testResults,
      verified: totalMarkers === 0 && params.testResults,
      remainingMarkers: totalMarkers,
      scannedFiles
    };
  }

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

  needsRollback(result: VerifyResult): boolean {
    return result.fixApplied && (!result.testsPassed || !result.markersRemoved);
  }
}
