/**
 * Queue settings — onEnter / onStop / debounce.
 * Persists to ConfigManager + extension host.
 */
import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import {
  SettingsActions,
  SettingsField,
  SettingsRadioGroup,
  SettingsSection,
  SettingsStatus,
  persistToHost,
} from '../components/SettingsUI';

export function QueueTab() {
  const [onEnter, setOnEnter] = useState<string>(
    configManager.get('agent-k.queue.onEnterWhileRunning') || 'resynthesize'
  );
  const [onStop, setOnStop] = useState<string>(
    configManager.get('agent-k.queue.onStop') || 'keep'
  );
  const [debounceMs, setDebounceMs] = useState<number>(
    configManager.get('agent-k.queue.resynthesizeDebounceMs') ||
      configManager.get('agent-k.queue.debounceMs') ||
      300
  );
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');

  const handleSave = () => {
    const values = {
      'agent-k.queue.onEnterWhileRunning': onEnter,
      'agent-k.queue.onStop': onStop,
      'agent-k.queue.resynthesizeDebounceMs': debounceMs,
      'agent-k.queue.debounceMs': debounceMs,
    };
    configManager.update(values);
    persistToHost(values);
    setStatus('saved');
  };

  return (
    <div className="settings-tab-content">
      <SettingsSection
        title="While agent is running"
        description="What happens when you press Enter with a new message during a turn."
      >
        <SettingsRadioGroup
          name="queue-on-enter"
          value={onEnter}
          options={[
            {
              value: 'resynthesize',
              label: 'Interrupt & resynthesize',
              description: 'Stop current work and fold the new message in',
            },
            {
              value: 'queue_only',
              label: 'Queue only',
              description: 'Keep running; run the new message after',
            },
          ]}
          onChange={(v) => {
            setOnEnter(v);
            setStatus('idle');
          }}
        />
      </SettingsSection>

      <SettingsSection
        title="On stop"
        description="When the user stops the agent mid-turn."
      >
        <SettingsRadioGroup
          name="queue-on-stop"
          value={onStop}
          options={[
            {
              value: 'keep',
              label: 'Keep queue',
              description: 'Preserve pending follow-ups',
            },
            {
              value: 'discard',
              label: 'Discard queue',
              description: 'Clear pending messages',
            },
          ]}
          onChange={(v) => {
            setOnStop(v);
            setStatus('idle');
          }}
        />
      </SettingsSection>

      <SettingsSection title="Timing">
        <SettingsField
          label="Resynthesize debounce (ms)"
          hint="100–5000. Short delay before interrupting so rapid Enter presses coalesce."
        >
          <input
            type="number"
            value={debounceMs}
            min={100}
            max={5000}
            step={50}
            onChange={(e) => {
              setDebounceMs(parseInt(e.target.value, 10) || 300);
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
        <SettingsStatus kind="success">Queue settings saved.</SettingsStatus>
      ) : null}
    </div>
  );
}
