/**
 * MCP list/call tools — host injects client via ToolContext.mcp.
 */

import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

export const mcpListToolsTool: ToolDefinition = {
  name: 'mcp_list_tools',
  description: 'List tools from connected MCP servers (host MCP client).',
  inputSchema: {
    type: 'object',
    properties: {
      server: { type: 'string', description: 'Optional server filter' },
    },
    required: [],
  },
  permissionHint: 'network',
  timeoutMs: 20_000,
  cancelSupported: true,
  timelineEventType: 'searching',
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'web',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      if (!ctx.mcp?.listTools) {
        return {
          success: true,
          data: {
            tools: [],
            count: 0,
            note: 'MCP client not wired on host.',
          },
        };
      }
      const tools = await ctx.mcp.listTools(
        input.server ? String(input.server) : undefined
      );
      return { success: true, data: { tools, count: tools.length } };
    });
  },
};

export const mcpCallTool: ToolDefinition = {
  name: 'mcp_call_tool',
  description: 'Call an MCP tool by server + name (host MCP client).',
  inputSchema: {
    type: 'object',
    properties: {
      server: { type: 'string' },
      tool: { type: 'string' },
      name: { type: 'string', description: 'Alias for tool' },
      arguments: { type: 'object' },
      args: { type: 'object', description: 'Alias for arguments' },
    },
    required: ['server'],
  },
  permissionHint: 'network',
  timeoutMs: 120_000,
  cancelSupported: true,
  timelineEventType: 'searching',
  modeAllowlist: ['agent', 'debug', 'ask', 'plan'],
  category: 'web',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      if (!ctx.mcp?.callTool) {
        return {
          success: false,
          error: 'MCP client not wired on host.',
        };
      }
      const server = String(input.server ?? '').trim();
      const tool = String(input.tool ?? input.name ?? '').trim();
      if (!server || !tool) {
        return { success: false, error: 'mcp_call_tool requires server and tool' };
      }
      const args =
        (input.arguments as Record<string, unknown> | undefined) ||
        (input.args as Record<string, unknown> | undefined) ||
        {};
      const data = await ctx.mcp.callTool(server, tool, args, ctx.signal);
      return { success: true, data };
    });
  },
};
