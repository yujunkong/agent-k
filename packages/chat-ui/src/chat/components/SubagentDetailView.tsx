/**
 * Subagent detail pane — child ChatSession rendered with the **same**
 * ConversationTurn → AgentTurn → WorkTimeline → MessageSteps path as main chat.
 * Only chrome difference: Back header + no composer (ChatComposerFooter).
 *
 * CONV-009/010 / SUB-010
 */
import React, { useMemo } from 'react';
import { ConversationTurn } from './ConversationTurn';
import type { ChatMessage, FileEditPreview } from '../types';
import type { ConversationWorkEvent } from '../conversation/conversationWorkEvent';
import type { TerminalRunPreview } from '../types';

export type SubagentDetailTab = {
  /** Child ChatSession id (sess-sub-*) */
  id: string;
  title: string;
  parentSessionId: string;
  /** Runner task id when known */
  taskId?: string;
};

/** @deprecated Parent-filter path removed — child session is the source of truth. */
export function collectSubagentTimeline(
  _messages: Array<{
    role?: string;
    workItems?: ConversationWorkEvent[];
    fileEdits?: FileEditPreview[];
    terminalRuns?: TerminalRunPreview[];
    status?: string;
  }>,
  _subagentId: string
): {
  items: ConversationWorkEvent[];
  fileEdits: FileEditPreview[];
  terminalRuns: TerminalRunPreview[];
  isStreaming: boolean;
  workedDurationMs?: number;
} {
  return { items: [], fileEdits: [], terminalRuns: [], isStreaming: false };
}

export function SubagentDetailView({
  title,
  messages,
  onBack,
  onOpenFile,
  onAcceptFile,
  onRejectFile,
  onWorktreeReview,
  onWorktreeApply,
  onWorktreeReject
}: {
  title: string;
  /** Full child ChatSession transcript — same shape as main `messages` */
  messages: ChatMessage[];
  onBack: () => void;
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
  onWorktreeReview?: (subagentId: string) => void;
  onWorktreeApply?: (subagentId: string) => void;
  onWorktreeReject?: (subagentId: string) => void;
}) {
  const lastAssistantId = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant')?.id,
    [messages]
  );
  const isStreaming = useMemo(() => {
    const last = messages[messages.length - 1];
    return last?.role === 'assistant' && last.status === 'streaming';
  }, [messages]);
  const subtitle = isStreaming
    ? 'Running…'
    : messages.some((m) =>
        (m.workItems || []).some((i) => i.status === 'error')
      )
      ? 'Failed'
      : messages.length > 0
        ? 'Completed'
        : 'Waiting…';

  return (
    <div className="ak-subagent-detail" data-ak-view="subagent">
      <div className="ak-subagent-detail__header">
        <button type="button" className="ak-subagent-detail__back" onClick={onBack}>
          ← Back
        </button>
        <div className="ak-subagent-detail__titles">
          <div className="ak-subagent-detail__title">{title}</div>
          <div className="ak-subagent-detail__status">{subtitle}</div>
        </div>
      </div>
      <div className="ak-subagent-detail__body">
        {messages.length === 0 ? (
          <p className="ak-subagent-detail__empty">
            {isStreaming ? 'Waiting for subagent…' : 'No progress yet for this agent.'}
          </p>
        ) : (
          messages.map((item) => (
            <ConversationTurn
              key={item.id}
              message={item}
              isStreaming={isStreaming && item.id === lastAssistantId}
              isAgentRunning={isStreaming}
              isLastAssistant={item.id === lastAssistantId}
              // Comment: SUB-010 — prompt is read-only expand; no compose edit/copy
              userPromptMode="expand-only"
              onOpenFile={onOpenFile}
              onAcceptFile={onAcceptFile}
              onRejectFile={onRejectFile}
              onWorktreeReview={onWorktreeReview}
              onWorktreeApply={onWorktreeApply}
              onWorktreeReject={onWorktreeReject}
            />
          ))
        )}
      </div>
    </div>
  );
}
