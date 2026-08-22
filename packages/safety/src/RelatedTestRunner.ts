/**
 * SAFE-009 — RelatedTestRunner interface + recording stub.
 * Real execution stays in host/tools; safety only owns the contract + stub.
 */

import { createSafetyError, type SafetyResult } from './types';

export interface RelatedTestRunRequest {
  /** Source / edited file paths used to discover related tests. */
  paths: string[];
  cwd?: string;
}

export interface RelatedTestRunResult {
  success: boolean;
  paths: string[];
  /** Stub leaves output empty; real runners fill this. */
  output?: string;
  error?: string;
}

/** Contract for post-edit related test execution. */
export interface RelatedTestRunner {
  runRelated(request: RelatedTestRunRequest): Promise<RelatedTestRunResult>;
}

/**
 * Stub runner that records requested paths (no process spawn).
 * Useful for unit tests and early wiring.
 */
export class StubRelatedTestRunner implements RelatedTestRunner {
  /** Chronological list of path arrays passed to runRelated. */
  readonly requestedPaths: string[][] = [];

  async runRelated(request: RelatedTestRunRequest): Promise<RelatedTestRunResult> {
    const paths = [...request.paths];
    this.requestedPaths.push(paths);
    return {
      success: true,
      paths,
      output: '',
    };
  }

  /** R-005 wrapper — rejects empty path lists. */
  async runRelatedResult(
    request: RelatedTestRunRequest,
  ): Promise<SafetyResult<RelatedTestRunResult>> {
    if (!request.paths || request.paths.length === 0) {
      return {
        ok: false,
        error: createSafetyError(
          'INVALID_INPUT',
          'RelatedTestRunner requires at least one path',
        ),
      };
    }
    const value = await this.runRelated(request);
    return { ok: true, value };
  }

  clear(): void {
    this.requestedPaths.length = 0;
  }
}
