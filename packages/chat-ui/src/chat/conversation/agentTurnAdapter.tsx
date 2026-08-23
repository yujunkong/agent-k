import React from 'react';
import type { FileEditPreview, TerminalRunPreview } from '../types';
import { AgentTurn, type AgentTurnProps } from '../components/AgentTurn';
import type { ConversationWorkEvent } from './conversationWorkEvent';

export interface AgentTurnAdapterProps {
  message: unknown;
  workItems?: ConversationWorkEvent[];
  isStreaming?: boolean;
  children?: React.ReactNode;
  onOpenSubagent?: (subagentId: string, title: string) => void;
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
  isStreaming = false,
  children,
  onOpenSubagent,
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
    content?: unknown;
    status?: string;
    steps?: AgentTurnProps['steps'];
    fileEdits?: FileEditPreview[];
    terminalRuns?: TerminalRunPreview[];
    turnProse?: AgentTurnProps['turnProse'];
    workedDurationMs?: number;
  } | null;
  const lead = candidate?.role === 'assistant' && typeof candidate.title === 'string'
    ? candidate.title
    : undefined;
  const steps = Array.isArray(candidate?.steps) ? candidate.steps : [];
  const fileEdits = Array.isArray(candidate?.fileEdits) ? candidate.fileEdits : [];
  const terminalRuns = Array.isArray(candidate?.terminalRuns) ? candidate.terminalRuns : [];
  const turnProse = Array.isArray(candidate?.turnProse) ? candidate.turnProse : [];
  const content =
    typeof candidate?.content === 'string' ? candidate.content : '';
  // Comment: stream dig + final answer inside MessageSteps (under Explored), not bubble gap
  const liveProse = isStreaming && content.trim() ? content : undefined;
  const hasLiveAnswer = Boolean(liveProse);

  return (
    <AgentTurn
      lead={lead}
      workItems={workItems}
      steps={steps}
      fileEdits={fileEdits}
      terminalRuns={terminalRuns}
      turnProse={turnProse}
      liveProse={liveProse}
      isStreaming={isStreaming}
      hasLiveAnswer={hasLiveAnswer}
      workedDurationMs={candidate?.workedDurationMs}
      onOpenSubagent={onOpenSubagent}
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
