/**
 * TOOL-017 ParallelSearch — Promise.all grep + glob.
 */

import { grepWorkspace } from './tools/GrepTool';
import { globWorkspace } from './tools/GlobTool';

export interface ParallelSearchInput {
  workspaceRoot: string;
  /** Grep pattern (optional — skipped if empty). */
  grepPattern?: string;
  /** Glob pattern (optional — skipped if empty). */
  globPattern?: string;
  include?: string;
  maxGrepResults?: number;
  maxGlobResults?: number;
  signal?: AbortSignal;
}

export interface ParallelSearchResult {
  grep?: {
    results: string[];
    count: number;
    truncated: boolean;
  };
  glob?: {
    matches: string[];
    count: number;
    truncated: boolean;
  };
}

/**
 * Run grep and/or glob in parallel under the same workspaceRoot.
 */
export async function parallelSearch(
  input: ParallelSearchInput
): Promise<ParallelSearchResult> {
  const tasks: Array<Promise<void>> = [];
  const out: ParallelSearchResult = {};

  if (input.grepPattern?.trim()) {
    tasks.push(
      grepWorkspace({
        workspaceRoot: input.workspaceRoot,
        pattern: input.grepPattern.trim(),
        include: input.include,
        maxResults: input.maxGrepResults,
        signal: input.signal,
      }).then((g) => {
        out.grep = {
          results: g.results,
          count: g.results.length,
          truncated: g.truncated,
        };
      })
    );
  }

  if (input.globPattern?.trim()) {
    tasks.push(
      globWorkspace({
        workspaceRoot: input.workspaceRoot,
        pattern: input.globPattern.trim(),
        maxResults: input.maxGlobResults,
        signal: input.signal,
      }).then((g) => {
        out.glob = {
          matches: g.matches,
          count: g.matches.length,
          truncated: g.truncated,
        };
      })
    );
  }

  await Promise.all(tasks);
  return out;
}
