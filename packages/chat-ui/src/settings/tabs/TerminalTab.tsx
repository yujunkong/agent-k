/**
 * SET-012 — Terminal tab (v2.1 UI port).
 */
import { useMemo, useState, type JSX } from 'react';
import { configStore, persistToHost } from '../configStore';
import { SettingsActions, SettingsField, SettingsSection, SettingsStatus } from '../SettingsUI';

const DEFAULT_DENY = ['rm -rf /', 'mkfs', 'dd if=', ':(){ :|:& };:'];

function readDeny(): string[] {
  const raw = configStore.get('agent-k.terminal.denyPatterns');
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) return raw as string[];
  return [...DEFAULT_DENY];
}

export function TerminalTab(): JSX.Element {
  const [timeoutMs, setTimeoutMs] = useState(
    Number(configStore.get('agent-k.terminal.timeoutMs') || configStore.get('agent-k.turnTimeoutMs') || 120000),
  );
  const [denyText, setDenyText] = useState(() => readDeny().join('\n'));
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');
  const denyPatterns = useMemo(
    () => denyText.split('\n').map((s) => s.trim()).filter(Boolean),
    [denyText],
  );

  const handleSave = () => {
    const ms = Math.min(600000, Math.max(5000, Math.floor(timeoutMs) || 120000));
    setTimeoutMs(ms);
    persistToHost({
      'agent-k.terminal.timeoutMs': ms,
      'agent-k.terminal.denyPatterns': denyPatterns,
      'agent-k.turnTimeoutMs': ms,
    });
    setStatus('saved');
  };

  return (
    <div className="settings-tab-content" data-testid="settings-terminal-tab">
      <SettingsSection title="Shell timeout" description="Max wall-clock for a shell tool call.">
        <SettingsField label="Timeout (ms)" hint="5s – 10m">
          <input type="number" value={timeoutMs} min={5000} max={600000} step={1000}
            onChange={(e) => { setTimeoutMs(parseInt(e.target.value, 10) || 120000); setStatus('idle'); }} />
        </SettingsField>
      </SettingsSection>
      <SettingsSection title="Deny patterns" description="Substring matches blocked before shell runs.">
        <SettingsField label="Patterns" hint={`${denyPatterns.length} pattern(s)`}>
          <textarea value={denyText} rows={6} spellCheck={false} aria-label="Terminal deny patterns"
            onChange={(e) => { setDenyText(e.target.value); setStatus('idle'); }} />
        </SettingsField>
        <SettingsActions>
          <button type="button" className="settings-btn secondary"
            onClick={() => { setDenyText(DEFAULT_DENY.join('\n')); setStatus('idle'); }}>
            Reset defaults
          </button>
        </SettingsActions>
      </SettingsSection>
      <SettingsActions>
        <button type="button" className="settings-btn primary" onClick={handleSave}>Save</button>
      </SettingsActions>
      {status === 'saved' ? <SettingsStatus kind="success">Terminal settings saved.</SettingsStatus> : null}
    </div>
  );
}
