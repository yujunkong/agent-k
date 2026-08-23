/**
 * TOOL-001 — list_dir: list workspace directory entries.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { isPathDenied } from '@agent-k/safety';
import type { ToolDefinition, ToolResult } from '../types';
import { resolveWorkspacePath, withToolTiming } from '../pathUtils';

type DirEntry = {
  name: string;
  type: 'directory' | 'file';
  children?: DirEntry[];
};

async function listRecursive(
  absDir: string,
  depth: number,
  maxDepth: number
): Promise<DirEntry[]> {
  if (depth > maxDepth) return [];
  let ents;
  try {
    ents = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: DirEntry[] = [];
  for (const ent of ents) {
    if (ent.name.startsWith('.') && ent.name !== '.') continue;
    const full = path.join(absDir, ent.name);
    if (isPathDenied(full) || isPathDenied(ent.name)) continue;
    const item: DirEntry = {
      name: ent.name,
      type: ent.isDirectory() ? 'directory' : 'file',
    };
    if (ent.isDirectory() && depth < maxDepth) {
      item.children = await listRecursive(full, depth + 1, maxDepth);
    }
    out.push(item);
  }
  return out;
}

export const listDirTool: ToolDefinition = {
  name: 'list_dir',
  description: 'List files and directories under a workspace path.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path (default: .)' },
      dir: { type: 'string', description: 'Alias for path' },
      depth: {
        type: 'number',
        description: 'Recursion depth (default 1, max 4)',
      },
    },
    required: [],
  },
  permissionHint: 'read',
  timeoutMs: 15_000,
  cancelSupported: true,
  timelineEventType: 'reading',
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const raw = String(input.path ?? input.dir ?? '.').trim() || '.';
      const depth = Math.min(4, Math.max(1, Number(input.depth) || 1));
      const resolved =
        raw === '.'
          ? { abs: ctx.workspaceRoot, rel: '.' }
          : resolveWorkspacePath(ctx.workspaceRoot, raw);
      if ('error' in resolved) {
        return { success: false, error: resolved.error, denied: true };
      }
      const entries = await listRecursive(resolved.abs, 1, depth);
      return {
        success: true,
        data: {
          path: resolved.rel,
          entries,
          count: entries.length,
        },
      };
    });
  },
};
