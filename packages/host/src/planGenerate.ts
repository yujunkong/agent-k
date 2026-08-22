/**
 * HOST-008 — Plan V2 generate host bridge (stub until packages/plan).
 */

import type { RequestId } from '@agent-k/shared';
import * as vscode from 'vscode';

export type PlanGenerateContext = {
  webview: vscode.Webview | undefined;
  /** requestId → abort + owning session (parallel-tab isolation) */
  planGenerateAborts: Map<string, { abort: AbortController; sessionId: string }>;
  planGenerateCancelledIds: Set<string>;
  abortPlanGenerate: (requestId?: string) => void;
};

export function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = String((error as { name?: string }).name || '');
    if (name === 'AbortError') return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /aborted|AbortError/i.test(message);
}

/** Cancel one or all in-flight Plan V2 generates. */
export function abortPlanGenerate(
  ctx: PlanGenerateContext,
  requestId?: string,
): void {
  if (requestId) {
    const entry = ctx.planGenerateAborts.get(requestId);
    if (entry) {
      entry.abort.abort();
      ctx.planGenerateAborts.delete(requestId);
      ctx.planGenerateCancelledIds.add(requestId);
    }
    return;
  }
  for (const [id, entry] of ctx.planGenerateAborts) {
    entry.abort.abort();
    ctx.planGenerateCancelledIds.add(id);
  }
  ctx.planGenerateAborts.clear();
}

/**
 * Plan V2 LLM generation stub — acknowledges cancel / reports plan package pending.
 */
export async function runPlanGenerate(
  ctx: PlanGenerateContext,
  message: { requestId: RequestId; sessionId?: string },
): Promise<void> {
  const requestId = String(message.requestId);
  const sessionId = String(message.sessionId || '').trim() || undefined;
  const post = (payload: Record<string, unknown>) =>
    void ctx.webview?.postMessage({
      type: 'plan.generate.result',
      requestId,
      sessionId,
      ...payload,
    });

  if (ctx.planGenerateCancelledIds.has(requestId)) {
    ctx.planGenerateCancelledIds.delete(requestId);
    post({ error: 'Plan generation cancelled.', aborted: true });
    return;
  }

  abortPlanGenerate(ctx, requestId);
  ctx.planGenerateCancelledIds.delete(requestId);
  const abort = new AbortController();
  ctx.planGenerateAborts.set(requestId, { abort, sessionId: sessionId || '' });

  try {
    if (abort.signal.aborted) {
      post({ error: 'Plan generation cancelled.', aborted: true });
      return;
    }
    post({
      error: 'Plan generate not wired yet (packages/plan / PLAN-* pending).',
    });
  } finally {
    ctx.planGenerateAborts.delete(requestId);
  }
}
