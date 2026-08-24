import type { ModeDecision } from '../mode/types';
import type { ConversationWorkEvent } from './conversation/conversationWorkEvent';

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
    /** Workspace path for clickable Read/Grep/Edit detail links */
    openPath?: string;
    turn?: number;
    thoughtRole?: 'opening' | 'mid';
    itemStatus: 'running' | 'done' | 'error';
    durationMs?: number;
  }>;
  /** Explicit tool work rows for WorkTimeline — not guessed from `steps`. */
  workItems?: ConversationWorkEvent[];
  fileEdits?: FileEditPreview[];
  terminalRuns?: TerminalRunPreview[];
  openingLead?: string;
  turnProse?: Array<{
    id: string;
    turn: number;
    content: string;
    /**
     * Timeline cut anchor: prose renders after this step id.
     * Absent → before explore/action tools of the turn (chronological, not a top hoist).
     */
    afterStepId?: string;
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
    /** CTX-004 — API wire compaction in progress (UI: Summarizing chat context...) */
    contextSummarizing?: boolean;
  };
}

export type FileEditSource = 'inlineEdit';
export type FileEditReviewStatus = 'pending' | 'accepted' | 'rejected';

export interface FileEditPreview {
  id: string;
  path: string;
  absPath?: string;
  additions: number;
  deletions: number;
  checkpointId?: string;
  turn?: number;
  /** Timeline work-event id this preview belongs to. */
  toolId?: string;
  /** 1-4f: Cmd/Ctrl+K scoped edit — reuses this preview, not a new diff engine. */
  source?: FileEditSource;
  reviewStatus?: FileEditReviewStatus;
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
  /** Timeline work-event id this preview belongs to. */
  toolId?: string;
}

export interface Attachment {
  id?: string;
  type: 'file' | 'folder' | 'symbol' | 'codebase' | 'snippet' | 'log' | 'image';
  path: string;
  content?: string;
  startLine?: number;
  endLine?: number;
  label?: string;
  /** CHAT-012 — image/* mime for vision send */
  mimeType?: string;
  /** Optional data-URL thumb in Composer (not sent on wire). */
  previewUrl?: string;
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
    | 'error'
    | 'task';
  turn: number;
  label: string;
  detail?: string;
  toolName?: string;
  /** Full path for explore file links (display detail may be basename only) */
  openPath?: string;
  thoughtRole?: 'opening' | 'mid';
  itemStatus: 'running' | 'done' | 'error';
  id?: string;
  subagentId?: string;
  parentTurnId?: string;
}

export interface StreamDelta {
  content?: string;
  reasoning?: string;
  /** Host complete catch-up — replace bubble body if deltas were dropped (parallel tabs). */
  replaceContent?: string;
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
    toolId?: string;
  };
  timeline?: TimelineDelta;
  workEvent?: ConversationWorkEvent;
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
  /** CTX-004 — host compacted API transcript; show Summarizing chat context... briefly */
  compaction?: {
    level?: string;
    label?: string;
  };
}

export interface ProviderConfig {
  type: 'litellm' | 'openai' | 'anthropic' | 'ollama' | 'lmstudio' | 'opencode-zen' | 'opencode-go';
  baseUrl: string;
  apiKey?: string;
  model: string;
}