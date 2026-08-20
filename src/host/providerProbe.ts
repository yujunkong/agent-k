import * as vscode from 'vscode';
import { classifyProbeResult } from '../providers/providerStatus';

function mergeProbeHeaders(apiKey?: string, extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extraHeaders || {}) };
  if (apiKey && !headers.Authorization && !headers['x-api-key'] && !headers['X-Api-Key']) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

/** Extension Host에서 /v1/models 연결 테스트 (CSP·CORS 우회) */
export async function runProviderConnectionTest(
  webview: vscode.Webview | undefined,
  requestId: string,
  baseUrl: string,
  apiKey?: string,
  model?: string,
  extraHeaders?: Record<string, string>
): Promise<void> {
  if (!webview) return;

  const post = (payload: Record<string, unknown>) => {
    void webview.postMessage({ type: 'provider.test.result', requestId, ...payload });
  };

  const root = String(baseUrl || '').replace(/\/$/, '');
  if (!root) {
    post({ ok: false, detail: 'Base URL is empty', health: 'offline' });
    return;
  }

  try {
    const headers = mergeProbeHeaders(apiKey, extraHeaders);
    const response = await fetch(`${root}/v1/models`, { headers });
    const status = response.status;
    const health = classifyProbeResult(response.ok, status);

    if (!response.ok) {
      let detail = `HTTP ${status}`;
      if (status === 401 || status === 403) {
        detail +=
          ' — Auth failed. Check API Key, or use a local endpoint that does not require auth.';
      } else if (status === 429) {
        detail += ' — Rate limited. Retry in a moment.';
      }
      post({ ok: false, status, detail, health });
      return;
    }

    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    const modelIds = (data?.data || []).map((m) => m.id).filter(Boolean) as string[];
    const found = model ? modelIds.includes(model) : false;
    const detail =
      model && found
        ? `OK — model "${model}" listed (${modelIds.length} models)`
        : modelIds.length > 0
          ? `OK — server reachable (${modelIds.length} models).`
          : 'OK — server reachable (no models in list). Add a model name manually.';

    post({ ok: true, status, detail, modelIds, health });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    post({ ok: false, detail: msg || 'Connection failed', health: 'offline' });
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
