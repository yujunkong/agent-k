/**
 * Shared runtime message / tool-call types for AGENT-* / CTX-* (no providers hard-dep).
 */

/** OpenAI-style chat roles used inside the agent loop transcript. */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** Tool call emitted by the model (AGENT-003). */
export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** One transcript message; toolCalls / toolCallId preserved for AGENT-007. */
export interface AgentMessage {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCallRequest[];
  /** Present on role=tool messages — pairs with assistant.toolCalls[].id. */
  toolCallId?: string;
  name?: string;
  metadata?: {
    type?: string;
    turn?: number;
    toolName?: string;
    protected?: boolean;
  };
}

/** Model turn result injected via `runModel` (dependency inversion). */
export interface ModelTurnResult {
  content?: string;
  reasoning?: string;
  toolCalls?: ToolCallRequest[];
}

/** Injected tool executor result (mirrors tools package ToolResult shape). */
export interface ExecuteToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: {
    durationMs?: number;
    truncated?: boolean;
    cancelled?: boolean;
    denied?: boolean;
  };
}

/** Permission check callback — inject SAFE-001 gate without importing safety. */
export type PermissionCheckFn = (input: {
  toolName: string;
  args: Record<string, unknown>;
}) => Promise<'allow' | 'deny' | 'ask'> | 'allow' | 'deny' | 'ask';

/** Injected model runner. */
export type RunModelFn = (input: {
  messages: AgentMessage[];
  signal?: AbortSignal;
  turn: number;
}) => Promise<ModelTurnResult>;

/** Injected tool executor (AGENT-004). */
export type ExecuteToolFn = (input: {
  name: string;
  args: Record<string, unknown>;
  callId: string;
  signal?: AbortSignal;
}) => Promise<ExecuteToolResult>;
