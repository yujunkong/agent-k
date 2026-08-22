/**
 * Workspace path helpers — inject workspaceRoot; block path escape.
 * Used by read/edit/write/grep/glob/terminal tools.
 */

import * as path from 'node:path';
import { isPathDenied } from '@agent-k/safety';

export type ResolvedPath = { abs: string; rel: string } | { error: string };

/**
 * Resolve `filePath` under `workspaceRoot`. Rejects escape + safety deny paths.
 */
export function resolveWorkspacePath(
  workspaceRoot: string,
  filePath: string
): ResolvedPath {
  const root = path.resolve(workspaceRoot);
  const abs = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(root, filePath);

  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(rootWithSep)) {
    return {
      error: `Path escapes workspace root: ${filePath} (must be under ${root})`,
    };
  }

  const rel = path.relative(root, abs) || '.';
  if (isPathDenied(rel) || isPathDenied(abs)) {
    return {
      error: `Path denied by safety policy: ${rel}`,
    };
  }

  return { abs, rel };
}

/** Throw-friendly assert that AbortSignal has not fired. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error('Tool execution cancelled');
    err.name = 'AbortError';
    throw err;
  }
}

/** Wrap an async tool body with duration metadata + cancel handling. */
export async function withToolTiming(
  signal: AbortSignal | undefined,
  fn: () => Promise<{ success: boolean; data?: unknown; error?: string; truncated?: boolean; denied?: boolean }>
): Promise<import('./types').ToolResult> {
  const t0 = Date.now();
  try {
    throwIfAborted(signal);
    const out = await fn();
    throwIfAborted(signal);
    return {
      success: out.success,
      data: out.data,
      error: out.error,
      metadata: {
        durationMs: Date.now() - t0,
        truncated: out.truncated,
        denied: out.denied,
      },
    };
  } catch (e) {
    const cancelled =
      (e instanceof Error && e.name === 'AbortError') || Boolean(signal?.aborted);
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      metadata: {
        durationMs: Date.now() - t0,
        cancelled,
      },
    };
  }
}
