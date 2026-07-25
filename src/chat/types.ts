export type Role = 'user' | 'assistant' | 'tool' | 'system';
export type Mode = 'ask' | 'agent' | 'plan' | 'debug';
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
  /** Host AgentLoop tool status — separate from answer content (turn contract UX) */
  toolStatus?: string;
  /**
   * Cursor-style inline steps under the assistant bubble (PRD-C0 §5.3).
   * Appended sequentially as the loop runs — not a separate sticky panel.
   */
  steps?: Array<{
    id: string;
    kind: string;
    label: string;
    detail?: string;
    toolName?: string;
    /** Agent loop turn number (for Cursor-style collapse-per-turn) */
    turn?: number;
    itemStatus: 'running' | 'done' | 'error';
    durationMs?: number;
  }>;
  metadata?: {
    model: string;
    tokens: { input: number; output: number };
    mode: Mode;
    toolsUsed: string[];
  };
}

export interface Attachment {
  type: 'file' | 'folder' | 'symbol' | 'codebase';
  path: string;
  content?: string;
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

/** PRD-C0 §5.3 turn-by-turn processing item (Thought / Searching / … / Done) */
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
  /** running while in-flight; done/error when finished */
  itemStatus: 'running' | 'done' | 'error';
  id?: string;
}

export interface StreamDelta {
  content?: string;
  /** Model reasoning stream → Thought UI (not the final answer) */
  reasoning?: string;
  /** Host tool-loop status (e.g. "🔧 Running glob…") — replaces bubble while tools run */
  status?: string;
  /** PRD-C0 §5.3 / PRD-Harness-13: turn timeline upsert */
  timeline?: TimelineDelta;
  /** Host ask_question → ClarifyingQuestions (RW-C5-02) */
  askQuestion?: {
    id: string;
    question: string;
    options?: string[];
    required?: boolean;
  };
  toolCalls?: ToolCall[];
  done?: boolean;
  error?: string;
}

export interface ProviderConfig {
  type: 'litellm' | 'openai' | 'anthropic' | 'ollama' | 'lmstudio';
  baseUrl: string;
  apiKey?: string;
  model: string;
}