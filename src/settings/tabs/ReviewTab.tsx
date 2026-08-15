/**
 * Review / Checkpoint tab (PRD-29) — apply policy + auto checkpoint.
 */
import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import {
  SettingsActions,
  SettingsRadioGroup,
  SettingsSection,
  SettingsStatus,
  SettingsToggle,
} from '../components/SettingsUI';
import { persistToHost } from '../persistConfig';

export function ReviewTab() {
  const [applyPolicy, setApplyPolicy] = useState(
    String(configManager.get('agent-k.review.applyPolicy') || 'ask')
  );
  const [autoCheckpoint, setAutoCheckpoint] = useState(
    configManager.get('agent-k.review.autoCheckpoint') !== false
  );
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');

  const handleSave = () => {
    const values = {
      'agent-k.review.applyPolicy': applyPolicy,
      'agent-k.review.autoCheckpoint': autoCheckpoint,
    };
    configManager.update(values);
    persistToHost(values);
    setStatus('saved');
  };

  return (
    <div className="settings-tab-content">
      <SettingsSection
        title="Review apply policy"
        description="How Agent Review patches are applied (PRD-09 / Spec-06). Host apply path may still prompt until fully wired."
      >
        <SettingsRadioGroup
          name="review-apply"
          value={applyPolicy}
          options={[
            {
              value: 'ask',
              label: 'Ask',
              description: 'Confirm before applying each fix',
            },
            {
              value: 'auto',
              label: 'Auto apply',
              description: 'Apply accepted-risk patches without an extra prompt',
            },
            {
              value: 'manual',
              label: 'Manual only',
              description: 'Show findings; never auto-apply',
            },
          ]}
          onChange={(v) => {
            setApplyPolicy(v);
            setStatus('idle');
          }}
        />
      </SettingsSection>

      <SettingsSection
        title="Checkpoints"
        description="Snapshots for rollback. Index lives under .agentk/checkpoints/."
      >
        <SettingsToggle
          label="Auto checkpoint"
          description="Create a checkpoint before risky multi-file edits"
          checked={autoCheckpoint}
          onChange={(v) => {
            setAutoCheckpoint(v);
            setStatus('idle');
          }}
        />
      </SettingsSection>

      <SettingsActions>
        <button type="button" className="settings-btn primary" onClick={handleSave}>
          Save
        </button>
      </SettingsActions>
      {status === 'saved' ? (
        <SettingsStatus kind="success">Review settings saved.</SettingsStatus>
      ) : null}
    </div>
  );
}
