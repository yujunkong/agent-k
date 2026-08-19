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
  onReviewChanges?: () => void;
  onOpenFile?: (path: string) => void;
}

/** Presentation adapter: owns no agent/message state. */
export function AgentTurnAdapter({
  message,
  workItems = [],
  changes = [],
  children,
  onReviewChanges,
  onOpenFile,
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
      onReviewChanges={onReviewChanges}
      onOpenFile={onOpenFile}
    >
      {children}
    </AgentTurn>
  );
}
