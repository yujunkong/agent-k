/**
 * TOOL-003 WriteTool — create or overwrite a file under workspaceRoot.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolDefinition, ToolResult } from '../types';
import { resolveWorkspacePath, withToolTiming } from '../pathUtils';

export const writeTool: ToolDefinition = {
  name: 'write_file',
  description: 'Write contents to a file (create or overwrite) under the workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path under workspace' },
      content: { type: 'string', description: 'Full file contents to write' },
    },
    required: ['path', 'content'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      bytes: { type: 'number' },
      created: { type: 'boolean' },
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
        return { success: false, error: 'write_file requires path' };
      }
      if (typeof input.content !== 'string') {
        return { success: false, error: 'write_file requires content string' };
      }

      const resolved = resolveWorkspacePath(ctx.workspaceRoot, filePath);
      if ('error' in resolved) {
        return { success: false, error: resolved.error, denied: true };
      }

      let created = false;
      try {
        await fs.access(resolved.abs);
      } catch {
        created = true;
      }

      await fs.mkdir(path.dirname(resolved.abs), { recursive: true });
      await fs.writeFile(resolved.abs, input.content, 'utf-8');

      return {
        success: true,
        data: {
          path: resolved.rel,
          bytes: Buffer.byteLength(input.content, 'utf-8'),
          created,
        },
      };
    });
  },
};
