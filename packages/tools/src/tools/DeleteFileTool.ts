/**
 * TOOL-003 companion — delete_file under workspace (safety deny honored).
 */

import * as fs from 'node:fs/promises';
import type { ToolDefinition, ToolResult } from '../types';
import { resolveWorkspacePath, withToolTiming } from '../pathUtils';

export const deleteFileTool: ToolDefinition = {
  name: 'delete_file',
  description: 'Delete a file under the workspace. Prefer edit/write when possible.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path under workspace' },
      filePath: { type: 'string', description: 'Alias for path' },
    },
    required: ['path'],
  },
  permissionHint: 'write',
  timeoutMs: 15_000,
  cancelSupported: true,
  timelineEventType: 'editing',
  modeAllowlist: ['agent', 'debug'],
  category: 'edit',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const filePath = String(input.path ?? input.filePath ?? '').trim();
      if (!filePath) {
        return { success: false, error: 'delete_file requires path' };
      }
      const resolved = resolveWorkspacePath(ctx.workspaceRoot, filePath);
      if ('error' in resolved) {
        return { success: false, error: resolved.error, denied: true };
      }
      try {
        await fs.unlink(resolved.abs);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { success: false, error: `Cannot delete: ${msg}` };
      }
      return {
        success: true,
        data: { path: resolved.rel, deleted: true },
      };
    });
  },
};
