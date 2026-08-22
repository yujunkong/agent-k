/**
 * TOOL-004 GrepTool — simple Node walk + regex (ripgrep-like, no rg required).
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolDefinition, ToolResult } from '../types';
import { resolveWorkspacePath, throwIfAborted, withToolTiming } from '../pathUtils';
import { isPathDenied } from '@agent-k/safety';

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  '.cursor',
  'target',
  'vendor',
  'build',
  'coverage',
]);

const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|py|rs|go|java|kt|swift|css|scss|html|yml|yaml|toml|sh|bash|zsh|txt|vue|svelte|c|cpp|h|hpp)$/i;

/** Simple glob (`*` / `?`) → RegExp for relative path matching. */
export function simpleGlobToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/\\/g, '/')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<GLOBSTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/<<GLOBSTAR>>/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export async function grepWorkspace(options: {
  workspaceRoot: string;
  pattern: string;
  cwdRel?: string;
  include?: string;
  maxResults?: number;
  signal?: AbortSignal;
}): Promise<{ results: string[]; truncated: boolean }> {
  const maxResults = Math.min(options.maxResults ?? 50, 200);
  let re: RegExp;
  try {
    re = new RegExp(options.pattern, 'i');
  } catch {
    re = new RegExp(
      options.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i'
    );
  }

  let root = options.workspaceRoot;
  if (options.cwdRel && options.cwdRel !== '.') {
    const resolved = resolveWorkspacePath(options.workspaceRoot, options.cwdRel);
    if ('error' in resolved) {
      throw new Error(resolved.error);
    }
    root = resolved.abs;
  }

  const includeRe = options.include
    ? simpleGlobToRegExp(options.include)
    : null;
  const hits: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    throwIfAborted(options.signal);
    if (hits.length >= maxResults) return;

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (hits.length >= maxResults) return;
      throwIfAborted(options.signal);
      const full = path.join(dir, ent.name);
      const rel = path.relative(options.workspaceRoot, full).replace(/\\/g, '/');

      if (ent.isDirectory()) {
        if (IGNORE_DIRS.has(ent.name) || ent.name.startsWith('.')) continue;
        if (isPathDenied(rel)) continue;
        await walk(full);
        continue;
      }

      if (!ent.isFile()) continue;
      if (!TEXT_EXT.test(ent.name)) continue;
      if (isPathDenied(rel)) continue;
      if (
        includeRe &&
        !includeRe.test(ent.name) &&
        !includeRe.test(rel)
      ) {
        continue;
      }

      let content: string;
      try {
        const st = await fs.stat(full);
        if (st.size > 1_500_000) continue;
        content = await fs.readFile(full, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (hits.length >= maxResults) break;
        if (re.test(lines[i])) {
          hits.push(`${rel}:${i + 1}:${lines[i]}`);
        }
      }
    }
  };

  await walk(root);
  return {
    results: hits,
    truncated: hits.length >= maxResults,
  };
}

export const grepTool: ToolDefinition = {
  name: 'grep',
  description: 'Search file contents with a regex pattern (workspace walk).',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex or literal search pattern' },
      path: { type: 'string', description: 'Subdirectory to search (optional)' },
      include: { type: 'string', description: 'Glob filter e.g. *.ts' },
      maxResults: { type: 'number', description: 'Max hits (default 50)' },
    },
    required: ['pattern'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      results: { type: 'array', items: { type: 'string' } },
      count: { type: 'number' },
      truncated: { type: 'boolean' },
    },
  },
  permissionHint: 'read',
  timeoutMs: 60_000,
  cancelSupported: true,
  timelineEventType: 'searching',
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const pattern = String(input.pattern ?? input.query ?? '').trim();
      if (!pattern) {
        return { success: false, error: 'grep requires pattern' };
      }
      const out = await grepWorkspace({
        workspaceRoot: ctx.workspaceRoot,
        pattern,
        cwdRel: input.path ? String(input.path) : undefined,
        include: input.include
          ? String(input.include)
          : input.glob
            ? String(input.glob)
            : undefined,
        maxResults: Number(input.maxResults) || 50,
        signal: ctx.signal,
      });
      return {
        success: true,
        data: {
          results: out.results,
          count: out.results.length,
          truncated: out.truncated,
          engine: 'node-walk',
        },
        truncated: out.truncated,
      };
    });
  },
};
