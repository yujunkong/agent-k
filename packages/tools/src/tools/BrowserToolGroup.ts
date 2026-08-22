/**
 * TOOL-014 BrowserToolGroup — navigate / snapshot stubs (no real browser).
 */

import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

function browserStub(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>
): ToolDefinition {
  return {
    name,
    description,
    inputSchema,
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        tool: { type: 'string' },
      },
    },
    permissionHint: 'network',
    timeoutMs: 10_000,
    cancelSupported: true,
    timelineEventType: 'browsing',
    modeAllowlist: ['agent', 'debug'],
    category: 'web',
    async execute(input, ctx): Promise<ToolResult> {
      return withToolTiming(ctx.signal, async () => ({
        success: true,
        data: {
          status: 'not_implemented',
          tool: name,
          input,
          message: `${name} is a stub — browser automation not wired yet.`,
        },
      }));
    },
  };
}

export const browserNavigateTool = browserStub(
  'browser_navigate',
  'Navigate the browser to a URL (stub).',
  {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Target URL' },
    },
    required: ['url'],
  }
);

export const browserSnapshotTool = browserStub(
  'browser_snapshot',
  'Take an accessibility snapshot of the current page (stub).',
  {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'Optional CSS selector focus' },
    },
    required: [],
  }
);

/** All browser group tools for registerBuiltinTools. */
export const browserToolGroup: ToolDefinition[] = [
  browserNavigateTool,
  browserSnapshotTool,
];
