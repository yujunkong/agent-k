/**
 * HOST-008 — Plan V2 generate host bridge (stub until packages/plan).
 */

import type { RequestId } from '@agent-k/shared';
import * as vscode from 'vscode';

export type PlanGenerateContext = {
  webview: vscode.Webview | undefined;
  /** requestId → abort + owning session (parallel-tab isolation) */
  planV2Aborts: Map<string, { abort: AbortController; sessionId: string }>;
  planV2CancelledIds: Set<string>;
  abortPlanV2Generate: (requestId?: string) => void;
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
export function abortPlanV2Generate(
  ctx: PlanGenerateContext,
  requestId?: string,
): void {
  if (requestId) {
    const entry = ctx.planV2Aborts.get(requestId);
    if (entry) {
      entry.abort.abort();
      ctx.planV2Aborts.delete(requestId);
      ctx.planV2CancelledIds.add(requestId);
    }
    return;
  }
  for (const [id, entry] of ctx.planV2Aborts) {
    entry.abort.abort();
    ctx.planV2CancelledIds.add(id);
  }
  ctx.planV2Aborts.clear();
}

/**
 * Plan V2 LLM generation stub — acknowledges cancel / reports plan package pending.
 */
export async function runPlanV2Generate(
  ctx: PlanGenerateContext,
  message: { requestId: RequestId; sessionId?: string },
): Promise<void> {
  const requestId = String(message.requestId);
  const sessionId = String(message.sessionId || '').trim() || undefined;
  const post = (payload: Record<string, unknown>) =>
    void ctx.webview?.postMessage({
      type: 'plan.v2.generate.result',
      requestId,
      sessionId,
      ...payload,
    });

  if (ctx.planV2CancelledIds.has(requestId)) {
    ctx.planV2CancelledIds.delete(requestId);
    post({ error: 'Plan generation cancelled.', aborted: true });
    return;
  }

  abortPlanV2Generate(ctx, requestId);
  ctx.planV2CancelledIds.delete(requestId);
  const abort = new AbortController();
  ctx.planV2Aborts.set(requestId, { abort, sessionId: sessionId || '' });

  try {
    if (abort.signal.aborted) {
      post({ error: 'Plan generation cancelled.', aborted: true });
      return;
    }
    post({
      error: 'Plan generate not wired yet (packages/plan / PLAN-* pending).',
    });
  } finally {
    ctx.planV2Aborts.delete(requestId);
  }
}
