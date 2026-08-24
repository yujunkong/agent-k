/**
 * HOST-008b — Plan V2 generate host bridge → @agent-k/plan.
 */

import type { RequestId } from '@agent-k/shared';
import { generatePlanForHost, resolveWorkspaceRepoRoot } from '@agent-k/plan';
import { LiteLLMProvider } from '@agent-k/providers';
import * as vscode from 'vscode';

export type PlanGenerateContext = {
  webview: vscode.Webview | undefined;
  /** requestId → abort + owning session (parallel-tab isolation) */
  planGenerateAborts: Map<string, { abort: AbortController; sessionId: string }>;
  planGenerateCancelledIds: Set<string>;
  abortPlanGenerate: (requestId?: string) => void;
};

export type PlanGenerateMessage = {
  requestId: RequestId;
  sessionId?: string;
  goal?: string;
  researchContext?: string;
  rejectionFeedback?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
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
 * Plan V2 LLM generation via packages/plan PlanSchemaGenerator.
 */
export async function runPlanGenerate(
  ctx: PlanGenerateContext,
  message: PlanGenerateMessage,
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

    const goal = String(message.goal || '').trim();
    if (!goal) {
      post({ error: 'Plan generate requires a non-empty goal.' });
      return;
    }

    const baseUrl = String(message.baseUrl || '').trim();
    const model = String(message.model || '').trim() || 'default';
    if (!baseUrl) {
      post({ error: 'Plan generate requires provider baseUrl.' });
      return;
    }

    const repoRoot = resolveWorkspaceRepoRoot(vscode.workspace.workspaceFolders);
    const provider = new LiteLLMProvider({
      id: 'agent-k-plan',
      name: 'Agent K Plan',
      type: 'litellm',
      baseUrl,
      apiKey: message.apiKey,
      model,
    });

    void ctx.webview?.postMessage({
      type: 'plan.generate.started',
      requestId,
      sessionId,
    });

    const result = await generatePlanForHost({
      goal,
      researchContext: message.researchContext,
      rejectionFeedback: message.rejectionFeedback,
      repoRoot,
      provider,
      model,
      signal: abort.signal,
      persist: Boolean(repoRoot),
    });

    if (abort.signal.aborted || ctx.planGenerateCancelledIds.has(requestId)) {
      post({ error: 'Plan generation cancelled.', aborted: true });
      return;
    }

    if (!result.ok || !result.plan) {
      const last = result.failures[result.failures.length - 1];
      const detail = last?.errors?.[0]?.message;
      post({
        error:
          detail ||
          `Plan generation failed after ${result.attempts} attempt(s).`,
        result,
      });
      return;
    }

    post({
      document: result.plan,
      phase: 'review',
      result,
    });
  } catch (error) {
    if (isAbortError(error) || abort.signal.aborted) {
      post({ error: 'Plan generation cancelled.', aborted: true });
      return;
    }
    post({
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    ctx.planGenerateAborts.delete(requestId);
    ctx.planGenerateCancelledIds.delete(requestId);
  }
}
