/**
 * SET-004 — Features tab (v2.1 UI port).
 */
import { useState, type JSX } from 'react';
import { configStore, persistToHost } from '../configStore';
import { SettingsActions, SettingsSection, SettingsStatus, SettingsToggle } from '../SettingsUI';

type Feature = { id: string; label: string; description: string; defaultOn: boolean };

const FEATURES: Feature[] = [
  { id: 'browser', label: 'Browser Tools', description: 'Playwright browser automation', defaultOn: true },
  { id: 'design-mode', label: 'Design Mode', description: 'Screenshot overlay + annotations', defaultOn: true },
  { id: 'worktree', label: 'Worktree & Best-of-N', description: 'git worktree parallel runs', defaultOn: true },
  { id: 'agent-review', label: 'Agent Review Loop', description: 'Automatic review + fix suggestions', defaultOn: true },
  { id: 'mcp', label: 'MCP Client', description: 'MCP server tool integration', defaultOn: true },
  { id: 'skills', label: 'Skills System', description: 'Pinned skills auto-injection', defaultOn: true },
  { id: 'sub-agents', label: 'Sub-Agents (Task)', description: 'Parallel sub-agent execution', defaultOn: true },
  { id: 'memories', label: 'Memories', description: 'Long-term memory store', defaultOn: true },
  { id: 'inline-completion', label: 'Inline Completion', description: 'Autocomplete while typing', defaultOn: false },
  { id: 'github', label: 'GitHub Agent', description: 'gh CLI PR / issue workflows', defaultOn: true },
  { id: 'codebase-index', label: 'Codebase Indexing', description: 'Local index + @codebase search', defaultOn: true },
];

function readEnabled(id: string, defaultOn: boolean): boolean {
  const v = configStore.get(`agent-k.features.${id}`);
  if (typeof v === 'boolean') return v;
  return defaultOn;
}

export function FeaturesTab(): JSX.Element {
  const [flags, setFlags] = useState(() =>
    Object.fromEntries(FEATURES.map((f) => [f.id, readEnabled(f.id, f.defaultOn)])),
  );
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');

  const handleSave = () => {
    const values: Record<string, unknown> = {};
    for (const [id, on] of Object.entries(flags)) values[`agent-k.features.${id}`] = on;
    persistToHost(values);
    setStatus('saved');
  };

  return (
    <div className="settings-tab-content" data-testid="settings-features-tab">
      <SettingsSection title="Features" description="Toggle optional Agent K capabilities.">
        {FEATURES.map((f) => (
          <SettingsToggle
            key={f.id}
            label={f.label}
            description={f.description}
            checked={Boolean(flags[f.id])}
            onChange={(v) => {
              setFlags((prev) => ({ ...prev, [f.id]: v }));
              setStatus('idle');
            }}
          />
        ))}
      </SettingsSection>
      <SettingsActions>
        <button type="button" className="settings-btn primary" onClick={handleSave}>Save</button>
      </SettingsActions>
      {status === 'saved' ? <SettingsStatus kind="success">Feature flags saved.</SettingsStatus> : null}
    </div>
  );
}
