import * as vscode from 'vscode';

/** Extension Host에서 /v1/models 연결 테스트 (CSP·CORS 우회) */
export async function runProviderConnectionTest(
  webview: vscode.Webview | undefined,
  requestId: string,
  baseUrl: string,
  apiKey?: string,
  model?: string
): Promise<void> {
  if (!webview) return;

  const post = (payload: Record<string, unknown>) => {
    void webview.postMessage({ type: 'provider.test.result', requestId, ...payload });
  };

  const root = String(baseUrl || '').replace(/\/$/, '');
  if (!root) {
    post({ ok: false, detail: 'Base URL is empty' });
    return;
  }

  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const response = await fetch(`${root}/v1/models`, { headers });
    const status = response.status;

    if (!response.ok) {
      let detail = `HTTP ${status}`;
      if (status === 401) {
        detail +=
          ' — Unauthorized. LiteLLM (:4000) needs a valid master key in API Key. Or use direct MLX at http://127.0.0.1:52415 with full model id (e.g. mlx-community/Qwen3.6-35B-A3B-4bit).';
      }
      post({ ok: false, status, detail });
      return;
    }

    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    const modelIds = (data?.data || []).map((m) => m.id).filter(Boolean) as string[];
    const found = model ? modelIds.includes(model) : false;
    const detail =
      model && found
        ? `OK — model "${model}" listed (${modelIds.length} models)`
        : modelIds.length > 0
          ? `OK — server reachable (${modelIds.length} models). Model may still work if loaded on demand.`
          : 'OK — server reachable (no models in list).';

    post({ ok: true, status, detail, modelIds });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    post({ ok: false, detail: msg || 'Connection failed' });
  }
}

/** Resolve context window for current/selected provider+model → webview */
export async function refreshModelContext(
  webview: vscode.Webview | undefined,
  message: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    providerType?: string;
  }
): Promise<void> {
  if (!webview) return;
  const cfg = vscode.workspace.getConfiguration('agent-k');
  const providerType = String(
    message.providerType || cfg.get('provider.type') || 'litellm'
  ) as 'litellm' | 'openai' | 'anthropic' | 'ollama' | 'lmstudio' | 'opencode-zen' | 'opencode-go';
  const baseUrl = String(
    message.baseUrl || cfg.get('provider.baseUrl') || 'http://127.0.0.1:52415'
  ).replace(/\/$/, '');
  const model = String(
    message.model || cfg.get('provider.model') || 'mlx-community/Qwen3.6-35B-A3B-4bit'
  );
  const apiKey =
    message.apiKey != null
      ? String(message.apiKey)
      : cfg.get<string>('provider.apiKey') || undefined;
  const fallbackBudget = Number(cfg.get('context.budget')) || 100000;

  try {
    const { resolveModelContextInfo, clearModelContextCache } = await import(
      '../providers/modelContextInfo'
    );
    clearModelContextCache();
    const info = await resolveModelContextInfo({
      providerType,
      baseUrl,
      apiKey,
      model,
      fallbackTokens: fallbackBudget
    });
    void webview.postMessage({
      type: 'model.context',
      model: info.model,
      providerType: info.providerType,
      maxInputTokens: info.maxInputTokens,
      maxOutputTokens: info.maxOutputTokens,
      source: info.source
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    void webview.postMessage({
      type: 'model.context',
      model,
      providerType,
      maxInputTokens: fallbackBudget,
      source: 'fallback',
      error: msg
    });
  }
}
