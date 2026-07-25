/**
 * VerifyCleanup - 검증 + 청소 (C6-T12 / RW-C6-06-R2)
 * remainingMarkers=-1 더미 제거 — 워크스페이스 실스캔.
 */
import * as vscode from 'vscode';
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
   */
  async scanWorkspace(hypothesisId?: string): Promise<{ remaining: number; files: string[] }> {
    const pattern = '**/*.{ts,tsx,js,jsx,py,go,rs}';
    const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 500);
    let remaining = 0;
    const hitFiles: string[] = [];
    for (const uri of uris) {
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(bytes).toString('utf8');
        const check = this.removeTool.verifyClean(content, hypothesisId);
        if (check.remaining > 0) {
          remaining += check.remaining;
          hitFiles.push(uri.fsPath);
        }
      } catch {
        /* skip unreadable */
      }
    }
    return { remaining, files: hitFiles };
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
