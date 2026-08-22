/**
 * SET-003 — Context tab (v2.1 UI port).
 */
import { useState, type JSX } from 'react';
import { configStore, persistToHost } from '../configStore';
import { SettingsActions, SettingsField, SettingsSection, SettingsStatus } from '../SettingsUI';

export function ContextTab(): JSX.Element {
  const [budget, setBudget] = useState(Number(configStore.get('agent-k.context.budget') || 100000));
  const [readMaxLines, setReadMaxLines] = useState(
    Number(configStore.get('agent-k.context.readMaxLines') || 5000),
  );
  const [maxTurns, setMaxTurns] = useState(Number(configStore.get('agent-k.maxTurns') || 25));
  const [maxTurnsA, setMaxTurnsA] = useState(Number(configStore.get('agent-k.context.maxTurnsA') || 25));
  const [maxTurnsB, setMaxTurnsB] = useState(Number(configStore.get('agent-k.context.maxTurnsB') || 15));
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');

  const handleSave = () => {
    const turns = Math.min(100, Math.max(5, Math.floor(maxTurns) || 25));
    setMaxTurns(turns);
    persistToHost({
      'agent-k.context.budget': Math.max(1000, budget || 100000),
      'agent-k.context.readMaxLines': Math.max(100, readMaxLines || 5000),
      'agent-k.maxTurns': turns,
      'agent-k.context.maxTurnsA': Math.min(100, Math.max(5, maxTurnsA || 25)),
      'agent-k.context.maxTurnsB': Math.min(100, Math.max(5, maxTurnsB || 15)),
    });
    setStatus('saved');
  };

  return (
    <div className="settings-tab-content" data-testid="settings-context-tab">
      <SettingsSection title="Context budget" description="Fallback when provider omits context length.">
        <SettingsField label="Fallback max token budget" hint="1k–1M">
          <input type="number" value={budget} min={1000} max={1000000} step={1000}
            onChange={(e) => { setBudget(parseInt(e.target.value, 10) || 100000); setStatus('idle'); }} />
        </SettingsField>
        <SettingsField label="Read max lines" hint="Cap for single-file read tools.">
          <input type="number" value={readMaxLines} min={100} max={50000} step={100}
            onChange={(e) => { setReadMaxLines(parseInt(e.target.value, 10) || 5000); setStatus('idle'); }} />
        </SettingsField>
      </SettingsSection>
      <SettingsSection title="Agent loop" description="Per-request turn limits.">
        <SettingsField label="Max turns (default)">
          <input type="number" value={maxTurns} min={5} max={100}
            onChange={(e) => { setMaxTurns(parseInt(e.target.value, 10) || 25); setStatus('idle'); }} />
        </SettingsField>
        <SettingsField label="Max turns A" hint="Stronger models">
          <input type="number" value={maxTurnsA} min={5} max={100}
            onChange={(e) => { setMaxTurnsA(parseInt(e.target.value, 10) || 25); setStatus('idle'); }} />
        </SettingsField>
        <SettingsField label="Max turns B" hint="Lighter models">
          <input type="number" value={maxTurnsB} min={5} max={100}
            onChange={(e) => { setMaxTurnsB(parseInt(e.target.value, 10) || 15); setStatus('idle'); }} />
        </SettingsField>
      </SettingsSection>
      <SettingsActions>
        <button type="button" className="settings-btn primary" onClick={handleSave}>Save</button>
      </SettingsActions>
      {status === 'saved' ? <SettingsStatus kind="success">Context settings saved.</SettingsStatus> : null}
    </div>
  );
}
