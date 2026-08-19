import React from 'react';
import { WorkTimeline } from './WorkTimeline';
import type { ConversationWorkEvent } from '../conversation/conversationWorkEvent';
import type { FileEditPreview, TerminalRunPreview } from '../types';
import { ChangeSummary, type ChangeSummaryItem } from './ChangeSummary';

export interface AgentTurnProps {
  lead?: React.ReactNode;
  workItems?: ConversationWorkEvent[];
  fileEdits?: FileEditPreview[];
  terminalRuns?: TerminalRunPreview[];
  changes?: ChangeSummaryItem[];
  children?: React.ReactNode;
  onReviewChanges?: () => void;
  onOpenFile?: (path: string) => void;
}

/** Presentation-only agent turn. Existing loop/message state remains the source of truth. */
export function AgentTurn({
  lead,
  workItems = [],
  fileEdits = [],
  terminalRuns = [],
  changes = [],
  children,
  onReviewChanges,
  onOpenFile,
}: AgentTurnProps) {
  return (
    <article className="conversation-turn ak-agent-turn">
      {lead ? <div className="ak-agent-turn__lead">{lead}</div> : null}
      <WorkTimeline
        items={workItems}
        fileEdits={fileEdits}
        terminalRuns={terminalRuns}
        onOpenFile={onOpenFile}
      />
      {children ? <div className="ak-agent-turn__response">{children}</div> : null}
      <ChangeSummary files={changes} onReview={onReviewChanges} onOpenFile={onOpenFile} />
    </article>
  );
}
