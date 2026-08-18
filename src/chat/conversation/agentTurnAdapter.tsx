import React from 'react';
import { AgentTurn } from '../components/AgentTurn';
import type { WorkItem } from '../components/WorkTimeline';
import type { ChangeSummaryItem } from '../components/ChangeSummary';

export interface AgentTurnAdapterProps {
  message: any;
  workItems?: WorkItem[];
  changes?: ChangeSummaryItem[];
  children?: React.ReactNode;
  onReviewChanges?: () => void;
  onOpenFile?: (path: string) => void;
}

/**
 * Presentation adapter for Phase 2.
 * Keeps message/agent state outside the presentation components while making
 * the AgentTurn shell usable from ConversationTurn without changing behavior.
 */
export function AgentTurnAdapter({
  message,
  workItems = [],
  changes = [],
  children,
  onReviewChanges,
  onOpenFile,
}: AgentTurnAdapterProps) {
  const lead = message?.role === 'assistant' && message?.title
    ? message.title
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
