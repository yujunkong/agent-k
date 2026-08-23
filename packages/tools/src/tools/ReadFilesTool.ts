/**
 * TOOL-001 — read_files: batch windowed reads (up to 12 paths).
 * Ported from v2.1 executeReadFiles.
 */

import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';
import { readTool } from './ReadTool';

const MAX_PATHS = 12;

/** Accept paths / files / path aliases from sloppy model args. */
export function coerceReadFilesPaths(
  input: Record<string, unknown>
): string[] {
  const asList = (raw: unknown): string[] => {
    if (Array.isArray(raw)) {
      return raw.map((p) => String(p ?? '').trim()).filter(Boolean);
    }
    if (typeof raw === 'string') {
      const t = raw.trim();
      if (!t) return [];
      if (t.startsWith('[')) {
        try {
          const parsed = JSON.parse(t) as unknown;
          if (Array.isArray(parsed)) {
            return parsed.map((p) => String(p ?? '').trim()).filter(Boolean);
          }
        } catch {
          /* single path */
        }
      }
      if (t.includes('\n') || (t.includes(',') && t.includes('/'))) {
        return t
          .split(/[\n,]/)
          .map((p) => p.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      }
      return [t];
    }
    return [];
  };

  for (const key of [
    'paths',
    'files',
    'file_paths',
    'filePaths',
    'targets',
    'path',
    'file',
    'target_file',
    'file_path',
    'filepath',
  ]) {
    const list = asList(input[key]);
    if (list.length) return list;
  }
  return [];
}

export const readFilesTool: ToolDefinition = {
  name: 'read_files',
  description:
    'Read multiple workspace files in one call (max 12). Prefer after grep/glob locate. Each file uses the same offset/maxLines window as read_file.',
  inputSchema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'File paths under workspace (max 12)',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Alias for paths',
      },
      path: { type: 'string', description: 'Single path alias' },
      offset: { type: 'number', description: '1-based start line (default 1)' },
      maxLines: { type: 'number', description: 'Max lines per file (default 500)' },
      limit: { type: 'number', description: 'Alias for maxLines' },
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      files: { type: 'array' },
      count: { type: 'number' },
      ok: { type: 'number' },
      failed: { type: 'number' },
    },
  },
  permissionHint: 'read',
  timeoutMs: 60_000,
  cancelSupported: true,
  timelineEventType: 'reading',
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const paths = coerceReadFilesPaths(input);
      if (!paths.length) {
        return {
          success: false,
          error:
            'read_files requires a non-empty paths array (or path/files aliases)',
        };
      }
      const capped = paths.slice(0, MAX_PATHS);
      const shared = {
        offset: input.offset,
        maxLines: input.maxLines ?? input.limit,
      };

      // Comment: parallel reads with a small concurrency cap
      const concurrency = 8;
      const results: Array<{
        path: string;
        success: boolean;
        error?: string;
        data?: unknown;
      }> = [];
      for (let i = 0; i < capped.length; i += concurrency) {
        const batch = capped.slice(i, i + concurrency);
        const part = await Promise.all(
          batch.map(async (p) => {
            const one = await readTool.execute({ ...shared, path: p }, ctx);
            return {
              path: p,
              success: one.success,
              error: one.error,
              data: one.data,
            };
          })
        );
        results.push(...part);
      }

      const ok = results.filter((r) => r.success).length;
      return {
        success: ok > 0,
        data: {
          files: results,
          count: results.length,
          ok,
          failed: results.length - ok,
          ...(paths.length > MAX_PATHS
            ? {
                note: `Only first ${MAX_PATHS} of ${paths.length} paths were read. Call again for the rest.`,
              }
            : {}),
        },
        error: ok === 0 ? 'All read_files paths failed' : undefined,
      };
    });
  },
};
