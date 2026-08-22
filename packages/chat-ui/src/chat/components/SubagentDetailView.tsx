/**
 * Subagent detail pane — same WorkTimeline progress as the main chat,
 * without a composer / chat input (Cursor-style agent tab).
 */
import React, { useMemo } from 'react';
import { WorkTimeline } from './WorkTimeline';
import {
  flattenSubagentWorkItems,
  type ConversationWorkEvent
} from '../conversation/conversationWorkEvent';
import type { FileEditPreview, TerminalRunPreview } from '../types';

export type SubagentDetailTab = {
  /** Same as subagentId — stable tab key */
  id: string;
  title: string;
  parentSessionId: string;
};

function previewBelongsToSubagent(
  previewId: string,
  toolId: string | undefined,
  subagentId: string,
  refIds: Set<string>,
  eventIds: Set<string>
): boolean {
  if (refIds.has(previewId) || (toolId && refIds.has(toolId))) return true;
  if (toolId && eventIds.has(toolId)) return true;
  const prefix = `tl_sub_${subagentId}_`;
  if (toolId && toolId.startsWith(prefix)) return true;
  return false;
}

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
  workedDurationMs?: number;
} {
  const raw: ConversationWorkEvent[] = [];
  const editIds = new Set<string>();
  const termIds = new Set<string>();
  const eventIds = new Set<string>();
  let isStreaming = false;

  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    const workItems = Array.isArray(m.workItems) ? m.workItems : [];
    for (const w of workItems) {
      if (w.subagentId === subagentId || w.id === `tl_subagent_${subagentId}`) {
        raw.push(w);
        eventIds.add(w.id);
        if (w.status === 'running' || w.status === 'pending') isStreaming = true;
        if (w.ref?.kind === 'fileEdit') editIds.add(w.ref.id);
        if (w.ref?.kind === 'terminal') termIds.add(w.ref.id);
      }
    }
    if (m.status === 'streaming') {
      // Parent still streaming — keep detail live if this subagent has running rows.
      if (raw.some((w) => w.status === 'running' || w.status === 'pending')) {
        isStreaming = true;
      }
    }
  }

  const { header, steps } = flattenSubagentWorkItems(raw, subagentId);
  // Header complete/error wins — leftover Thought rows must not keep "Running…".
  if (header && (header.status === 'complete' || header.status === 'error')) {
    isStreaming = false;
  }

  const fileEdits: FileEditPreview[] = [];
  const terminalRuns: TerminalRunPreview[] = [];
  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    for (const f of m.fileEdits || []) {
      if (
        previewBelongsToSubagent(f.id, f.toolId, subagentId, editIds, eventIds)
      ) {
        fileEdits.push(f);
      }
    }
    for (const t of m.terminalRuns || []) {
      if (
        previewBelongsToSubagent(t.id, t.toolId, subagentId, termIds, eventIds)
      ) {
        terminalRuns.push(t);
      }
    }
  }

  const fromSteps = steps.reduce((sum, event) => {
    if (event.startedAt != null && event.completedAt != null) {
      return sum + Math.max(0, event.completedAt - event.startedAt);
    }
    return sum;
  }, 0);
  const workedDurationMs = header?.result?.durationMs ?? (fromSteps > 0 ? fromSteps : undefined);

  return { items: steps, fileEdits, terminalRuns, isStreaming, workedDurationMs };
}

export function SubagentDetailView({
  title,
  items,
  fileEdits = [],
  terminalRuns = [],
  isStreaming = false,
  workedDurationMs,
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
  workedDurationMs?: number;
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
            workedDurationMs={workedDurationMs}
            /* Detail tab: always expanded, Cursor-style sequential steps (no Worked collapse). */
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
