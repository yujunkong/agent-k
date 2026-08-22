/**
 * TOOL-002 EditTool — search_replace style in-memory/fs apply.
 */

import * as fs from 'node:fs/promises';
import type { ToolDefinition, ToolResult } from '../types';
import { resolveWorkspacePath, withToolTiming } from '../pathUtils';

export interface SearchReplaceHunk {
  search: string;
  replace: string;
  replaceAll?: boolean;
}

/**
 * Apply search/replace hunks to `content`. Returns new content or error.
 */
export function applySearchReplace(
  content: string,
  hunks: SearchReplaceHunk[]
): { content: string; replacements: number } | { error: string } {
  let next = content;
  let replacements = 0;

  for (const hunk of hunks) {
    const search = hunk.search ?? '';
    if (!search) {
      return { error: 'edit_file hunk requires non-empty search' };
    }
    if (!next.includes(search)) {
      return {
        error: `search string not found in file: ${search.slice(0, 80)}`,
      };
    }
    if (hunk.replaceAll) {
      const parts = next.split(search);
      const count = parts.length - 1;
      next = parts.join(hunk.replace ?? '');
      replacements += count;
    } else {
      next = next.replace(search, hunk.replace ?? '');
      replacements += 1;
    }
  }

  return { content: next, replacements };
}

export const editTool: ToolDefinition = {
  name: 'edit_file',
  description:
    'Edit a file with search/replace hunks (exact string match). Writes to disk.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path under workspace' },
      search: { type: 'string', description: 'Single search string (or use hunks)' },
      replace: { type: 'string', description: 'Replacement for single search' },
      replaceAll: { type: 'boolean', description: 'Replace all occurrences' },
      hunks: {
        type: 'array',
        description: 'List of {search, replace, replaceAll?} hunks',
        items: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            replace: { type: 'string' },
            replaceAll: { type: 'boolean' },
          },
          required: ['search', 'replace'],
        },
      },
    },
    required: ['path'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      replacements: { type: 'number' },
    },
  },
  permissionHint: 'write',
  timeoutMs: 30_000,
  cancelSupported: true,
  timelineEventType: 'editing',
  modeAllowlist: ['agent', 'debug', 'plan'],
  category: 'edit',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const filePath = String(input.path ?? '');
      if (!filePath) {
        return { success: false, error: 'edit_file requires path' };
      }
      const resolved = resolveWorkspacePath(ctx.workspaceRoot, filePath);
      if ('error' in resolved) {
        return { success: false, error: resolved.error, denied: true };
      }

      let hunks = (input.hunks as SearchReplaceHunk[] | undefined) ?? [];
      if ((!hunks || hunks.length === 0) && typeof input.search === 'string') {
        hunks = [
          {
            search: String(input.search),
            replace: String(input.replace ?? ''),
            replaceAll: Boolean(input.replaceAll),
          },
        ];
      }
      if (!hunks.length) {
        return { success: false, error: 'edit_file requires search/replace or hunks' };
      }

      const before = await fs.readFile(resolved.abs, 'utf-8');
      const applied = applySearchReplace(before, hunks);
      if ('error' in applied) {
        return { success: false, error: applied.error };
      }

      await fs.writeFile(resolved.abs, applied.content, 'utf-8');
      return {
        success: true,
        data: {
          path: resolved.rel,
          replacements: applied.replacements,
          bytes: Buffer.byteLength(applied.content, 'utf-8'),
        },
      };
    });
  },
};
