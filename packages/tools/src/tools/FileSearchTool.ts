/**
 * TOOL-005 companion — file_search: fuzzy-ish name match via glob.
 */

import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';
import { globWorkspace } from './GlobTool';

export const fileSearchTool: ToolDefinition = {
  name: 'file_search',
  description:
    'Search for files by name fragment (fuzzy glob). Prefer glob for exact patterns.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'File name or fragment' },
      path: { type: 'string', description: 'Unused (workspace-scoped)' },
      maxResults: { type: 'number', description: 'Max results (default 50)' },
    },
    required: ['query'],
  },
  permissionHint: 'read',
  timeoutMs: 30_000,
  cancelSupported: true,
  timelineEventType: 'searching',
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const query = String(input.query ?? '').trim();
      if (!query) {
        return { success: false, error: 'file_search requires query' };
      }
      const maxResults = Math.min(
        200,
        Math.max(1, Number(input.maxResults) || 50)
      );
      // Comment: wrap query as **/*query* unless it already looks like a glob
      const pattern =
        /[*?]/.test(query) || query.includes('/')
          ? query
          : `**/*${query}*`;
      const { matches, truncated } = await globWorkspace({
        workspaceRoot: ctx.workspaceRoot,
        pattern,
        maxResults,
        signal: ctx.signal,
      });
      return {
        success: true,
        data: {
          query,
          matches,
          count: matches.length,
          truncated,
        },
      };
    });
  },
};
