/**
 * Permission Gate tab — level + deny globs.
 * Saves to ConfigManager and extension host (config.update).
 */
import React, { useMemo, useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import {
  SettingsActions,
  SettingsField,
  SettingsRadioGroup,
  SettingsSection,
  SettingsStatus,
  persistToHost,
} from '../components/SettingsUI';

const DEFAULT_DENY_GLOBS = [
  '**/.env*',
  '**/secrets/**',
  '**/id_rsa*',
  '**/*.pem',
  '**/.git/**',
  '**/node_modules/**',
];

const LEVEL_OPTIONS = [
  {
    value: 'ask',
    label: 'Ask',
    description: 'Confirm every tool action before it runs',
  },
  {
    value: 'accept_edits',
    label: 'Accept Edits',
    description: 'Auto-approve file edits; ask for shell / network (default)',
  },
  {
    value: 'auto',
    label: 'Auto',
    description: 'Full trust within policy — minimal prompts',
  },
  {
    value: 'bypass',
    label: 'Bypass',
    description: 'No permission gate (use only in trusted sandboxes)',
  },
];

function readDenyGlobs(): string[] {
  const raw = configManager.get('agent-k.permission.denyGlobs');
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
    return raw as string[];
  }
  return [...DEFAULT_DENY_GLOBS];
}

export function PermissionTab() {
  const [level, setLevel] = useState<string>(
    configManager.get('agent-k.permission.level') || 'accept_edits'
  );
  const [denyText, setDenyText] = useState(() => readDenyGlobs().join('\n'));
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  const parsedGlobs = useMemo(
    () =>
      denyText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    [denyText]
  );

  const handleSave = () => {
    setError('');
    const values = {
      'agent-k.permission.level': level,
      'agent-k.permission.denyGlobs': parsedGlobs,
    };
    try {
      configManager.update(values);
      persistToHost(values);
      setStatus('saved');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleResetGlobs = () => {
    setDenyText(DEFAULT_DENY_GLOBS.join('\n'));
    setStatus('idle');
  };

  return (
    <div className="settings-tab-content">
      <SettingsSection
        title="Permission Gate"
        description="Controls when Agent K asks before running tools. Project .agentk/settings.json overrides VS Code settings."
      >
        <SettingsRadioGroup
          name="permission-level"
          value={level}
          options={LEVEL_OPTIONS}
          onChange={(v) => {
            setLevel(v);
            setStatus('idle');
          }}
        />
      </SettingsSection>

      <SettingsSection
        title="Deny globs"
        description="Paths matching these patterns are blocked regardless of permission level. One glob per line."
      >
        <SettingsField
          label="Patterns"
          hint={`${parsedGlobs.length} pattern(s)`}
        >
          <textarea
            value={denyText}
            onChange={(e) => {
              setDenyText(e.target.value);
              setStatus('idle');
            }}
            rows={8}
            spellCheck={false}
            aria-label="Permission deny globs"
            style={{
              fontFamily:
                'var(--vscode-editor-font-family, ui-monospace, monospace)',
              lineHeight: 1.45,
            }}
          />
        </SettingsField>
        <SettingsActions>
          <button
            type="button"
            className="settings-btn secondary"
            onClick={handleResetGlobs}
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
        <SettingsStatus kind="success">Permission settings saved.</SettingsStatus>
      ) : null}
      {status === 'error' ? (
        <SettingsStatus kind="error">{error || 'Save failed'}</SettingsStatus>
      ) : null}
    </div>
  );
}
