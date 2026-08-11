import React, { useCallback, useEffect, useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import {
  PROJECT_CONFIG_PATH,
  pickProjectConfigValues,
  unflattenProjectConfig
} from '../../core/ProjectConfig';

function postHost(type: string, payload: Record<string, unknown> = {}): void {
  try {
    const api =
      (window as unknown as { __vscodeApi?: { postMessage?: (m: unknown) => void } })
        .__vscodeApi ||
      (
        window as unknown as {
          acquireVsCodeApi?: () => { postMessage?: (m: unknown) => void };
        }
      ).acquireVsCodeApi?.();
    if (api?.postMessage) {
      api.postMessage({ type, ...payload });
      return;
    }
  } catch {
    /* ignore */
  }
  window.parent.postMessage({ type, ...payload }, '*');
}

export function JsonConfigTab() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [exists, setExists] = useState(false);

  const loadFromMemory = useCallback(() => {
    const nested = unflattenProjectConfig(
      pickProjectConfigValues(configManager.getAll())
    );
    setText(JSON.stringify(nested, null, 2));
    setError('');
    setStatus('현재 적용 중인 설정으로 채웠습니다 (시크릿 제외).');
  }, []);

  useEffect(() => {
    loadFromMemory();
    postHost('config.project.get');

    const onMsg = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'config.project.result') {
        setExists(!!data.exists);
        setFilePath(typeof data.path === 'string' ? data.path : null);
        if (typeof data.text === 'string' && data.text.trim()) {
          setText(data.text);
          setStatus(
            data.exists
              ? `워크스페이스 \`${PROJECT_CONFIG_PATH}\`을 불러왔습니다.`
              : '파일이 없어 현재 설정으로 표시합니다.'
          );
        }
        if (data.error) setError(String(data.error));
      }
      if (data.type === 'config.project.saved') {
        if (data.ok) {
          setExists(true);
          setFilePath(typeof data.path === 'string' ? data.path : null);
          setStatus(`\`${PROJECT_CONFIG_PATH}\`에 저장했습니다.`);
          setError('');
          if (data.values && typeof data.values === 'object') {
            configManager.syncFromVSCode(data.values as Record<string, unknown>);
          }
        } else {
          setError(String(data.error || '저장 실패'));
        }
      }
      if (data.type === 'config.hydrate' && data.values) {
        configManager.syncFromVSCode(data.values as Record<string, unknown>);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [loadFromMemory]);

  const handleSave = () => {
    setError('');
    postHost('config.project.save', { text });
  };

  const handleOpen = () => {
    postHost('config.project.open');
  };

  const handleCreateExample = () => {
    postHost('config.project.createExample');
  };

  return (
    <div className="settings-tab-content">
      <h3>Project</h3>
      <p className="settings-banner" role="note">
        OpenCode의 프로젝트 config처럼, 워크스페이스{' '}
        <code>{PROJECT_CONFIG_PATH}</code>이{' '}
        <strong>VS Code 설정보다 우선</strong>합니다. 저장 시 즉시 적용됩니다.
      </p>
      <p className="settings-banner settings-banner--warn" role="status">
        API 키·토큰은 이 파일에 넣지 마세요. Provider 탭(전역)에 보관하세요.
      </p>

      <div className="settings-hint" style={{ marginBottom: 8 }}>
        {exists && filePath ? (
          <>
            파일: <code>{filePath}</code>
          </>
        ) : (
          <>
            아직 <code>{PROJECT_CONFIG_PATH}</code> 없음 — 저장하면 생성됩니다.
          </>
        )}
      </div>

      <textarea
        className="settings-json-editor"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        rows={22}
        aria-label="Agent K project JSON config"
      />

      {error ? <p className="settings-error">{error}</p> : null}
      {status ? <p className="settings-hint">{status}</p> : null}

      <div className="settings-actions" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="settings-btn primary" onClick={handleSave}>
          settings.json 저장
        </button>
        <button type="button" className="settings-btn" onClick={handleOpen}>
          에디터에서 열기
        </button>
        <button type="button" className="settings-btn" onClick={loadFromMemory}>
          현재 설정으로 채우기
        </button>
        <button type="button" className="settings-btn" onClick={handleCreateExample}>
          예시 파일 만들기
        </button>
      </div>
    </div>
  );
}
