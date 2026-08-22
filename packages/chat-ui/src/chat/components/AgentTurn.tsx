import React from 'react';
import { WorkTimeline } from './WorkTimeline';
import type { ConversationWorkEvent } from '../conversation/conversationWorkEvent';
import type { FileEditPreview, TerminalRunPreview } from '../types';
import { ChangeSummary, type ChangeSummaryItem } from './ChangeSummary';
import type { MessageStep } from './MessageSteps';

export interface AgentTurnProps {
  lead?: React.ReactNode;
  workItems?: ConversationWorkEvent[];
  /** Host timeline rows — MessageSteps sequential chrome (via WorkTimeline). */
  steps?: MessageStep[];
  fileEdits?: FileEditPreview[];
  terminalRuns?: TerminalRunPreview[];
  turnProse?: Array<{ id: string; turn: number; content: string; afterStepId?: string }>;
  /**
   * Streaming assistant body — rendered inside MessageSteps under Explored
   * (not below Planning / bubble gap).
   */
  liveProse?: string;
  changes?: ChangeSummaryItem[];
  isStreaming?: boolean;
  /** Assistant answer body is streaming — suppress Planning next moves */
  hasLiveAnswer?: boolean;
  workedDurationMs?: number;
  children?: React.ReactNode;
  onOpenSubagent?: (subagentId: string, title: string) => void;
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
  onWorktreeReview?: (subagentId: string) => void;
  onWorktreeApply?: (subagentId: string) => void;
  onWorktreeReject?: (subagentId: string) => void;
}

/** Presentation-only agent turn. Existing loop/message state remains the source of truth. */
export function AgentTurn({
  lead,
  workItems = [],
  steps = [],
  fileEdits = [],
  terminalRuns = [],
  turnProse = [],
  liveProse,
  changes = [],
  isStreaming = false,
  hasLiveAnswer = false,
  workedDurationMs,
  children,
  onOpenSubagent,
  onOpenFile,
  onAcceptFile,
  onRejectFile,
  onWorktreeReview,
  onWorktreeApply,
  onWorktreeReject
}: AgentTurnProps) {
  return (
    <article className="conversation-turn ak-agent-turn">
      {lead ? <div className="ak-agent-turn__lead">{lead}</div> : null}
      <WorkTimeline
        items={workItems}
        steps={steps}
        fileEdits={fileEdits}
        terminalRuns={terminalRuns}
        turnProse={turnProse}
        liveProse={liveProse}
        isStreaming={isStreaming}
        hasLiveAnswer={hasLiveAnswer}
        workedDurationMs={workedDurationMs}
        onOpenSubagent={onOpenSubagent}
        onOpenFile={onOpenFile}
        onAcceptFile={onAcceptFile}
        onRejectFile={onRejectFile}
        onWorktreeReview={onWorktreeReview}
        onWorktreeApply={onWorktreeApply}
        onWorktreeReject={onWorktreeReject}
      />
      {children ? <div className="ak-agent-turn__response">{children}</div> : null}
      <ChangeSummary files={changes} onOpenFile={onOpenFile} />
    </article>
  );
}
