import * as vscode from 'vscode';
import { resolveWorkspaceRelativeSegments } from './workspacePaths';
import { listWorkspaceFilePaths, primaryWorkspaceRepoRoot } from './planWorkspaceIndex';
import { appendWorkspaceContextToResearch } from '../plan/v2/workspaceContext';

export type PlanGenerateContext = {
  webview: vscode.Webview | undefined;
  planV2Aborts: Map<string, AbortController>;
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

/**
 * Plan V2 LLM generation. Always runs after the current AgentLoop chain
 * so research turns cannot keep posting after the webview has moved on.
 */
export async function runPlanV2Generate(ctx: PlanGenerateContext, message: any): Promise<void> {
  const requestId = String(message.requestId);
  const sessionId = String(message.sessionId || '').trim() || undefined;
  const post = (payload: Record<string, unknown>) =>
    void ctx.webview?.postMessage({ type: 'plan.v2.generate.result', requestId, sessionId, ...payload });

  if (ctx.planV2CancelledIds.has(requestId)) {
    ctx.planV2CancelledIds.delete(requestId);
    post({ error: 'Plan generation cancelled.', aborted: true });
    return;
  }
  // Cancel only this request; other tabs may be generating their own plans.
  ctx.abortPlanV2Generate(requestId);
  ctx.planV2CancelledIds.delete(requestId);
  const abort = new AbortController();
  ctx.planV2Aborts.set(requestId, abort);

  try {
    if (abort.signal.aborted) {
      post({ error: 'Plan generation cancelled.', aborted: true });
      return;
    }
    const cfg = vscode.workspace.getConfiguration('agent-k');
    const baseUrl =
      (message.baseUrl != null ? String(message.baseUrl) : undefined) ||
      cfg.get<string>('provider.baseUrl') ||
      'http://127.0.0.1:52415';
    const model =
      (message.model != null ? String(message.model) : undefined) ||
      cfg.get<string>('provider.model') ||
      'mlx-community/Qwen3.6-35B-A3B-4bit';
    const apiKey =
      message.apiKey != null ? String(message.apiKey) : cfg.get<string>('provider.apiKey') || undefined;
    const providerType = String(
      message.providerType || cfg.get('provider.type') || 'litellm'
    ) as 'litellm' | 'openai' | 'anthropic' | 'ollama' | 'lmstudio' | 'opencode-zen' | 'opencode-go';

    const { LiteLLMProvider } = await import('../providers/LiteLLMProvider');
    const { LiteLLMPlanModel } = await import('../plan/v2/LiteLLMPlanModel');
    const { PlanV2Generator } = await import('../plan/v2/PlanV2Generator');

    if (abort.signal.aborted) {
      post({ error: 'Plan generation cancelled.', aborted: true });
      return;
    }

    const provider = new LiteLLMProvider({
      id: `plan-v2-${requestId}`,
      name: 'Agent K Plan V2',
      type: providerType,
      baseUrl,
      apiKey,
      model
    });
    const planModel = new LiteLLMPlanModel(provider, { model, signal: abort.signal });
    const folder = vscode.workspace.workspaceFolders?.[0];
    const repoRoot = folder?.uri.fsPath ?? primaryWorkspaceRepoRoot();
    const fileIndex = folder ? await listWorkspaceFilePaths(folder) : undefined;
    const researchContext = appendWorkspaceContextToResearch(String(message.researchContext || ''), {
      repoRoot: repoRoot ?? '(no workspace folder open)',
      fileIndex
    });
    const generator = new PlanV2Generator(planModel, async (relativePath: string) => {
      if (!folder) return false;
      const segments = resolveWorkspaceRelativeSegments(relativePath, folder);
      if (!segments) return false;
      try {
        await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, ...segments));
        return true;
      } catch {
        return false;
      }
    });

    // Webview 180s budget starts here — not when the generate message was
    // queued behind the previous AgentLoop.
    void ctx.webview?.postMessage({ type: 'plan.v2.generate.started', requestId, sessionId });

    const result = await generator.generate({
      goal: String(message.goal || ''),
      researchContext,
      rejectionFeedback: message.rejectionFeedback != null ? String(message.rejectionFeedback) : undefined,
      repoRoot
    });
    if (abort.signal.aborted) {
      post({ error: 'Plan generation cancelled.', aborted: true });
      return;
    }
    post({ result });
  } catch (error) {
    if (abort.signal.aborted || isAbortError(error)) {
      post({ error: 'Plan generation cancelled.', aborted: true });
      return;
    }
    post({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    ctx.planV2Aborts.delete(requestId);
    ctx.planV2CancelledIds.delete(requestId);
  }
}
