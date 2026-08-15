/**
 * Terminal tab (PRD-29) — timeout + deny patterns for shell tools.
 */
import React, { useMemo, useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import {
  SettingsActions,
  SettingsField,
  SettingsSection,
  SettingsStatus,
  persistToHost,
} from '../components/SettingsUI';

const DEFAULT_DENY = [
  'rm -rf /',
  'mkfs',
  'dd if=',
  ':(){ :|:& };:',
];

function readDeny(): string[] {
  const raw = configManager.get('agent-k.terminal.denyPatterns');
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
    return raw as string[];
  }
  return [...DEFAULT_DENY];
}

export function TerminalTab() {
  const [timeoutMs, setTimeoutMs] = useState(
    Number(configManager.get('agent-k.terminal.timeoutMs')) ||
      Number(configManager.get('agent-k.turnTimeoutMs')) ||
      120000
  );
  const [denyText, setDenyText] = useState(() => readDeny().join('\n'));
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');

  const denyPatterns = useMemo(
    () =>
      denyText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    [denyText]
  );

  const handleSave = () => {
    const ms = Math.min(600000, Math.max(5000, Math.floor(timeoutMs) || 120000));
    setTimeoutMs(ms);
    const values = {
      'agent-k.terminal.timeoutMs': ms,
      'agent-k.terminal.denyPatterns': denyPatterns,
      // Keep turn timeout aligned when terminal timeout is the primary knob
      'agent-k.turnTimeoutMs': ms,
    };
    configManager.update(values);
    persistToHost(values);
    setStatus('saved');
  };

  return (
    <div className="settings-tab-content">
      <SettingsSection
        title="Shell timeout"
        description="Max wall-clock time for a single terminal / shell tool invocation (PRD-29 Terminal)."
      >
        <SettingsField label="Timeout (ms)" hint="5s – 10m">
          <input
            type="number"
            value={timeoutMs}
            min={5000}
            max={600000}
            step={1000}
            onChange={(e) => {
              setTimeoutMs(parseInt(e.target.value, 10) || 120000);
              setStatus('idle');
            }}
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection
        title="Deny patterns"
        description="Substring / pattern matches blocked before the shell runs. One pattern per line. Full allowlist UX ships later."
      >
        <SettingsField label="Patterns" hint={`${denyPatterns.length} pattern(s)`}>
          <textarea
            value={denyText}
            onChange={(e) => {
              setDenyText(e.target.value);
              setStatus('idle');
            }}
            rows={6}
            spellCheck={false}
            aria-label="Terminal deny patterns"
            style={{
              fontFamily:
                'var(--vscode-editor-font-family, ui-monospace, monospace)',
            }}
          />
        </SettingsField>
        <SettingsActions>
          <button
            type="button"
            className="settings-btn secondary"
            onClick={() => {
              setDenyText(DEFAULT_DENY.join('\n'));
              setStatus('idle');
            }}
          >
            Reset defaults
          </button>
        </SettingsActions>
      </SettingsSection>

      <SettingsActions>
        <button type="button" className="settings-btn primary" onClick={handleSave}>
          Save
        </button>
      </SettingsActions>
      {status === 'saved' ? (
        <SettingsStatus kind="success">Terminal settings saved.</SettingsStatus>
      ) : null}
    </div>
  );
}
