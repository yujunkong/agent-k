/**
 * FeaturesTab — feature toggles (C7-T46)
 * Shared SettingsToggle UI; persist ConfigManager + host.
 */
import React, { useEffect, useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import {
  SettingsActions,
  SettingsSection,
  SettingsStatus,
  SettingsToggle,
  persistToHost,
} from '../components/SettingsUI';

interface FeatureToggle {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  tier: string;
}

const DEFAULT_FEATURES: FeatureToggle[] = [
  {
    id: 'browser',
    label: 'Browser Tools',
    description: 'Playwright-based browser automation',
    enabled: true,
    tier: 'B',
  },
  {
    id: 'design-mode',
    label: 'Design Mode',
    description: 'Screenshot overlay + annotations',
    enabled: true,
    tier: 'B',
  },
  {
    id: 'worktree',
    label: 'Worktree & Best-of-N',
    description: 'git worktree parallel agent runs',
    enabled: true,
    tier: 'B',
  },
  {
    id: 'agent-review',
    label: 'Agent Review Loop',
    description: 'Automatic code review + fix suggestions',
    enabled: true,
    tier: 'B',
  },
  {
    id: 'mcp',
    label: 'MCP Client',
    description: 'MCP server tool integration',
    enabled: true,
    tier: 'B',
  },
  {
    id: 'skills',
    label: 'Skills System',
    description: 'Pinned skills auto-injection',
    enabled: true,
    tier: 'A',
  },
  {
    id: 'sub-agents',
    label: 'Sub-Agents (Task)',
    description: 'Parallel sub-agent execution',
    enabled: true,
    tier: 'B',
  },
  {
    id: 'memories',
    label: 'Memories',
    description: 'SecretStorage-backed long-term memory',
    enabled: true,
    tier: 'A',
  },
  {
    id: 'inline-completion',
    label: 'Inline Completion',
    description: 'Autocomplete while typing code',
    enabled: false,
    tier: 'A',
  },
  {
    id: 'github',
    label: 'GitHub Agent',
    description: 'gh CLI PR / issue workflows',
    enabled: true,
    tier: 'B',
  },
  {
    id: 'codebase-index',
    label: 'Codebase Indexing',
    description: 'Local index + @codebase search',
    enabled: true,
    tier: 'B',
  },
];

export function FeaturesTab() {
  const [features, setFeatures] = useState<FeatureToggle[]>(DEFAULT_FEATURES);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    setFeatures(
      DEFAULT_FEATURES.map((f) => ({
        ...f,
        enabled: configManager.get(`agent-k.features.${f.id}`) ?? f.enabled,
      }))
    );
  }, []);

  const toggleFeature = (id: string, next: boolean) => {
    setFeatures((prev) =>
      prev.map((f) => (f.id === id ? { ...f, enabled: next } : f))
    );
    setDirty(true);
    setStatus('idle');
  };

  const saveSettings = () => {
    const updates: Record<string, boolean> = {};
    for (const f of features) {
      updates[`agent-k.features.${f.id}`] = f.enabled;
    }
    configManager.update(updates);
    persistToHost(updates);
    setDirty(false);
    setStatus('saved');
  };

  const exportSchema = () => {
    const schema = {
      type: 'object',
      properties: Object.fromEntries(
        features.map((f) => [
          `agent-k.features.${f.id}`,
          {
            type: 'boolean',
            default: f.enabled,
            description: `${f.label} — ${f.description}`,
          },
        ])
      ),
    };
    const text = JSON.stringify(schema, null, 2);
    try {
      void navigator.clipboard?.writeText(text);
    } catch {
      /* ignore */
    }
    // Fallback: log for host / devtools
    console.info('[Agent K] features schema', schema);
  };

  const tierA = features.filter((f) => f.tier === 'A');
  const tierB = features.filter((f) => f.tier === 'B');

  const renderGroup = (title: string, list: FeatureToggle[]) => (
    <SettingsSection title={title}>
      {list.map((f) => (
        <SettingsToggle
          key={f.id}
          label={`${f.label} · Tier ${f.tier}`}
          description={f.description}
          checked={f.enabled}
          onChange={(next) => toggleFeature(f.id, next)}
        />
      ))}
    </SettingsSection>
  );

  return (
    <div className="settings-tab-content">
      {renderGroup('Core (Tier A)', tierA)}
      {renderGroup('Product (Tier B)', tierB)}

      <SettingsActions>
        <button type="button" className="settings-btn secondary" onClick={exportSchema}>
          Export schema
        </button>
        <button
          type="button"
          className="settings-btn primary"
          onClick={saveSettings}
          disabled={!dirty}
        >
          {dirty ? 'Save changes' : 'Saved'}
        </button>
      </SettingsActions>
      {status === 'saved' ? (
        <SettingsStatus kind="success">Feature flags saved.</SettingsStatus>
      ) : null}
    </div>
  );
}
