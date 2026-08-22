/**
 * SET-013 — JSON config tab (v2.1 UI; project file host ops stubbed via postMessage).
 */
import { useCallback, useState, type JSX } from 'react';
import { configStore } from '../configStore';
import { getVsCodeApi } from '../../vscodeApi';

const PROJECT_CONFIG_PATH = '.agentk/settings.json';

export function JsonConfigTab(): JSX.Element {
  const [text, setText] = useState(() => JSON.stringify(configStore.snapshot(), null, 2));
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const reloadFromMemory = useCallback(() => {
    setText(JSON.stringify(configStore.snapshot(), null, 2));
    setStatus('Reloaded from in-webview store.');
    setError('');
  }, []);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      configStore.hydrate(parsed);
      getVsCodeApi().postMessage({ type: 'config.project.save', text });
      setStatus(`Saved (host: ${PROJECT_CONFIG_PATH}).`);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="settings-tab-content" data-testid="settings-json-tab">
      <h3>JSON Config</h3>
      <p className="settings-hint">
        Workspace <code>{PROJECT_CONFIG_PATH}</code>. Prefer not storing API keys in the file.
      </p>
      <textarea
        className="settings-json-editor"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        rows={22}
        aria-label="Agent K JSON config"
      />
      {error ? <p className="settings-status settings-status--error">{error}</p> : null}
      {status ? <p className="settings-status settings-status--info">{status}</p> : null}
      <div className="settings-actions">
        <button type="button" className="settings-btn primary" onClick={handleSave}>Save settings.json</button>
        <button type="button" className="settings-btn secondary" onClick={() => getVsCodeApi().postMessage({ type: 'config.project.open' })}>
          Open in Editor
        </button>
        <button type="button" className="settings-btn secondary" onClick={reloadFromMemory}>Reset from Current</button>
        <button type="button" className="settings-btn secondary" onClick={() => getVsCodeApi().postMessage({ type: 'config.project.createExample' })}>
          Create Example
        </button>
      </div>
    </div>
  );
}
