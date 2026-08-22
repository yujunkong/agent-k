/**
 * TOOL-015 DebugTools — insert/remove DEBUG_INSTRUMENT markers on disk.
 * Ported from v2.1 AddInstrumentationTool / RemoveInstrumentationTool.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ToolDefinition, ToolResult } from '../types';
import { resolveWorkspacePath, withToolTiming } from '../pathUtils';

const MARKER_PREFIX = '// DEBUG_INSTRUMENT:';

interface ActiveMarker {
  id: string;
  absPath: string;
}

const activeMarkers = new Map<string, ActiveMarker>();

function generateProbe(
  id: string,
  kind: string,
  filePath: string,
  variableName?: string,
  condition?: string,
): string {
  const marker = `${MARKER_PREFIX} ${id}`;
  switch (kind) {
    case 'exit':
      return `${marker}\nconsole.log('[DEBUG:${id}] EXIT: ${filePath}');`;
    case 'conditional':
      return `${marker}\nif (${condition || 'true'}) { console.log('[DEBUG:${id}] COND', ${
        variableName || 'undefined'
      }); }`;
    case 'dump':
      return `${marker}\nconsole.log('[DEBUG:${id}] DUMP:', JSON.stringify(${
        variableName || 'null'
      }, null, 2));`;
    case 'entry':
    default:
      return `${marker}\nconsole.log('[DEBUG:${id}] ENTER: ${filePath}'${
        variableName
          ? ` + ' | ${variableName}=' + JSON.stringify(${variableName})`
          : ''
      });`;
  }
}

export const addInstrumentationTool: ToolDefinition = {
  name: 'debug_add_instrumentation',
  description:
    'Insert a DEBUG_INSTRUMENT console probe into a workspace file (real disk write).',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Hypothesis / marker id' },
      target: { type: 'string', description: 'File path under workspace' },
      path: { type: 'string', description: 'Alias for target' },
      lineNumber: { type: 'number', description: '1-based insert line (optional)' },
      type: {
        type: 'string',
        description: 'entry | exit | conditional | dump',
      },
      variableName: { type: 'string' },
      condition: { type: 'string' },
      note: { type: 'string' },
    },
    required: ['id'],
  },
  permissionHint: 'write',
  timeoutMs: 10_000,
  cancelSupported: true,
  timelineEventType: 'verify',
  modeAllowlist: ['debug', 'agent'],
  category: 'debug',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const id = String(input.id ?? '').trim();
      const rel = String(input.target ?? input.path ?? '').trim();
      if (!id) return { success: false, error: 'id required' };
      if (!rel) return { success: false, error: 'target (file path) required' };

      const resolved = resolveWorkspacePath(ctx.workspaceRoot, rel);
      if ('error' in resolved) return { success: false, error: resolved.error };
      const absPath = resolved.abs;
      if (!fs.existsSync(absPath)) {
        return { success: false, error: `File not found: ${rel}` };
      }

      const original = fs.readFileSync(absPath, 'utf8');
      const kind = String(input.type ?? 'entry');
      const probe = generateProbe(
        id,
        kind,
        rel,
        input.variableName ? String(input.variableName) : undefined,
        input.condition ? String(input.condition) : undefined,
      );
      const lines = original.split('\n');
      const insertAt =
        input.lineNumber != null
          ? Math.max(0, Math.min(Number(input.lineNumber) - 1, lines.length))
          : Math.max(0, lines.length - 1);
      lines.splice(insertAt, 0, ...probe.split('\n'));
      fs.writeFileSync(absPath, lines.join('\n'), 'utf8');

      activeMarkers.set(id, { id, absPath });
      if (!ctx.debugLogs) ctx.debugLogs = [];
      ctx.debugLogs.push(
        `[add] ${id} file=${rel} line=${insertAt + 1} note=${String(input.note ?? '')}`,
      );

      return {
        success: true,
        data: {
          status: 'written',
          id,
          path: rel,
          insertedAtLine: insertAt + 1,
          active: [...activeMarkers.keys()],
        },
      };
    });
  },
};

export const removeInstrumentationTool: ToolDefinition = {
  name: 'debug_remove_instrumentation',
  description:
    'Remove DEBUG_INSTRUMENT lines for a marker id from the instrumented file.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      target: { type: 'string', description: 'Optional file override' },
      path: { type: 'string' },
    },
    required: ['id'],
  },
  permissionHint: 'write',
  timeoutMs: 10_000,
  cancelSupported: true,
  timelineEventType: 'verify',
  modeAllowlist: ['debug', 'agent'],
  category: 'debug',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const id = String(input.id ?? '').trim();
      if (!id) return { success: false, error: 'id required' };

      const marker = activeMarkers.get(id);
      const rel = String(input.target ?? input.path ?? '').trim();
      let absPath = marker?.absPath;
      if (!absPath && rel) {
        const resolved = resolveWorkspacePath(ctx.workspaceRoot, rel);
        if ('error' in resolved) return { success: false, error: resolved.error };
        absPath = resolved.abs;
      }
      if (!absPath || !fs.existsSync(absPath)) {
        activeMarkers.delete(id);
        return {
          success: true,
          data: {
            status: 'cleared',
            id,
            message: 'No on-disk file tracked; marker cleared from session.',
            active: [...activeMarkers.keys()],
          },
        };
      }

      const content = fs.readFileSync(absPath, 'utf8');
      const needle = `${MARKER_PREFIX} ${id}`;
      const next = content
        .split('\n')
        .filter((line) => !line.includes(needle) && !line.includes(`[DEBUG:${id}]`))
        .join('\n');
      fs.writeFileSync(absPath, next, 'utf8');
      activeMarkers.delete(id);
      if (!ctx.debugLogs) ctx.debugLogs = [];
      ctx.debugLogs.push(`[remove] ${id} file=${absPath}`);

      return {
        success: true,
        data: {
          status: 'removed',
          id,
          path: path.relative(ctx.workspaceRoot, absPath),
          active: [...activeMarkers.keys()],
        },
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
          instrumentation: [...activeMarkers.keys()],
        },
      };
    });
  },
};

/** Reset module-level instrumentation (tests). */
export function resetDebugInstrumentation(): void {
  activeMarkers.clear();
}

export const debugTools: ToolDefinition[] = [
  addInstrumentationTool,
  removeInstrumentationTool,
  collectRuntimeLogsTool,
];
