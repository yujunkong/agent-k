/**
 * Subagent detail pane — same WorkTimeline progress as the main chat,
 * without a composer / chat input (Cursor-style agent tab).
 */
import React, { useMemo } from 'react';
import { WorkTimeline } from './WorkTimeline';
import type { ConversationWorkEvent } from '../conversation/conversationWorkEvent';
import type { FileEditPreview, TerminalRunPreview } from '../types';

export type SubagentDetailTab = {
  /** Same as subagentId — stable tab key */
  id: string;
  title: string;
  parentSessionId: string;
};

/** Collect work events for one subagent across assistant messages. */
export function collectSubagentTimeline(
  messages: Array<{
    role?: string;
    workItems?: ConversationWorkEvent[];
    fileEdits?: FileEditPreview[];
    terminalRuns?: TerminalRunPreview[];
    status?: string;
  }>,
  subagentId: string
): {
  items: ConversationWorkEvent[];
  fileEdits: FileEditPreview[];
  terminalRuns: TerminalRunPreview[];
  isStreaming: boolean;
} {
  const items: ConversationWorkEvent[] = [];
  const editIds = new Set<string>();
  const termIds = new Set<string>();
  let isStreaming = false;

  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    const workItems = Array.isArray(m.workItems) ? m.workItems : [];
    for (const w of workItems) {
      if (w.subagentId === subagentId || w.id === `tl_subagent_${subagentId}`) {
        items.push(w);
        if (w.status === 'running' || w.status === 'pending') isStreaming = true;
        if (w.ref?.kind === 'fileEdit') editIds.add(w.ref.id);
        if (w.ref?.kind === 'terminal') termIds.add(w.ref.id);
      }
    }
    if (m.status === 'streaming') {
      // Parent still streaming — keep detail live if this subagent has running rows.
      if (items.some((w) => w.status === 'running' || w.status === 'pending')) {
        isStreaming = true;
      }
    }
  }

  const header = items.find(
    (w) => w.id === `tl_subagent_${subagentId}` || (w.type === 'subagent' && w.subagentId === subagentId)
  );
  // Header complete/error wins — leftover Thought rows must not keep "Running…".
  if (header && (header.status === 'complete' || header.status === 'error')) {
    isStreaming = false;
  }

  const fileEdits: FileEditPreview[] = [];
  const terminalRuns: TerminalRunPreview[] = [];
  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    for (const f of m.fileEdits || []) {
      if (editIds.has(f.id) || editIds.has(f.toolId || '')) fileEdits.push(f);
    }
    for (const t of m.terminalRuns || []) {
      if (termIds.has(t.id) || termIds.has(t.toolId || '')) terminalRuns.push(t);
    }
  }

  return { items, fileEdits, terminalRuns, isStreaming };
}

export function SubagentDetailView({
  title,
  items,
  fileEdits = [],
  terminalRuns = [],
  isStreaming = false,
  onBack,
  onOpenFile,
  onAcceptFile,
  onRejectFile,
  onWorktreeReview,
  onWorktreeApply,
  onWorktreeReject
}: {
  title: string;
  items: ConversationWorkEvent[];
  fileEdits?: FileEditPreview[];
  terminalRuns?: TerminalRunPreview[];
  isStreaming?: boolean;
  onBack: () => void;
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
  onWorktreeReview?: (subagentId: string) => void;
  onWorktreeApply?: (subagentId: string) => void;
  onWorktreeReject?: (subagentId: string) => void;
}) {
  const empty = items.length === 0;
  const subtitle = useMemo(() => {
    if (isStreaming) return 'Running…';
    const failed = items.some((i) => i.status === 'error');
    if (failed) return 'Failed';
    return 'Completed';
  }, [items, isStreaming]);

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
        {empty ? (
          <p className="ak-subagent-detail__empty">No progress yet for this agent.</p>
        ) : (
          <WorkTimeline
            items={items}
            fileEdits={fileEdits}
            terminalRuns={terminalRuns}
            isStreaming={isStreaming}
            defaultOpen
            subagentDetail
            onOpenFile={onOpenFile}
            onAcceptFile={onAcceptFile}
            onRejectFile={onRejectFile}
            onWorktreeReview={onWorktreeReview}
            onWorktreeApply={onWorktreeApply}
            onWorktreeReject={onWorktreeReject}
          />
        )}
      </div>
      {/* Intentionally no Composer — read-only progress surface */}
    </div>
  );
}
