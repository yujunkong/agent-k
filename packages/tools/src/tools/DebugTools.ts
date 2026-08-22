/**
 * TOOL-015 DebugTools — add/remove instrumentation stubs + collect logs buffer.
 */

import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

/** In-memory instrumentation markers (session-scoped via module + ctx.debugLogs). */
const instrumentationIds = new Set<string>();

export const addInstrumentationTool: ToolDefinition = {
  name: 'debug_add_instrumentation',
  description: 'Add a debug instrumentation marker (stub — records id only).',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      target: { type: 'string', description: 'File or symbol to instrument' },
      note: { type: 'string' },
    },
    required: ['id'],
  },
  permissionHint: 'write',
  timeoutMs: 5_000,
  cancelSupported: true,
  timelineEventType: 'verify',
  modeAllowlist: ['debug', 'agent'],
  category: 'debug',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const id = String(input.id ?? '').trim();
      if (!id) return { success: false, error: 'id required' };
      instrumentationIds.add(id);
      if (!ctx.debugLogs) ctx.debugLogs = [];
      ctx.debugLogs.push(
        `[add] ${id} target=${String(input.target ?? '')} note=${String(input.note ?? '')}`
      );
      return {
        success: true,
        data: { status: 'stub', id, active: [...instrumentationIds] },
      };
    });
  },
};

export const removeInstrumentationTool: ToolDefinition = {
  name: 'debug_remove_instrumentation',
  description: 'Remove a debug instrumentation marker (stub).',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
    },
    required: ['id'],
  },
  permissionHint: 'write',
  timeoutMs: 5_000,
  cancelSupported: true,
  timelineEventType: 'verify',
  modeAllowlist: ['debug', 'agent'],
  category: 'debug',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const id = String(input.id ?? '').trim();
      if (!id) return { success: false, error: 'id required' };
      instrumentationIds.delete(id);
      if (!ctx.debugLogs) ctx.debugLogs = [];
      ctx.debugLogs.push(`[remove] ${id}`);
      return {
        success: true,
        data: { status: 'stub', id, active: [...instrumentationIds] },
      };
    });
  },
};

export const collectRuntimeLogsTool: ToolDefinition = {
  name: 'debug_collect_logs',
  description: 'Collect buffered debug logs from the current session context.',
  inputSchema: {
    type: 'object',
    properties: {
      clear: { type: 'boolean', description: 'Clear buffer after collect' },
    },
    required: [],
  },
  permissionHint: 'read',
  timeoutMs: 5_000,
  cancelSupported: true,
  timelineEventType: 'verify',
  modeAllowlist: ['debug', 'agent'],
  category: 'debug',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const logs = [...(ctx.debugLogs ?? [])];
      if (input.clear && ctx.debugLogs) {
        ctx.debugLogs.splice(0, ctx.debugLogs.length);
      }
      return {
        success: true,
        data: {
          logs,
          count: logs.length,
          instrumentation: [...instrumentationIds],
        },
      };
    });
  },
};

/** Reset module-level instrumentation (tests). */
export function resetDebugInstrumentation(): void {
  instrumentationIds.clear();
}

export const debugTools: ToolDefinition[] = [
  addInstrumentationTool,
  removeInstrumentationTool,
  collectRuntimeLogsTool,
];
