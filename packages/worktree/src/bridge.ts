/**
 * WT-015 — Host ↔ worktree bridge payloads (no vscode).
 * Host posts these via webview.postMessage; domain stays package-local.
 */
import {
  applyRegisteredSubagentWorktree,
  rejectRegisteredSubagentWorktree,
  reviewRegisteredSubagentWorktree,
} from './registry';

export type WorktreeBridgePost = (payload: Record<string, unknown>) => void;

export async function handleWorktreeReviewMessage(
  post: WorktreeBridgePost,
  message: Record<string, unknown>
): Promise<void> {
  const subagentId = String(message.subagentId || '').trim();
  const requestId = String(message.requestId || subagentId);
  if (!subagentId) {
    post({
      type: 'worktree.review.result',
      requestId,
      success: false,
      error: 'subagentId is required',
    });
    return;
  }
  try {
    const review = reviewRegisteredSubagentWorktree(subagentId);
    post({
      type: 'worktree.review.result',
      requestId,
      subagentId,
      success: true,
      worktreePath: review.worktree.path,
      worktreeBranch: review.worktree.branch,
      filesChanged: review.snapshot.filesChanged,
      files: review.snapshot.files,
      diff: review.diff.slice(0, 80_000),
      untrackedFiles: review.untrackedFiles,
    });
  } catch (error) {
    post({
      type: 'worktree.review.result',
      requestId,
      subagentId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleWorktreeApplyMessage(
  post: WorktreeBridgePost,
  message: Record<string, unknown>
): Promise<void> {
  const subagentId = String(message.subagentId || '').trim();
  const requestId = String(message.requestId || subagentId);
  if (!subagentId) {
    post({
      type: 'worktree.apply.result',
      requestId,
      success: false,
      error: 'subagentId is required',
    });
    return;
  }
  const result = await applyRegisteredSubagentWorktree(subagentId);
  post({
    type: 'worktree.apply.result',
    requestId,
    subagentId,
    success: result.applied,
    applied: result.applied,
    removed: result.removed,
    filesChanged: result.filesChanged,
    error: result.error,
  });
}

export async function handleWorktreeRejectMessage(
  post: WorktreeBridgePost,
  message: Record<string, unknown>
): Promise<void> {
  const subagentId = String(message.subagentId || '').trim();
  const requestId = String(message.requestId || subagentId);
  if (!subagentId) {
    post({
      type: 'worktree.reject.result',
      requestId,
      success: false,
      error: 'subagentId is required',
    });
    return;
  }
  try {
    await rejectRegisteredSubagentWorktree(subagentId);
    post({
      type: 'worktree.reject.result',
      requestId,
      subagentId,
      success: true,
    });
  } catch (error) {
    post({
      type: 'worktree.reject.result',
      requestId,
      subagentId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
