/**
 * TOOL-002 EditTool — search_replace style in-memory/fs apply.
 */

import * as fs from 'node:fs/promises';
import type { ToolDefinition, ToolResult } from '../types';
import { resolveWorkspacePath, withToolTiming } from '../pathUtils';
import { buildBeforeAfterDiff } from '../editDiffPreview';

export interface SearchReplaceHunk {
  search: string;
  replace: string;
  replaceAll?: boolean;
}

/** 1-based line numbers where `search` occurs in `content` (non-overlapping). */
function findMatchLines(content: string, search: string): number[] {
  const lines: number[] = [];
  let from = 0;
  while (from <= content.length) {
    const idx = content.indexOf(search, from);
    if (idx < 0) break;
    lines.push(content.slice(0, idx).split('\n').length);
    from = idx + search.length;
  }
  return lines;
}

/**
 * Apply search/replace hunks to `content`. Returns new content or error.
 *
 * V31-TOOL-03 — strict mode (default) rejects a non-`replaceAll` hunk whose
 * search string matches multiple locations, instead of silently editing the
 * first match (ISSUE-13).
 */
export function applySearchReplace(
  content: string,
  hunks: SearchReplaceHunk[],
  opts?: { strict?: boolean },
): { content: string; replacements: number } | { error: string } {
  const strict = opts?.strict ?? true;
  let next = content;
  let replacements = 0;

  for (const hunk of hunks) {
    const search = hunk.search ?? '';
    if (!search) {
      return { error: 'edit_file hunk requires non-empty search' };
    }
    const matchLines = findMatchLines(next, search);
    if (matchLines.length === 0) {
      return {
        error: `search string not found in file: ${search.slice(0, 80)}`,
      };
    }
    if (strict && !hunk.replaceAll && matchLines.length >= 2) {
      return {
        error: `edit_file search string is not unique (${matchLines.length} matches at lines ${matchLines.join(', ')}); add more context or set replaceAll: true`,
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
      // Comment: V31-TOOL-03 — strict by default; host may opt out via setting
      const applied = applySearchReplace(before, hunks, {
        strict: ctx.strictEdit !== false,
      });
      if ('error' in applied) {
        return { success: false, error: applied.error };
      }

      // Comment: CONV-019 — diff real before→after (not raw search/replace strings)
      const diff = buildBeforeAfterDiff(before, applied.content);

      await fs.writeFile(resolved.abs, applied.content, 'utf-8');
      return {
        success: true,
        data: {
          path: resolved.rel,
          absPath: resolved.abs,
          replacements: applied.replacements,
          bytes: Buffer.byteLength(applied.content, 'utf-8'),
          diff,
        },
      };
    });
  },
};
