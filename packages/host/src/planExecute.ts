/**
 * HOST-008 — Plan execute host bridge (stub until packages/plan execution).
 */

import type { RequestId } from '@agent-k/shared';
import * as vscode from 'vscode';

export type PlanExecuteHostContext = {
  webview: vscode.Webview | undefined;
};

/**
 * Acknowledge plan.execute and report that execution runtime is not wired.
 */
export async function runHostPlanExecute(
  ctx: PlanExecuteHostContext,
  message: { requestId: RequestId },
): Promise<void> {
  const requestId = String(message.requestId);
  if (!ctx.webview) return;
  void ctx.webview.postMessage({
    type: 'plan.execution.error',
    requestId,
    error: 'Plan execute not wired yet (packages/plan / EXEC-* pending).',
  });
}
