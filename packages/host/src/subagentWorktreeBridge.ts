/**
 * HOST-012 / WT-015 — vscode Webview adapters over @agent-k/worktree bridge.
 */
import * as vscode from 'vscode';
import {
  handleWorktreeApplyMessage as domainApply,
  handleWorktreeRejectMessage as domainReject,
  handleWorktreeReviewMessage as domainReview,
} from '@agent-k/worktree';

function post(webview: vscode.Webview | undefined, payload: Record<string, unknown>) {
  if (!webview) return;
  void webview.postMessage(payload);
}

export async function handleWorktreeReviewMessage(
  webview: vscode.Webview | undefined,
  message: Record<string, unknown>
): Promise<void> {
  await domainReview((payload) => post(webview, payload), message);
}

export async function handleWorktreeApplyMessage(
  webview: vscode.Webview | undefined,
  message: Record<string, unknown>
): Promise<void> {
  await domainApply((payload) => post(webview, payload), message);
}

export async function handleWorktreeRejectMessage(
  webview: vscode.Webview | undefined,
  message: Record<string, unknown>
): Promise<void> {
  await domainReject((payload) => post(webview, payload), message);
}
