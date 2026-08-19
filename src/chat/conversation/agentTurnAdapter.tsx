import React from 'react';
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
  const candidate = message as { role?: string; title?: unknown } | null;
  const lead = candidate?.role === 'assistant' && typeof candidate.title === 'string'
    ? candidate.title
    : undefined;

  return (
    <AgentTurn
      lead={lead}
      workItems={workItems}
      changes={changes}
      onReviewChanges={onReviewChanges}
      onOpenFile={onOpenFile}
    >
      {children}
    </AgentTurn>
  );
}
