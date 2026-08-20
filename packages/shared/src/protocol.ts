/**
 * Extension ↔ Webview 메시지 프로토콜 타입 정의
 *
 * 모든 Extension-Webview 통신은 이 파일의 타입을 통해 이루어집니다.
 * Zod 스키마로 런타임 검증: 알 수 없는 메시지 타입 에러 로그
 *
 * Lives in @agent-k/shared (Phase 0). No React / vscode / plan package deps.
 */

// ─── Webview → Extension ──────────────────────────────

export interface ChatMessagePayload {
  text: string;
  files?: { type: string; path: string; content?: string }[];
}

/** Webview → Host: Agent/Plan/Debug tool-mediated send */
export interface ChatSendPayload {
  requestId: string;
  /** Owning chat session/tab — scopes plan-generate abort to this tab only. */
  sessionId?: string;
  messages: { role: string; content: string }[];
  mode: 'ask' | 'agent' | 'plan' | 'debug';
  /** Plan FSM stage for stage-specific system prompt */
  planStage?: 'research' | 'questions' | 'planning' | 'review' | 'build';
  /** Debug FSM stage for stage-specific system prompt */
  debugStage?: string;
  /** Thinking effort: off | low | medium | high | max */
  thinkingEffort?: 'off' | 'low' | 'medium' | 'high' | 'max';
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

/**
 * Opaque plan DAG for protocol payloads.
 * Concrete `ExecutionPlan` lives in plan/execution until @agent-k/plan extract.
 */
export type ProtocolExecutionPlan = Record<string, unknown>;

/** Webview → Host: run approved structured plan through DAG executor */
export interface PlanExecutePayload {
  requestId: string;
  /** Owning chat session/tab for isolation. */
  sessionId?: string;
  parentTurnId: string;
  executionPlan: ProtocolExecutionPlan;
  /** Workspace root from plan generation — validated against host folder at execution. */
  repoRoot?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  providerType?: string;
  thinkingEffort?: 'off' | 'low' | 'medium' | 'high' | 'max';
}

export interface ChatStopPayload {
  requestId?: string;
}

export interface StopStreamPayload {}
export interface RegeneratePayload {}

export interface EditMessagePayload {
  id: string;
  content: string;
}

export interface DeleteMessagePayload {
  id: string;
}

export interface PinMessagePayload {
  id: string;
  pinned: boolean;
}

export interface SwitchModePayload {
  mode: 'ask' | 'agent' | 'plan' | 'debug';
}

export interface MentionRequestPayload {
  query: string;
  type: 'file' | 'folder' | 'symbol' | 'codebase';
}

export interface SettingsOpenPayload {}

export interface FocusInputPayload {}

/** ADDON-T06: webview → host session meta sync (see HostSessionBridge) */
export interface HostSessionMeta {
  id: string;
  title: string;
  mode: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  summary?: string;
}

export interface HostSessionsPersistPayload {
  sessions: HostSessionMeta[];
  currentId: string | null;
}

export interface HostSessionsReadyPayload {}

/** Subagent worktree review / apply / reject (webview → host) */
export interface WorktreeSubagentPayload {
  subagentId: string;
  requestId?: string;
}

/** Host → webview worktree action results */
export interface WorktreeReviewResultPayload {
  requestId: string;
  subagentId?: string;
  success: boolean;
  worktreePath?: string;
  worktreeBranch?: string;
  filesChanged?: number;
  files?: string[];
  diff?: string;
  untrackedFiles?: string[];
  error?: string;
}

export interface WorktreeApplyResultPayload {
  requestId: string;
  subagentId?: string;
  success: boolean;
  applied?: boolean;
  removed?: boolean;
  filesChanged?: number;
  error?: string;
}

export interface WorktreeRejectResultPayload {
  requestId: string;
  subagentId?: string;
  success: boolean;
  error?: string;
}

/** ADDON-T07: webview → host checkpoint list/restore */
export interface CheckpointListPayload {}

export interface CheckpointRestorePayload {
  id: string;
  reason?: string;
}

// ─── Extension → Webview ──────────────────────────────

export interface StreamDeltaPayload {
  content?: string;
  reasoning?: string;
  done?: boolean;
  error?: string;
}

export interface StreamCompletePayload {
  messageId: string;
}

export interface StreamErrorPayload {
  messageId: string;
  error: string;
}

export interface ToolCallStartPayload {
  toolCallId: string;
  name: string;
  arguments: string;
}

export interface ToolCallEndPayload {
  toolCallId: string;
  result: string;
  error?: string;
}

export interface ToolResultPayload {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface TimelineUpdatePayload {
  turnId: string;
  status: 'thinking' | 'planning' | 'searching' | 'reading' | 'editing' | 'running' | 'browsing' | 'asking' | 'done' | 'error';
  detail?: string;
}

export interface ModeChangedPayload {
  mode: 'ask' | 'agent' | 'plan' | 'debug';
}

export interface HistoryLoadedPayload {
  messages: any[];
  sessionId?: string;
}

export interface SettingsLoadedPayload {
  settings: Record<string, any>;
}

export interface MentionResultsPayload {
  query: string;
  results: { label: string; description?: string; detail?: string }[];
}

/** ADDON-T06: host → webview session hydration (SessionManager restore) */
export interface HostSessionsHydratePayload {
  sessions: HostSessionMeta[];
  currentId: string | null;
}

/** ADDON-T07: host → webview checkpoint summaries (no file contents) */
export interface CheckpointSummary {
  id: string;
  label: string;
  timestamp: number;
  turnNumber: number;
  mode: string;
  trigger: string;
  fileCount: number;
}

export interface CheckpointListResultPayload {
  checkpoints: CheckpointSummary[];
}

// ─── 메시지 래퍼 ──────────────────────────────────────

export type WebviewMessage =
  | { type: 'chat.message'; payload: ChatMessagePayload }
  | { type: 'chat.send'; payload: ChatSendPayload }
  | { type: 'chat.stop'; payload: ChatStopPayload }
  | { type: 'stop.stream'; payload: StopStreamPayload }
  | { type: 'regenerate'; payload: RegeneratePayload }
  | { type: 'edit.message'; payload: EditMessagePayload }
  | { type: 'delete.message'; payload: DeleteMessagePayload }
  | { type: 'pin.message'; payload: PinMessagePayload }
  | { type: 'switch.mode'; payload: SwitchModePayload }
  | { type: 'mention.request'; payload: MentionRequestPayload }
  | { type: 'settings.open'; payload: SettingsOpenPayload }
  | { type: 'focus.input'; payload: FocusInputPayload }
  | { type: 'host.sessions.persist'; payload: HostSessionsPersistPayload }
  | { type: 'host.sessions.ready'; payload?: HostSessionsReadyPayload }
  | { type: 'checkpoint.list'; payload?: CheckpointListPayload }
  | { type: 'checkpoint.restore'; payload: CheckpointRestorePayload }
  | { type: 'worktree.review'; payload: WorktreeSubagentPayload }
  | { type: 'worktree.apply'; payload: WorktreeSubagentPayload }
  | { type: 'worktree.reject'; payload: WorktreeSubagentPayload }
  | { type: 'session.compact'; payload?: Record<string, never> };

/** Host → Webview stream events for chat.send tool loop */
export interface ChatStreamEvent {
  type: 'chat.stream';
  requestId: string;
  event: 'delta' | 'status' | 'tool.start' | 'tool.end' | 'timeline' | 'file.edit' | 'complete' | 'error' | 'subagent.event';
  content?: string;
  status?: string;
  toolName?: string;
  toolArgs?: string;
  toolResult?: string;
  error?: string;
  /** PRD-C0 §5.3 timeline fields (when event === 'timeline') */
  kind?: string;
  turn?: number;
  label?: string;
  detail?: string;
  id?: string;
  subagentId?: string;
  parentTurnId?: string;
  taskId?: string;
  role?: string;
  prompt?: string;
  summary?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  filesChanged?: number;
  toolCount?: number;
  duration?: number;
  durationMs?: number;
}

export type ExtensionMessage =
  | { type: 'stream.delta'; payload: StreamDeltaPayload }
  | { type: 'stream.complete'; payload: StreamCompletePayload }
  | { type: 'stream.error'; payload: StreamErrorPayload }
  | { type: 'tool.call.start'; payload: ToolCallStartPayload }
  | { type: 'tool.call.end'; payload: ToolCallEndPayload }
  | { type: 'tool.result'; payload: ToolResultPayload }
  | { type: 'timeline.update'; payload: TimelineUpdatePayload }
  | { type: 'mode.changed'; payload: ModeChangedPayload }
  | { type: 'history.loaded'; payload: HistoryLoadedPayload }
  | { type: 'settings.loaded'; payload: SettingsLoadedPayload }
  | { type: 'mention.results'; payload: MentionResultsPayload }
  | ChatStreamEvent
  | { type: 'session.new'; payload?: Record<string, never> }
  | { type: 'mode.switch'; payload?: Record<string, never> }
  | { type: 'focus.input'; payload?: Record<string, never> }
  | { type: 'inline.edit.request'; payload?: Record<string, unknown> }
  | { type: 'host.sessions.hydrate'; payload: HostSessionsHydratePayload }
  | { type: 'checkpoint.listResult'; payload: CheckpointListResultPayload }
  | { type: 'worktree.review.result'; payload: WorktreeReviewResultPayload }
  | { type: 'worktree.apply.result'; payload: WorktreeApplyResultPayload }
  | { type: 'worktree.reject.result'; payload: WorktreeRejectResultPayload };

// ─── 유틸리티 ──────────────────────────────────────────

const VALID_TYPES = new Set<string>([
  'chat.message', 'chat.send', 'chat.stop', 'stop.stream', 'regenerate',
  'edit.message', 'delete.message', 'pin.message',
  'switch.mode', 'mention.request', 'settings.open', 'focus.input',
  'stream.delta', 'stream.complete', 'stream.error', 'chat.stream',
  'tool.call.start', 'tool.call.end', 'tool.result',
  'timeline.update', 'mode.changed', 'history.loaded',
  'settings.loaded', 'mention.results',
  'session.new', 'mode.switch',
  // ADDON-T06: host session persistence
  'host.sessions.persist', 'host.sessions.ready', 'host.sessions.hydrate',
  // ADDON-T07: checkpoint list/restore UX
  'checkpoint.list', 'checkpoint.listResult', 'checkpoint.restore',
  // Subagent worktree review / apply / reject
  'worktree.review', 'worktree.apply', 'worktree.reject',
  'worktree.review.result', 'worktree.apply.result', 'worktree.reject.result',
  // ADDON-T10: /compact best-effort host hook
  'session.compact'
]);

export function validateMessageType(type: string): boolean {
  const valid = VALID_TYPES.has(type);
  if (!valid) {
    console.error(`[Agent K] Unknown message type: ${type}`);
  }
  return valid;
}
