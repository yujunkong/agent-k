import type { ModeDecision } from '../mode/types';

export type Role = 'user' | 'assistant' | 'tool' | 'system';
export type Mode = 'ask' | 'agent' | 'plan' | 'debug';
export type ModePicker = Mode | 'auto';
export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'error';

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  status: MessageStatus;
  timestamp: number;
  workedDurationMs?: number;
  toolStatus?: string;
  steps?: Array<{
    id: string;
    kind: string;
    label: string;
    detail?: string;
    toolName?: string;
    turn?: number;
    thoughtRole?: 'opening' | 'mid';
    itemStatus: 'running' | 'done' | 'error';
    durationMs?: number;
  }>;
  fileEdits?: FileEditPreview[];
  terminalRuns?: TerminalRunPreview[];
  openingLead?: string;
  turnProse?: Array<{
    id: string;
    turn: number;
    content: string;
  }>;
  metadata?: {
    model?: string;
    tokens?: { input: number; output: number };
    mode?: Mode;
    toolsUsed?: string[];
    modeDecision?: ModeDecision;
    /** Cursor-style sibling assistant variants for one user turn. */
    conversationVariantGroupId?: string;
    conversationVariantIndex?: number;
    conversationVariantCount?: number;
  };
}

export interface FileEditPreview {
  id: string;
  path: string;
  absPath?: string;
  additions: number;
  deletions: number;
  checkpointId?: string;
  turn?: number;
  lines: Array<{
    type: 'add' | 'delete' | 'context';
    lineNumber: number;
    text: string;
  }>;
}

export interface TerminalRunPreview {
  id: string;
  command: string;
  description?: string;
  cwd?: string;
  status: 'running' | 'done' | 'error';
  stdout: string;
  stderr: string;
  exitCode?: number | null;
  durationMs?: number;
  turn?: number;
  error?: string;
}

export interface Attachment {
  id?: string;
  type: 'file' | 'folder' | 'symbol' | 'codebase' | 'snippet' | 'log';
  path: string;
  content?: string;
  startLine?: number;
  endLine?: number;
  label?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  error?: boolean;
}

export interface TimelineDelta {
  kind:
    | 'thinking'
    | 'planning'
    | 'searching'
    | 'reading'
    | 'editing'
    | 'running'
    | 'browsing'
    | 'asking'
    | 'done'
    | 'error';
  turn: number;
  label: string;
  detail?: string;
  toolName?: string;
  thoughtRole?: 'opening' | 'mid';
  itemStatus: 'running' | 'done' | 'error';
  id?: string;
}

export interface StreamDelta {
  content?: string;
  reasoning?: string;
  status?: string;
  clearContent?: boolean;
  sealTurn?: number;
  fileEdit?: FileEditPreview;
  terminalRun?: {
    id: string;
    phase: 'start' | 'chunk' | 'end';
    command?: string;
    description?: string;
    cwd?: string;
    chunk?: string;
    stream?: 'stdout' | 'stderr';
    exitCode?: number | null;
    error?: string;
    durationMs?: number;
    turn?: number;
    status?: 'running' | 'done' | 'error';
  };
  timeline?: TimelineDelta;
  askQuestion?: {
    id: string;
    question: string;
    options?: string[];
    required?: boolean;
    allowMultiple?: boolean;
  };
  debugStage?: string;
  toolCalls?: ToolCall[];
  done?: boolean;
  error?: string;
}

export interface ProviderConfig {
  type: 'litellm' | 'openai' | 'anthropic' | 'ollama' | 'lmstudio' | 'opencode-zen' | 'opencode-go';
  baseUrl: string;
  apiKey?: string;
  model: string;
}