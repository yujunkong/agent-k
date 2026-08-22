/**
 * SET-007 — Permission Gate tab (v2.1 UI port).
 */
import { useMemo, useState, type JSX } from 'react';
import { configStore, persistToHost } from '../configStore';
import {
  SettingsActions,
  SettingsField,
  SettingsRadioGroup,
  SettingsSection,
  SettingsStatus,
} from '../SettingsUI';

const DEFAULT_DENY = [
  '**/.env*',
  '**/secrets/**',
  '**/id_rsa*',
  '**/*.pem',
  '**/.git/**',
  '**/node_modules/**',
];

const LEVEL_OPTIONS = [
  { value: 'ask', label: 'Ask', description: 'Confirm every tool action before it runs' },
  { value: 'accept_edits', label: 'Accept Edits', description: 'Auto-approve file edits; ask for shell / network (default)' },
  { value: 'auto', label: 'Auto', description: 'Full trust within policy — minimal prompts' },
  { value: 'bypass', label: 'Bypass', description: 'No permission gate (trusted sandboxes only)' },
];

function readDeny(): string[] {
  const raw = configStore.get('agent-k.permission.denyGlobs');
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) return raw as string[];
  return [...DEFAULT_DENY];
}

export function PermissionTab(): JSX.Element {
  const [level, setLevel] = useState(
    String(configStore.get('agent-k.permission.level') || 'accept_edits'),
  );
  const [denyText, setDenyText] = useState(() => readDeny().join('\n'));
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const parsed = useMemo(
    () => denyText.split('\n').map((s) => s.trim()).filter(Boolean),
    [denyText],
  );

  const handleSave = () => {
    try {
      persistToHost({
        'agent-k.permission.level': level,
        'agent-k.permission.denyGlobs': parsed,
      });
      setStatus('saved');
      setError('');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="settings-tab-content" data-testid="settings-permission-tab">
      <SettingsSection title="Permission Gate" description="When Agent K asks before running tools.">
        <SettingsRadioGroup name="permission-level" value={level} options={LEVEL_OPTIONS}
          onChange={(v) => { setLevel(v); setStatus('idle'); }} />
      </SettingsSection>
      <SettingsSection title="Deny globs" description="Blocked regardless of level. One glob per line.">
        <SettingsField label="Patterns" hint={`${parsed.length} pattern(s)`}>
          <textarea value={denyText} rows={8} spellCheck={false} aria-label="Deny globs"
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
      {status === 'saved' ? <SettingsStatus kind="success">Permission settings saved.</SettingsStatus> : null}
      {status === 'error' ? <SettingsStatus kind="error">{error || 'Save failed'}</SettingsStatus> : null}
    </div>
  );
}
