/**
 * LSP / lint tools — host may inject vscode providers via ToolContext hooks.
 */

import type { ToolContext, ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

export const lspDefinitionTool: ToolDefinition = {
  name: 'lsp_definition',
  description:
    'Go to definition for a symbol at path:line:character (requires host LSP bridge).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      line: { type: 'number', description: '1-based line' },
      character: { type: 'number', description: '0-based character' },
      symbol: { type: 'string' },
    },
    required: ['path'],
  },
  permissionHint: 'read',
  timeoutMs: 20_000,
  cancelSupported: true,
  timelineEventType: 'searching',
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      if (ctx.lspDefinition) {
        const data = await ctx.lspDefinition(input, ctx);
        return { success: true, data };
      }
      return {
        success: true,
        data: {
          path: input.path,
          symbol: input.symbol,
          definitions: [],
          note: 'LSP bridge not wired on host — use grep/codebase_search.',
        },
      };
    });
  },
};

export const lspReferencesTool: ToolDefinition = {
  name: 'lsp_references',
  description:
    'Find references for a symbol at path:line:character (requires host LSP bridge).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      line: { type: 'number' },
      character: { type: 'number' },
      symbol: { type: 'string' },
    },
    required: ['path'],
  },
  permissionHint: 'read',
  timeoutMs: 20_000,
  cancelSupported: true,
  timelineEventType: 'searching',
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      if (ctx.lspReferences) {
        const data = await ctx.lspReferences(input, ctx);
        return { success: true, data };
      }
      return {
        success: true,
        data: {
          path: input.path,
          symbol: input.symbol,
          references: [],
          note: 'LSP bridge not wired on host — use grep.',
        },
      };
    });
  },
};

export const readLintsTool: ToolDefinition = {
  name: 'read_lints',
  description:
    'Read diagnostics/lints for workspace paths (requires host diagnostics bridge).',
  inputSchema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Files to check',
      },
      path: { type: 'string', description: 'Single path alias' },
    },
    required: [],
  },
  permissionHint: 'read',
  timeoutMs: 30_000,
  cancelSupported: true,
  timelineEventType: 'verify',
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const paths: string[] = Array.isArray(input.paths)
        ? (input.paths as unknown[]).map((p) => String(p ?? '').trim()).filter(Boolean)
        : input.path
          ? [String(input.path).trim()]
          : [];
      if (!paths.length) {
        return { success: false, error: 'read_lints requires paths: string[]' };
      }
      if (ctx.readLints) {
        const errors = await ctx.readLints(paths, ctx);
        return {
          success: true,
          data: {
            errors,
            count: errors.length,
            formatted:
              errors.length === 0
                ? '(no diagnostics)'
                : errors
                    .map(
                      (e) =>
                        `${e.path}:${e.line ?? '?'}: ${e.severity}: ${e.message}`
                    )
                    .join('\n'),
          },
        };
      }
      return {
        success: true,
        data: {
          errors: [],
          count: 0,
          formatted: '(no diagnostics — host lint bridge not wired)',
          paths,
        },
      };
    });
  },
};

/** Optional host hooks used by LSP/lint tools. */
export type LspLintHooks = Pick<
  ToolContext,
  'lspDefinition' | 'lspReferences' | 'readLints'
>;
