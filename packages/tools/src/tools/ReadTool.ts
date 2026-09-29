/**
 * TOOL-001 ReadTool — read file under workspaceRoot with maxLines.
 */

import * as fs from 'node:fs/promises';
import type { ToolDefinition, ToolResult } from '../types';
import { resolveWorkspacePath, withToolTiming } from '../pathUtils';

const DEFAULT_MAX_LINES = 500;

/**
 * V31-TOOL-02 — prefix each line with its 1-based actual line number.
 * Pure helper: `offset` is the 1-based line number of `lines[0]`.
 */
export function formatNumberedLines(lines: string[], offset: number): string {
  return lines.map((line, i) => `${offset + i}: ${line}`).join('\n');
}

export const readTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read a text file from the workspace. Optionally limit lines.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative or absolute path under workspace' },
      maxLines: { type: 'number', description: 'Max lines to return (default 500)' },
      offset: { type: 'number', description: '1-based start line (default 1)' },
      numbered: {
        type: 'boolean',
        description: 'Prefix each line with its 1-based line number (N: )',
      },
    },
    required: ['path'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
      lineCount: { type: 'number' },
      truncated: { type: 'boolean' },
    },
  },
  permissionHint: 'read',
  timeoutMs: 15_000,
  cancelSupported: true,
  timelineEventType: 'reading',
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const filePath = String(input.path ?? '');
      if (!filePath) {
        return { success: false, error: 'read_file requires path' };
      }
      const resolved = resolveWorkspacePath(ctx.workspaceRoot, filePath);
      if ('error' in resolved) {
        return { success: false, error: resolved.error, denied: true };
      }

      const raw = await fs.readFile(resolved.abs, 'utf-8');
      const lines = raw.split(/\r?\n/);
      const offset = Math.max(1, Number(input.offset) || 1);
      const maxLines = Math.min(
        Math.max(1, Number(input.maxLines) || DEFAULT_MAX_LINES),
        5000
      );
      const slice = lines.slice(offset - 1, offset - 1 + maxLines);
      const truncated = offset - 1 + maxLines < lines.length || offset > 1;

      return {
        success: true,
        data: {
          path: resolved.rel,
          content:
            input.numbered === true
              ? formatNumberedLines(slice, offset)
              : slice.join('\n'),
          lineCount: slice.length,
          totalLines: lines.length,
          offset,
          truncated,
        },
        truncated,
      };
    });
  },
};
