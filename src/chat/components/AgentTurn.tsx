import React from 'react';
import { WorkTimeline, type WorkItem } from './WorkTimeline';
import { ChangeSummary, type ChangeSummaryItem } from './ChangeSummary';

export interface AgentTurnProps {
  lead?: React.ReactNode;
  workItems?: WorkItem[];
  changes?: ChangeSummaryItem[];
  children?: React.ReactNode;
  onReviewChanges?: () => void;
  onOpenFile?: (path: string) => void;
}

/** Presentation-only agent turn. Existing loop/message state remains the source of truth. */
export function AgentTurn({
  lead,
  workItems = [],
  changes = [],
  children,
  onReviewChanges,
  onOpenFile,
}: AgentTurnProps) {
  return (
    <article className="ak-agent-turn">
      {lead ? <div className="ak-agent-turn__lead">{lead}</div> : null}
      <WorkTimeline items={workItems} />
      {children ? <div className="ak-agent-turn__response">{children}</div> : null}
      <ChangeSummary files={changes} onReview={onReviewChanges} onOpenFile={onOpenFile} />
    </article>
  );
}
