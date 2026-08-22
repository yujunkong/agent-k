/**
 * SET-010 — Review / Checkpoint tab (v2.1 UI port).
 */
import { useState, type JSX } from 'react';
import { configStore, persistToHost } from '../configStore';
import {
  SettingsActions, SettingsRadioGroup, SettingsSection, SettingsStatus, SettingsToggle,
} from '../SettingsUI';

export function ReviewTab(): JSX.Element {
  const [applyPolicy, setApplyPolicy] = useState(
    String(configStore.get('agent-k.review.applyPolicy') || 'ask'),
  );
  const [autoCheckpoint, setAutoCheckpoint] = useState(
    configStore.get('agent-k.review.autoCheckpoint') !== false,
  );
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');

  const handleSave = () => {
    persistToHost({
      'agent-k.review.applyPolicy': applyPolicy,
      'agent-k.review.autoCheckpoint': autoCheckpoint,
    });
    setStatus('saved');
  };

  return (
    <div className="settings-tab-content" data-testid="settings-review-tab">
      <SettingsSection title="Review apply policy" description="How review patches are applied.">
        <SettingsRadioGroup name="review-apply" value={applyPolicy}
          options={[
            { value: 'ask', label: 'Ask', description: 'Confirm before applying each fix' },
            { value: 'auto', label: 'Auto apply', description: 'Apply accepted-risk patches without extra prompt' },
            { value: 'manual', label: 'Manual only', description: 'Show findings; never auto-apply' },
          ]}
          onChange={(v) => { setApplyPolicy(v); setStatus('idle'); }} />
      </SettingsSection>
      <SettingsSection title="Checkpoints" description="Snapshots under .agentk/checkpoints/.">
        <SettingsToggle label="Auto checkpoint" description="Checkpoint before risky multi-file edits"
          checked={autoCheckpoint} onChange={(v) => { setAutoCheckpoint(v); setStatus('idle'); }} />
      </SettingsSection>
      <SettingsActions>
        <button type="button" className="settings-btn primary" onClick={handleSave}>Save</button>
      </SettingsActions>
      {status === 'saved' ? <SettingsStatus kind="success">Review settings saved.</SettingsStatus> : null}
    </div>
  );
}
