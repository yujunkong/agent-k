/**
 * Rules tab (PRD-29) — project rules globs + enable switch.
 * Minimal slice: persists keys for future RulesLoader wiring.
 */
import React, { useMemo, useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import {
  SettingsActions,
  SettingsField,
  SettingsSection,
  SettingsStatus,
  SettingsToggle,
} from '../components/SettingsUI';
import { persistToHost } from '../persistConfig';

const DEFAULT_GLOBS = [
  '**/.agentk/rules/**/*.md',
  '**/AGENTS.md',
  '**/.cursorrules',
];

function readGlobs(): string[] {
  const raw = configManager.get('agent-k.rules.globs');
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
    return raw as string[];
  }
  return [...DEFAULT_GLOBS];
}

export function RulesTab() {
  const [enabled, setEnabled] = useState(
    configManager.get('agent-k.rules.enabled') !== false
  );
  const [globsText, setGlobsText] = useState(() => readGlobs().join('\n'));
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');

  const globs = useMemo(
    () =>
      globsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    [globsText]
  );

  const handleSave = () => {
    const values = {
      'agent-k.rules.enabled': enabled,
      'agent-k.rules.globs': globs,
    };
    configManager.update(values);
    persistToHost(values);
    setStatus('saved');
  };

  return (
    <div className="settings-tab-content">
      <SettingsSection
        title="Project rules"
        description="Glob patterns for rule files injected into agent context (PRD-29 / Infra-01). Preview wiring comes in a later pass."
      >
        <SettingsToggle
          label="Load project rules"
          description="When off, rule files are ignored even if present"
          checked={enabled}
          onChange={(v) => {
            setEnabled(v);
            setStatus('idle');
          }}
        />
        <SettingsField
          label="Rules globs"
          hint={`${globs.length} pattern(s) · one per line`}
        >
          <textarea
            value={globsText}
            onChange={(e) => {
              setGlobsText(e.target.value);
              setStatus('idle');
            }}
            rows={6}
            spellCheck={false}
            aria-label="Rules globs"
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
              setGlobsText(DEFAULT_GLOBS.join('\n'));
              setStatus('idle');
            }}
          >
            Reset defaults
          </button>
        </SettingsActions>
      </SettingsSection>

      <SettingsSection title="Preview">
        <p className="settings-field__hint" style={{ margin: 0 }}>
          Matched files will list here once the host RulesLoader is bound. Until
          then, patterns are stored in ConfigManager /{' '}
          <code>.agentk/settings.json</code> only.
        </p>
      </SettingsSection>

      <SettingsActions>
        <button type="button" className="settings-btn primary" onClick={handleSave}>
          Save
        </button>
      </SettingsActions>
      {status === 'saved' ? (
        <SettingsStatus kind="success">Rules settings saved.</SettingsStatus>
      ) : null}
    </div>
  );
}
