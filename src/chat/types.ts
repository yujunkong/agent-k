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
  /**
   * Wall-clock work time for Cursor-style "Worked for Xm Ys" collapse
   * (set when streaming completes).
   */
  workedDurationMs?: number;
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
    thoughtRole?: 'opening' | 'mid';
    itemStatus: 'running' | 'done' | 'error';
    durationMs?: number;
  }>;
  /** Successful edit_file / write_file previews (Cursor-style cards) */
  fileEdits?: FileEditPreview[];
  /** run_terminal_cmd cards (Cursor-style expandable terminal box) */
  terminalRuns?: TerminalRunPreview[];
  /**
   * Cursor-style first line: shown immediately above Thought/tools
   * ("네, templates 폴더 분석하겠습니다.") — not cleared by tool turns.
   */
  openingLead?: string;
  /**
   * Assistant prose sealed between turns (survives clearContent).
   * First dig ack → lead above Exploring; mid-dig seals fold into Thought instead.
   */
  turnProse?: Array<{
    id: string;
    /** Appears after this turn's Thought, before tools */
    turn: number;
    content: string;
  }>;
  /**
   * Plan planning turn: show "작성 중" immediately while streaming
   * (full PLAN.md is hidden until promote → summary).
   */
  planDrafting?: boolean;
  metadata?: {
    model: string;
    tokens: { input: number; output: number };
    mode: Mode;
    toolsUsed: string[];
  };
}

export interface FileEditPreview {
  id: string;
  path: string;
  absPath?: string;
  additions: number;
  deletions: number;
  checkpointId?: string;
  /** Agent loop turn — place card after that turn's tools in the timeline */
  turn?: number;
  lines: Array<{
    type: 'add' | 'delete' | 'context';
    lineNumber: number;
    text: string;
  }>;
}

/** Cursor-style terminal run card in the chat timeline */
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
  /** Unique chip id (required for logs/snippets; optional for files) */
  id?: string;
  type: 'file' | 'folder' | 'symbol' | 'codebase' | 'snippet' | 'log';
  path: string;
  /** Inline body (selection / pasted log). Prefer over re-reading when set. */
  content?: string;
  /** 1-based inclusive line range for file/snippet */
  startLine?: number;
  endLine?: number;
  /** Chip label override (logs) */
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
  /** Host: opening = per-turn main Thought; mid = nested under Exploring */
  thoughtRole?: 'opening' | 'mid';
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
  /** Drop draft answer when a tool-calling turn begins */
  clearContent?: boolean;
  /** Agent-loop turn to attach sealed prose to (from tool.start) */
  sealTurn?: number;
  /** Successful file edit preview card */
  fileEdit?: FileEditPreview;
  /** Terminal run card start / live chunk / end */
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
  /** PRD-C0 §5.3 / PRD-Harness-13: turn timeline upsert */
  timeline?: TimelineDelta;
  /** Host ask_question → ClarifyingQuestions (RW-C5-02) */
  askQuestion?: {
    id: string;
    question: string;
    options?: string[];
    required?: boolean;
    allowMultiple?: boolean;
  };
  /** Host debug FSM stage advance → timeline / controller sync */
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