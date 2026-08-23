/**
 * TOOL-* domain types (R-005 tool contract foundation).
 * Pure types — no React / vscode.
 */

import type { AgentMode, WorkEventKind } from '@agent-k/shared';

/** Permission hint declared on every tool contract (R-005). */
export type PermissionHint =
  | 'read'
  | 'write'
  | 'terminal'
  | 'network'
  | 'session'
  | 'none';

/** Tool category used for mode filtering (ask/plan read-only). */
export type ToolCategory =
  | 'search'
  | 'edit'
  | 'terminal'
  | 'web'
  | 'session'
  | 'orchestration'
  | 'debug';

/**
 * R-005 ToolContract — every registered tool must declare these fields.
 * cancel support is expressed via AbortSignal on ToolContext + cancelSupported.
 */
export interface ToolContract {
  name: string;
  description: string;
  /** JSON Schema for tool arguments. */
  inputSchema: Record<string, unknown>;
  /** Optional JSON Schema describing successful `data` shape. */
  outputSchema?: Record<string, unknown>;
  permissionHint: PermissionHint;
  timeoutMs: number;
  /** When true, executor must honor `ctx.signal` (AbortSignal). */
  cancelSupported: boolean;
  /** Timeline Work Event kind string (R-002 / R-005). */
  timelineEventType: WorkEventKind | (string & {});
  modeAllowlist: AgentMode[];
  category: ToolCategory;
}

/** Executable tool: contract + execute handler. */
export interface ToolDefinition extends ToolContract {
  execute: (
    input: Record<string, unknown>,
    ctx: ToolContext
  ) => Promise<ToolResult>;
}

/** Runtime context injected by the host / agent loop. */
export interface ToolContext {
  /** Absolute workspace root — all relative paths resolve under this. */
  workspaceRoot: string;
  mode?: AgentMode;
  /** Cancellation signal (R-005 cancel support). */
  signal?: AbortSignal;
  /** Optional per-session todo store (TOOL-011). */
  todoStore?: TodoItem[];
  /** Optional debug log buffer (TOOL-015). */
  debugLogs?: string[];
  /** CONV-018 — live terminal stdout/stderr chunks for TerminalRunCard. */
  onTerminalChunk?: (chunk: string, stream: 'stdout' | 'stderr') => void;
  /** Optional VS Code LSP / diagnostics bridges (host). */
  lspDefinition?: (
    input: Record<string, unknown>,
    ctx: ToolContext
  ) => Promise<unknown>;
  lspReferences?: (
    input: Record<string, unknown>,
    ctx: ToolContext
  ) => Promise<unknown>;
  readLints?: (
    paths: string[],
    ctx: ToolContext
  ) => Promise<
    Array<{
      path: string;
      severity: string;
      message: string;
      line?: number;
    }>
  >;
  /** Optional MCP client (host). */
  mcp?: {
    listTools: (
      server?: string
    ) => Promise<Array<{ name: string; description?: string; server?: string }>>;
    callTool: (
      server: string,
      tool: string,
      args: Record<string, unknown>,
      signal?: AbortSignal
    ) => Promise<unknown>;
  };
  /** Optional mode switch (host / UI). */
  switchMode?: (mode: string) => Promise<unknown>;
  /** Optional checkpoint / terminal helpers (host). */
  createCheckpoint?: (
    input: Record<string, unknown>,
    ctx: ToolContext
  ) => Promise<unknown>;
  restoreCheckpoint?: (
    input: Record<string, unknown>,
    ctx: ToolContext
  ) => Promise<unknown>;
  terminalOutput?: (
    input: Record<string, unknown>,
    ctx: ToolContext
  ) => Promise<unknown>;
  processList?: (ctx: ToolContext) => Promise<unknown>;
}

/** Standard tool execution result. */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: {
    durationMs: number;
    truncated?: boolean;
    cancelled?: boolean;
    denied?: boolean;
  };
}

/** Todo item for TOOL-011 TodoWriteTool. */
export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

/** Options for ToolRegistry.getSchemas / list filtering. */
export interface GetSchemasOptions {
  /** Plan FSM stage — write tools only when `build`. */
  planStage?: string;
}

/** OpenAI-style function schema returned to the model. */
export interface ToolSchemaForModel {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
