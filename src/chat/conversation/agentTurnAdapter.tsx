import React from 'react';
import type { FileEditPreview, TerminalRunPreview } from '../types';
import { AgentTurn } from '../components/AgentTurn';
import type { ConversationWorkEvent } from './conversationWorkEvent';
import type { ChangeSummaryItem } from '../components/ChangeSummary';

export interface AgentTurnAdapterProps {
  message: unknown;
  workItems?: ConversationWorkEvent[];
  changes?: ChangeSummaryItem[];
  children?: React.ReactNode;
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
  onWorktreeReview?: (subagentId: string) => void;
  onWorktreeApply?: (subagentId: string) => void;
  onWorktreeReject?: (subagentId: string) => void;
}

/** Presentation adapter: owns no agent/message state. */
export function AgentTurnAdapter({
  message,
  workItems = [],
  changes = [],
  children,
  onOpenFile,
  onAcceptFile,
  onRejectFile,
  onWorktreeReview,
  onWorktreeApply,
  onWorktreeReject
}: AgentTurnAdapterProps) {
  const candidate = message as {
    role?: string;
    title?: unknown;
    fileEdits?: FileEditPreview[];
    terminalRuns?: TerminalRunPreview[];
  } | null;
  const lead = candidate?.role === 'assistant' && typeof candidate.title === 'string'
    ? candidate.title
    : undefined;
  const fileEdits = Array.isArray(candidate?.fileEdits) ? candidate.fileEdits : [];
  const terminalRuns = Array.isArray(candidate?.terminalRuns) ? candidate.terminalRuns : [];

  return (
    <AgentTurn
      lead={lead}
      workItems={workItems}
      fileEdits={fileEdits}
      terminalRuns={terminalRuns}
      changes={changes}
      onOpenFile={onOpenFile}
      onAcceptFile={onAcceptFile}
      onRejectFile={onRejectFile}
      onWorktreeReview={onWorktreeReview}
      onWorktreeApply={onWorktreeApply}
      onWorktreeReject={onWorktreeReject}
    >
      {children}
    </AgentTurn>
  );
}
