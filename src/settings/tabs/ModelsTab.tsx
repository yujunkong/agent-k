import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';

/** Persist settings to extension host (VS Code configuration) */
function persistToHost(values: Record<string, unknown>): void {
  try {
    const vscodeApi = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
    if (vscodeApi?.postMessage) {
      vscodeApi.postMessage({ type: 'config.update', values });
      return;
    }
  } catch { /* ignore */ }
  window.parent.postMessage({ type: 'config.update', values }, '*');
}

/** VS Code webview API (injected in extension getHtml) */
function getVsCodeApi(): { postMessage: (msg: unknown) => void } | null {
  try {
    const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
    return api?.postMessage ? api : null;
  } catch {
    return null;
  }
}

/** Host 경유 연결 테스트 — CSP 제한 없이 Extension Host fetch 사용 */
function testViaExtensionHost(
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<{ ok: boolean; status?: number; detail: string; modelIds?: string[] }> {
  return new Promise((resolve, reject) => {
    const requestId = `provider-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const api = getVsCodeApi();
    if (!api) {
      reject(new Error('VS Code API unavailable'));
      return;
    }

    const timeoutMs = 12000;
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Connection test timed out (extension host)'));
    }, timeoutMs);

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'provider.test.result' || data.requestId !== requestId) {
        return;
      }
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      resolve({
        ok: Boolean(data.ok),
        status: data.status,
        detail: String(data.detail ?? ''),
        modelIds: Array.isArray(data.modelIds) ? data.modelIds : undefined
      });
    };

    window.addEventListener('message', onMessage);
    api.postMessage({
      type: 'provider.test',
      requestId,
      baseUrl,
      apiKey: apiKey || undefined,
      model: model || undefined
    });
  });
}

/** Webview 직접 fetch (connect-src 허용 시 폴백) */
async function testViaDirectFetch(
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<{ ok: boolean; status?: number; detail: string; modelIds?: string[] }> {
  const root = baseUrl.replace(/\/$/, '');
  const response = await fetch(`${root}/v1/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    if (response.status === 401) {
      detail +=
        ' — Unauthorized. LiteLLM (:4000) requires a valid master key in API Key. Prefer direct MLX: http://127.0.0.1:52415 + mlx-community/Qwen3.6-35B-A3B-4bit.';
    }
    return { ok: false, status: response.status, detail };
  }

  const data = await response.json();
  const modelIds: string[] = (data?.data || []).map((m: { id?: string }) => m.id).filter(Boolean);
  const found = modelIds.includes(model);
  const detail =
    found
      ? `OK — model "${model}" listed (${modelIds.length} models)`
      : modelIds.length > 0
        ? `OK — server reachable (${modelIds.length} models). Model may still work if loaded on demand.`
        : 'OK — server reachable (no models in list).';

  return { ok: found || modelIds.length > 0, status: response.status, detail, modelIds };
}

function formatHttp401Hint(status?: number, detail?: string): string {
  if (status === 401 || detail?.includes('401')) {
    return (
      detail ||
      'HTTP 401 — LiteLLM needs master key. Try direct MLX at http://127.0.0.1:52415 with full model id mlx-community/Qwen3.6-35B-A3B-4bit.'
    );
  }
  return detail || 'Connection failed';
}

export function ModelsTab() {
  const [baseUrl, setBaseUrl] = useState<string>(
    configManager.get('agent-k.provider.baseUrl') || 'http://127.0.0.1:52415'
  );
  const [model, setModel] = useState<string>(
    configManager.get('agent-k.provider.model') || 'mlx-community/Qwen3.6-35B-A3B-4bit'
  );
  const [providerType, setProviderType] = useState<string>(configManager.get('agent-k.provider.type') || 'litellm');
  const [apiKey, setApiKey] = useState<string>(configManager.get('agent-k.provider.apiKey') || '');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testDetail, setTestDetail] = useState('');

  const handleSave = () => {
    const values = {
      'agent-k.provider.baseUrl': baseUrl.replace(/\/$/, ''),
      'agent-k.provider.model': model,
      'agent-k.provider.type': providerType,
      'agent-k.provider.apiKey': apiKey
    };
    configManager.update(values);
    persistToHost(values);
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestDetail('');

    try {
      let result: { ok: boolean; status?: number; detail: string; modelIds?: string[] };

      // 우선 Extension Host 경유 (권장 — CSP/CORS 무관)
      const api = getVsCodeApi();
      if (api) {
        result = await testViaExtensionHost(baseUrl, apiKey, model);
      } else {
        // VS Code API 준비 대기 후 재시도, 없으면 webview fetch 폴백
        await new Promise((r) => setTimeout(r, 150));
        const apiRetry = getVsCodeApi();
        if (apiRetry) {
          result = await testViaExtensionHost(baseUrl, apiKey, model);
        } else {
          result = await testViaDirectFetch(baseUrl, apiKey, model);
        }
      }

      if (!result.ok) {
        setTestStatus('error');
        setTestDetail(formatHttp401Hint(result.status, result.detail));
        return;
      }

      setTestStatus('success');
      setTestDetail(result.detail);
    } catch (e: unknown) {
      setTestStatus('error');
      const msg = e instanceof Error ? e.message : String(e);
      // Host 실패 시 마지막으로 direct fetch 시도
      if (msg.includes('extension host') || msg.includes('VS Code API')) {
        try {
          const fallback = await testViaDirectFetch(baseUrl, apiKey, model);
          if (fallback.ok) {
            setTestStatus('success');
            setTestDetail(fallback.detail);
            return;
          }
          setTestDetail(formatHttp401Hint(fallback.status, fallback.detail));
          return;
        } catch (inner: unknown) {
          setTestDetail(inner instanceof Error ? inner.message : 'Connection failed');
          return;
        }
      }
      setTestDetail(msg || 'Connection failed');
    }
  };

  return (
    <div className="settings-tab-content">
      <h3>Provider Configuration</h3>
      <p className="settings-hint">
        Recommended for local MLX/exo: direct endpoint{' '}
        <code>http://127.0.0.1:52415</code> and full model id{' '}
        <code>mlx-community/Qwen3.6-35B-A3B-4bit</code> (no API key). LiteLLM proxy{' '}
        <code>http://127.0.0.1:4000</code> needs a master key — if auth is painful, use direct MLX
        above. LiteLLM alias example: <code>qwen3.6-35b-a3b</code>.
      </p>

      <div className="settings-field">
        <label>Provider Type</label>
        <select value={providerType} onChange={(e) => setProviderType(e.target.value)}>
          <option value="litellm">LiteLLM / OpenAI-compatible</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="ollama">Ollama</option>
          <option value="lmstudio">LM Studio</option>
        </select>
      </div>

      <div className="settings-field">
        <label>Base URL (no trailing /v1)</label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://127.0.0.1:52415"
        />
      </div>

      <div className="settings-field">
        <label>Model</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="mlx-community/Qwen3.6-35B-A3B-4bit"
        />
      </div>

      <div className="settings-field">
        <label>API Key (optional for local MLX)</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-… or empty"
        />
      </div>

      <div className="settings-actions">
        <button type="button" onClick={handleTest} className="settings-btn secondary">
          {testStatus === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
        <button type="button" onClick={handleSave} className="settings-btn">
          Save
        </button>
      </div>

      {testStatus === 'success' && (
        <div className="settings-hint" style={{ color: '#22c55e' }}>
          {testDetail || 'Connection successful'}
        </div>
      )}
      {testStatus === 'error' && (
        <div className="settings-hint" style={{ color: '#f87171' }}>
          {testDetail || 'Connection failed'}
        </div>
      )}
    </div>
  );
}
