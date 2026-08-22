/**
 * Context budget & agent loop limits.
 */
import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import {
  SettingsActions,
  SettingsField,
  SettingsSection,
  SettingsStatus,
  persistToHost,
} from '../components/SettingsUI';

export function ContextTab() {
  const [budget, setBudget] = useState(
    Number(configManager.get('agent-k.context.budget')) || 100000
  );
  const [readMaxLines, setReadMaxLines] = useState(
    Number(configManager.get('agent-k.context.readMaxLines')) || 5000
  );
  const [maxTurns, setMaxTurns] = useState(
    Number(configManager.get('agent-k.maxTurns')) || 25
  );
  const [maxTurnsA, setMaxTurnsA] = useState(
    Number(configManager.get('agent-k.context.maxTurnsA')) || 25
  );
  const [maxTurnsB, setMaxTurnsB] = useState(
    Number(configManager.get('agent-k.context.maxTurnsB')) || 15
  );
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');

  const handleSave = () => {
    const turns = Math.min(100, Math.max(5, Math.floor(maxTurns) || 25));
    setMaxTurns(turns);
    const values = {
      'agent-k.context.budget': Math.max(1000, budget || 100000),
      'agent-k.context.readMaxLines': Math.max(100, readMaxLines || 5000),
      'agent-k.maxTurns': turns,
      'agent-k.context.maxTurnsA': Math.min(100, Math.max(5, maxTurnsA || 25)),
      'agent-k.context.maxTurnsB': Math.min(100, Math.max(5, maxTurnsB || 15)),
    };
    configManager.update(values);
    persistToHost(values);
    setStatus('saved');
  };

  return (
    <div className="settings-tab-content">
      <SettingsSection
        title="Context budget"
        description="Fallback only — Agent K prefers max_input_tokens / context length from the selected provider. Prefer project overrides in Settings → JSON (.agentk/settings.json)."
      >
        <SettingsField
          label="Fallback max token budget"
          hint="Used when the provider does not report context length (1k–1M)."
        >
          <input
            type="number"
            value={budget}
            min={1000}
            max={1000000}
            step={1000}
            onChange={(e) => {
              setBudget(parseInt(e.target.value, 10) || 100000);
              setStatus('idle');
            }}
          />
        </SettingsField>
        <SettingsField
          label="Read max lines"
          hint="Cap for single-file read tools."
        >
          <input
            type="number"
            value={readMaxLines}
            min={100}
            max={50000}
            step={100}
            onChange={(e) => {
              setReadMaxLines(parseInt(e.target.value, 10) || 5000);
              setStatus('idle');
            }}
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection
        title="Agent loop"
        description="Per-request turn limits. Small/local models often work best at 25–40."
      >
        <SettingsField label="Max turns (default loop)">
          <input
            type="number"
            value={maxTurns}
            min={5}
            max={100}
            step={1}
            onChange={(e) => {
              setMaxTurns(parseInt(e.target.value, 10) || 25);
              setStatus('idle');
            }}
          />
        </SettingsField>
        <SettingsField label="Max turns A (stronger models)" hint="agent-k.context.maxTurnsA">
          <input
            type="number"
            value={maxTurnsA}
            min={5}
            max={100}
            onChange={(e) => {
              setMaxTurnsA(parseInt(e.target.value, 10) || 25);
              setStatus('idle');
            }}
          />
        </SettingsField>
        <SettingsField label="Max turns B (lighter models)" hint="agent-k.context.maxTurnsB">
          <input
            type="number"
            value={maxTurnsB}
            min={5}
            max={100}
            onChange={(e) => {
              setMaxTurnsB(parseInt(e.target.value, 10) || 15);
              setStatus('idle');
            }}
          />
        </SettingsField>
      </SettingsSection>

      <SettingsActions>
        <button type="button" className="settings-btn primary" onClick={handleSave}>
          Save
        </button>
      </SettingsActions>
      {status === 'saved' ? (
        <SettingsStatus kind="success">Context settings saved.</SettingsStatus>
      ) : null}
    </div>
  );
}
