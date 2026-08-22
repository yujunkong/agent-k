/**
 * TOOL-005 GlobTool — simple glob file discovery under workspaceRoot.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { isPathDenied } from '@agent-k/safety';
import type { ToolDefinition, ToolResult } from '../types';
import { throwIfAborted, withToolTiming } from '../pathUtils';
import { simpleGlobToRegExp } from './GrepTool';

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

export async function globWorkspace(options: {
  workspaceRoot: string;
  pattern: string;
  maxResults?: number;
  signal?: AbortSignal;
}): Promise<{ matches: string[]; truncated: boolean }> {
  const maxResults = Math.min(options.maxResults ?? 200, 1000);
  const pattern = options.pattern.replace(/\\/g, '/');
  const re = simpleGlobToRegExp(
    pattern.includes('/') || pattern.startsWith('**')
      ? pattern
      : `**/${pattern}`
  );
  const matches: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    throwIfAborted(options.signal);
    if (matches.length >= maxResults) return;

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (matches.length >= maxResults) return;
      throwIfAborted(options.signal);
      const full = path.join(dir, ent.name);
      const rel = path.relative(options.workspaceRoot, full).replace(/\\/g, '/');

      if (ent.isDirectory()) {
        if (IGNORE_DIRS.has(ent.name)) continue;
        if (ent.name.startsWith('.') && ent.name !== '.') continue;
        if (isPathDenied(rel)) continue;
        await walk(full);
        continue;
      }

      if (!ent.isFile()) continue;
      if (isPathDenied(rel)) continue;
      if (re.test(rel) || re.test(ent.name)) {
        matches.push(rel);
      }
    }
  };

  await walk(options.workspaceRoot);
  matches.sort();
  return { matches, truncated: matches.length >= maxResults };
}

export const globTool: ToolDefinition = {
  name: 'glob',
  description: 'Find files by glob pattern under the workspace (e.g. **/*.ts).',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern' },
      glob_pattern: { type: 'string', description: 'Alias for pattern' },
      maxResults: { type: 'number', description: 'Max matches (default 200)' },
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      matches: { type: 'array', items: { type: 'string' } },
      count: { type: 'number' },
      truncated: { type: 'boolean' },
    },
  },
  permissionHint: 'read',
  timeoutMs: 30_000,
  cancelSupported: true,
  timelineEventType: 'searching',
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const pattern = String(
        input.pattern ?? input.glob_pattern ?? input.glob ?? ''
      ).trim();
      if (!pattern) {
        return { success: false, error: 'glob requires pattern' };
      }
      const out = await globWorkspace({
        workspaceRoot: ctx.workspaceRoot,
        pattern,
        maxResults: Number(input.maxResults) || 200,
        signal: ctx.signal,
      });
      return {
        success: true,
        data: {
          matches: out.matches,
          count: out.matches.length,
          truncated: out.truncated,
        },
        truncated: out.truncated,
      };
    });
  },
};
