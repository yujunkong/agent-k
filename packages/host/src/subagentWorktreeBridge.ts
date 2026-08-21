/**
 * HOST-012 — Webview ↔ Host handlers for subagent worktree review / apply / reject.
 */

import * as vscode from 'vscode';
import {
  applyRegisteredSubagentWorktree,
  rejectRegisteredSubagentWorktree,
  reviewRegisteredSubagentWorktree,
} from './subagentWorktreeRegistry';

function post(webview: vscode.Webview | undefined, payload: Record<string, unknown>) {
  if (!webview) return;
  void webview.postMessage(payload);
}

export async function handleWorktreeReviewMessage(
  webview: vscode.Webview | undefined,
  message: Record<string, unknown>,
): Promise<void> {
  const subagentId = String(message.subagentId || '').trim();
  const requestId = String(message.requestId || subagentId);
  if (!subagentId) {
    post(webview, {
      type: 'worktree.review.result',
      requestId,
      success: false,
      error: 'subagentId is required',
    });
    return;
  }
  try {
    const review = reviewRegisteredSubagentWorktree(subagentId);
    post(webview, {
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
    post(webview, {
      type: 'worktree.review.result',
      requestId,
      subagentId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleWorktreeApplyMessage(
  webview: vscode.Webview | undefined,
  message: Record<string, unknown>,
): Promise<void> {
  const subagentId = String(message.subagentId || '').trim();
  const requestId = String(message.requestId || subagentId);
  if (!subagentId) {
    post(webview, {
      type: 'worktree.apply.result',
      requestId,
      success: false,
      error: 'subagentId is required',
    });
    return;
  }
  const result = await applyRegisteredSubagentWorktree(subagentId);
  post(webview, {
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
  webview: vscode.Webview | undefined,
  message: Record<string, unknown>,
): Promise<void> {
  const subagentId = String(message.subagentId || '').trim();
  const requestId = String(message.requestId || subagentId);
  if (!subagentId) {
    post(webview, {
      type: 'worktree.reject.result',
      requestId,
      success: false,
      error: 'subagentId is required',
    });
    return;
  }
  try {
    await rejectRegisteredSubagentWorktree(subagentId);
    post(webview, {
      type: 'worktree.reject.result',
      requestId,
      subagentId,
      success: true,
    });
  } catch (error) {
    post(webview, {
      type: 'worktree.reject.result',
      requestId,
      subagentId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
