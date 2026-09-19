/**
 * REVIEW-002 host bridge — run AgentReviewLoop on the workspace diff and
 * post `ui.review.open` with findings (v2.1 ADDON-T14 parity).
 *
 * The webview FindingList is fed from here; AcceptFix/Undo stay in chat-ui.
 */
import * as vscode from 'vscode';
import { AgentReviewLoop, type ReviewLMProvider } from '@agent-k/core';
import { LiteLLMProvider } from '@agent-k/providers';

export type HostPost = (message: Record<string, unknown>) => void;

/** Run diff review (+ optional LM pass) and seed the webview FindingList. */
export async function runReviewAndOpenPanel(post: HostPost): Promise<void> {
  const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!repoRoot) {
    post({ type: 'ui.review.open' });
    return;
  }
  try {
    const loop = new AgentReviewLoop(repoRoot);
    const provider = await buildReviewProvider();
    const result = await loop.reviewWithLM(provider);
    post({
      type: 'ui.review.open',
      findings: result.findings,
      diffSummary: result.diffSummary,
    });
    if (!result.diffSummary) {
      void vscode.window.showInformationMessage(
        'Agent K Review: no git diff to review.',
      );
    }
  } catch {
    // Not a git repo / git missing — fall back to the empty panel.
    post({ type: 'ui.review.open' });
  }
}

/** Build the LM provider from the active agent-k provider settings (best-effort). */
async function buildReviewProvider(): Promise<ReviewLMProvider | undefined> {
  try {
    const cfg = vscode.workspace.getConfiguration('agent-k');
    const apiKey = cfg.get<string>('provider.apiKey') || undefined;
    const baseUrl = String(
      cfg.get('provider.baseUrl') || 'http://127.0.0.1:52415',
    );
    const model = String(
      cfg.get('provider.model') || cfg.get('model') || 'gpt-4o-mini',
    );
    const providerType = String(cfg.get('provider.type') || 'litellm') as
      | 'litellm'
      | 'openai'
      | 'anthropic'
      | 'ollama'
      | 'lmstudio';
    const litellm = new LiteLLMProvider({
      id: 'agent-k-review',
      name: 'Agent K Review',
      type: providerType,
      baseUrl,
      apiKey,
      model,
    });
    return {
      complete: async (prompt: string) => {
        let out = '';
        for await (const chunk of litellm.streamChat({
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          maxTokens: 2000,
        })) {
          if (chunk.content) out += chunk.content;
          if (chunk.error) break;
        }
        return out;
      },
    };
  } catch {
    return undefined;
  }
}
