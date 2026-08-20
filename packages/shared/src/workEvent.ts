/**
 * Typed Conversation Work Event contracts (R-002).
 * Pure types + labels only — mappers that need host timeline helpers stay in chat-ui.
 */
import type { SubagentResult } from './subagentResult';

export type ConversationWorkType =
  | 'thinking'
  | 'read'
  | 'search'
  | 'edit'
  | 'terminal'
  | 'verify'
  | 'generic'
  | 'subagent'
  | 'plan';

export type ConversationWorkStatus = 'pending' | 'running' | 'complete' | 'error';

export type ConversationWorkEvent = {
  id: string;
  type: ConversationWorkType;
  status: ConversationWorkStatus;
  label: string;
  /** Host tool name — Grepped vs Searched, line-range read detail, etc. */
  toolName?: string;
  detail?: string;
  startedAt?: number;
  completedAt?: number;
  /** Child preview: FileEditCard or TerminalRunCard under this row. */
  ref?: { kind: 'fileEdit' | 'terminal'; id: string };
  /** Host subagent id — WorkTimeline groups child rows under this parent. */
  subagentId?: string;
  parentTurnId?: string;
  /** Short Cursor-style progress title from task_run.description (3–5 words). */
  description?: string;
  /** Completion stats from subagent.event — not a child transcript. */
  result?: SubagentResult;
  /** Plan execution correlation — connects this event to the DAG run. */
  executionId?: string;
  taskId?: string;
};

export const WORK_TYPE_LABEL: Record<ConversationWorkType, string> = {
  thinking: 'Thinking',
  read: 'Read',
  search: 'Search',
  edit: 'Edit',
  terminal: 'Terminal',
  verify: 'Verify',
  generic: 'Work',
  subagent: 'Subagent',
  plan: 'Plan'
};

/** Host → webview tool/timeline payload used to build ConversationWorkEvent. */
export type HostWorkPayload = {
  id?: string;
  toolName?: string;
  kind?: string;
  detail?: string;
  status?: string;
  error?: string;
  turn?: number;
  subagentId?: string;
  parentTurnId?: string;
  role?: string;
  prompt?: string;
  description?: string;
  summary?: string;
  filesChanged?: number;
  toolCount?: number;
  duration?: number;
  durationMs?: number;
};
