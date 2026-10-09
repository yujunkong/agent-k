/**
 * V31-TOOL-07 — Checkpoint + terminal helper tools.
 * Executors delegate to host callbacks (ctx.createCheckpoint / restoreCheckpoint /
 * terminalOutput / processList). Without a host bridge they degrade gracefully.
 */

import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

export const checkpointCreateTool: ToolDefinition = {
  name: 'checkpoint_create',
  description: 'Create a workspace checkpoint (snapshot of current file contents).',
  inputSchema: {
    type: 'object',
    properties: {
      label: { type: 'string' },
      paths: { type: 'array', items: { type: 'string' } },
    },
    required: [],
  },
  permissionHint: 'write',
  timeoutMs: 30_000,
  cancelSupported: true,
  timelineEventType: 'session',
  modeAllowlist: ['agent', 'debug'],
  category: 'session',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      if (ctx.createCheckpoint) {
        const data = await ctx.createCheckpoint(input, ctx);
        return { success: true, data };
      }
      return {
        success: true,
        data: {
          status: 'unavailable',
          label: input.label ? String(input.label) : 'checkpoint',
          note: 'No checkpoint host bridge on this path — no files snapshotted.',
        },
      };
    });
  },
};

export const checkpointRestoreTool: ToolDefinition = {
  name: 'checkpoint_restore',
  description:
    'Restore a workspace checkpoint, or list available checkpoints when id is omitted.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      checkpointId: { type: 'string' },
    },
    required: [],
  },
  permissionHint: 'write',
  timeoutMs: 30_000,
  cancelSupported: true,
  timelineEventType: 'session',
  modeAllowlist: ['agent', 'debug'],
  category: 'session',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      if (ctx.restoreCheckpoint) {
        const data = await ctx.restoreCheckpoint(input, ctx);
        return { success: true, data };
      }
      return {
        success: false,
        error: 'No checkpoint host bridge on this path — cannot restore.',
      };
    });
  },
};

export const terminalOutputTool: ToolDefinition = {
  name: 'terminal_output',
  description: 'Read recent terminal output for a prior run (host terminal buffer).',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Terminal run id' },
      runId: { type: 'string' },
    },
    required: [],
  },
  permissionHint: 'terminal',
  timeoutMs: 10_000,
  cancelSupported: true,
  timelineEventType: 'running',
  modeAllowlist: ['agent', 'debug'],
  category: 'terminal',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      if (ctx.terminalOutput) {
        const data = await ctx.terminalOutput(input, ctx);
        return { success: true, data };
      }
      return {
        success: true,
        data: {
          output: '',
          note: 'No terminal buffer bridge on this path.',
        },
      };
    });
  },
};

export const processListTool: ToolDefinition = {
  name: 'process_list',
  description: 'List agent-managed background processes (host process table).',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  permissionHint: 'terminal',
  timeoutMs: 10_000,
  cancelSupported: true,
  timelineEventType: 'running',
  modeAllowlist: ['agent', 'debug'],
  category: 'terminal',
  async execute(_input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      if (ctx.processList) {
        const data = await ctx.processList(ctx);
        return { success: true, data };
      }
      return {
        success: true,
        data: { processes: [], note: 'No process table bridge on this path.' },
      };
    });
  },
};
