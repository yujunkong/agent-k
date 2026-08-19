/**
 * Compact subagent completion stats for WorkTimeline.
 * Built from host subagent.event — never a copy of the child transcript.
 */

export type SubagentWorktreeOutcome =
  | 'pending'
  | 'applied'
  | 'rejected'
  | 'apply_failed'
  | 'reject_failed';

export type SubagentWorktreeAction =
  | 'idle'
  | 'reviewing'
  | 'applying'
  | 'rejecting';

export type SubagentWorktreeReviewPreview = {
  files?: string[];
  diff?: string;
  untrackedFiles?: string[];
  filesChanged?: number;
  worktreePath?: string;
  worktreeBranch?: string;
};

export type SubagentResult = {
  subagentId?: string;
  worktreePath?: string;
  summary?: string;
  filesChanged?: number;
  toolCount?: number;
  durationMs?: number;
  worktreeOutcome?: SubagentWorktreeOutcome;
  worktreeAction?: SubagentWorktreeAction;
  worktreeError?: string;
  worktreeReview?: SubagentWorktreeReviewPreview;
};

const MAX_SUBAGENT_SUMMARY = 280;

export function clipSubagentSummary(text: string | undefined): string | undefined {
  const clipped = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clipped) return undefined;
  return clipped.length > MAX_SUBAGENT_SUMMARY
    ? `${clipped.slice(0, MAX_SUBAGENT_SUMMARY - 1)}…`
    : clipped;
}

function finiteNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Host completion payload → UI model. Extra transcript fields are ignored. */
export function parseSubagentResult(
  data: Record<string, unknown>
): SubagentResult | undefined {
  const subagentId =
    String(data.taskId ?? data.subagentId ?? '').trim() || undefined;
  const worktreePath =
    data.worktreePath != null ? String(data.worktreePath).trim() : undefined;
  const summary = clipSubagentSummary(
    data.summary != null ? String(data.summary) : undefined
  );
  const filesChanged = finiteNumber(data.filesChanged);
  const toolCount = finiteNumber(data.toolCount ?? data.toolCalls);
  const durationMs = finiteNumber(data.durationMs ?? data.duration);
  if (
    summary == null &&
    filesChanged == null &&
    toolCount == null &&
    durationMs == null &&
    !subagentId &&
    !worktreePath
  ) {
    return undefined;
  }
  return { subagentId, worktreePath, summary, filesChanged, toolCount, durationMs };
}

export function formatSubagentDuration(durationMs: number): string {
  const sec = durationMs / 1000;
  if (sec < 10) return `${sec.toFixed(1)}s`;
  return `${Math.round(sec)}s`;
}

export function formatSubagentFilesChanged(count: number): string {
  return count === 1 ? '1 file changed' : `${count} files changed`;
}

export function formatSubagentToolCount(count: number): string {
  return count === 1 ? '1 tool' : `${count} tools`;
}

export function mergeSubagentResult(
  prev?: SubagentResult,
  incoming?: SubagentResult
): SubagentResult | undefined {
  if (!incoming) return prev;
  if (!prev) return incoming;
  return {
    summary: incoming.summary ?? prev.summary,
    filesChanged: incoming.filesChanged ?? prev.filesChanged,
    toolCount: incoming.toolCount ?? prev.toolCount,
    durationMs: incoming.durationMs ?? prev.durationMs,
    subagentId: incoming.subagentId ?? prev.subagentId,
    worktreePath: incoming.worktreePath ?? prev.worktreePath,
    worktreeOutcome: incoming.worktreeOutcome ?? prev.worktreeOutcome,
    worktreeAction: incoming.worktreeAction ?? prev.worktreeAction,
    worktreeError: incoming.worktreeError ?? prev.worktreeError,
    worktreeReview: incoming.worktreeReview ?? prev.worktreeReview
  };
}

export function defaultSubagentWorktreeOutcome(
  result: SubagentResult
): SubagentWorktreeOutcome {
  return result.worktreeOutcome ?? 'pending';
}

export function isSubagentWorktreeBusy(result: SubagentResult): boolean {
  const action = result.worktreeAction ?? 'idle';
  return action === 'reviewing' || action === 'applying' || action === 'rejecting';
}

export function canApplySubagentWorktree(result: SubagentResult): boolean {
  const outcome = defaultSubagentWorktreeOutcome(result);
  return (
    Boolean(result.subagentId) &&
    !isSubagentWorktreeBusy(result) &&
    outcome !== 'applied' &&
    outcome !== 'rejected'
  );
}

export function canRejectSubagentWorktree(result: SubagentResult): boolean {
  return canApplySubagentWorktree(result);
}

export function canReviewSubagentWorktree(result: SubagentResult): boolean {
  const outcome = defaultSubagentWorktreeOutcome(result);
  return (
    Boolean(result.subagentId) &&
    !isSubagentWorktreeBusy(result) &&
    outcome !== 'applied' &&
    outcome !== 'rejected'
  );
}

export function beginSubagentWorktreeAction(
  prev: SubagentResult,
  action: Exclude<SubagentWorktreeAction, 'idle'>
): SubagentResult {
  return {
    ...prev,
    worktreeAction: action,
    worktreeError: undefined
  };
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((entry) => String(entry).trim()).filter(Boolean);
  return items.length ? items : undefined;
}

export function applyHostWorktreeReviewResult(
  prev: SubagentResult,
  payload: Record<string, unknown>
): SubagentResult {
  const success = payload.success === true;
  if (!success) {
    return {
      ...prev,
      worktreeAction: 'idle',
      worktreeError: String(payload.error || 'Review failed')
    };
  }
  return {
    ...prev,
    worktreeAction: 'idle',
    worktreeError: undefined,
    worktreeReview: {
      files: stringList(payload.files),
      diff: payload.diff != null ? String(payload.diff) : undefined,
      untrackedFiles: stringList(payload.untrackedFiles),
      filesChanged: finiteNumber(payload.filesChanged),
      worktreePath:
        payload.worktreePath != null ? String(payload.worktreePath) : undefined,
      worktreeBranch:
        payload.worktreeBranch != null ? String(payload.worktreeBranch) : undefined
    }
  };
}

export function applyHostWorktreeApplyResult(
  prev: SubagentResult,
  payload: Record<string, unknown>
): SubagentResult {
  const success = payload.success === true && payload.applied === true;
  if (success) {
    return {
      ...prev,
      worktreeAction: 'idle',
      worktreeOutcome: 'applied',
      worktreeError: undefined
    };
  }
  return {
    ...prev,
    worktreeAction: 'idle',
    worktreeOutcome: 'apply_failed',
    worktreeError: String(payload.error || 'Apply failed')
  };
}

export function applyHostWorktreeRejectResult(
  prev: SubagentResult,
  payload: Record<string, unknown>
): SubagentResult {
  if (payload.success === true) {
    return {
      ...prev,
      worktreeAction: 'idle',
      worktreeOutcome: 'rejected',
      worktreeError: undefined
    };
  }
  return {
    ...prev,
    worktreeAction: 'idle',
    worktreeOutcome: 'reject_failed',
    worktreeError: String(payload.error || 'Reject failed')
  };
}
