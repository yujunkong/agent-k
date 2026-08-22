/**
 * Agent 타입 정의
 */
export type Mode = 'ask' | 'agent' | 'plan' | 'debug';

export interface ModeConfig {
  name: Mode;
  displayName: string;
  systemPrompt: string;
  allowedTools: string[];
  contextBudget: number;
  maxTurns: number;
  description: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
  modeAllowlist: Mode[];
  category: 'search' | 'edit' | 'terminal' | 'web' | 'session' | 'orchestration' | 'debug';
  requiresApproval?: boolean;
  destructive?: boolean;
  uiGroup?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface TurnContext {
  turnNumber: number;
  toolCalls: ToolCall[];
  messages: any[];
  mode: Mode;
  startTime: number;
}
