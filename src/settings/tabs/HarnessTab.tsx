/**
 * Harness configuration — toggles + verification micro-loop.
 */
import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import {
  SettingsActions,
  SettingsSection,
  SettingsStatus,
  SettingsToggle,
} from '../components/SettingsUI';
import { persistToHost } from '../persistConfig';

export function HarnessTab() {
  const [enabled, setEnabled] = useState(
    configManager.get('agent-k.harness.enabled') !== false
  );
  const [verificationFirst, setVerificationFirst] = useState(
    configManager.get('agent-k.harness.verificationFirst') !== false
  );
  const [prefetchEnabled, setPrefetchEnabled] = useState(
    configManager.get('agent-k.harness.prefetchEnabled') !== false
  );
  const [microLoop, setMicroLoop] = useState(
    configManager.get('agent-k.harness.verificationMicroLoop') !== false
  );
  const [testVerification, setTestVerification] = useState(
    configManager.get('agent-k.verification.testEnabled') === true
  );
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');

  const markDirty = () => setStatus('idle');

  const handleSave = () => {
    const values = {
      'agent-k.harness.enabled': enabled,
      'agent-k.harness.verificationFirst': verificationFirst,
      'agent-k.harness.prefetchEnabled': prefetchEnabled,
      'agent-k.harness.verificationMicroLoop': microLoop,
      'agent-k.verification.testEnabled': testVerification,
    };
    configManager.update(values);
    persistToHost(values);
    setStatus('saved');
  };

  return (
    <div className="settings-tab-content">
      <SettingsSection
        title="Harness"
        description="Runtime checks around agent turns (prefetch, verification order)."
      >
        <SettingsToggle
          label="Enable harness"
          description="Master switch for harness behaviors"
          checked={enabled}
          onChange={(v) => {
            setEnabled(v);
            markDirty();
          }}
        />
        <SettingsToggle
          label="Verification first"
          description="Prefer verification steps before broad edits"
          checked={verificationFirst}
          onChange={(v) => {
            setVerificationFirst(v);
            markDirty();
          }}
        />
        <SettingsToggle
          label="Prefetch"
          description="Prefetch context / tools when helpful"
          checked={prefetchEnabled}
          onChange={(v) => {
            setPrefetchEnabled(v);
            markDirty();
          }}
        />
        <SettingsToggle
          label="Verification micro-loop"
          description="Tight verify → fix cycles inside a turn"
          checked={microLoop}
          onChange={(v) => {
            setMicroLoop(v);
            markDirty();
          }}
        />
      </SettingsSection>

      <SettingsSection
        title="Tests after edit"
        description="ADDON-T01 — default off. When on (or model tier B), failing related tests are injected so the agent can retry."
      >
        <SettingsToggle
          label="Auto-run related tests after edit"
          checked={testVerification}
          onChange={(v) => {
            setTestVerification(v);
            markDirty();
          }}
        />
      </SettingsSection>

      <SettingsActions>
        <button type="button" className="settings-btn primary" onClick={handleSave}>
          Save
        </button>
      </SettingsActions>
      {status === 'saved' ? (
        <SettingsStatus kind="success">Harness settings saved.</SettingsStatus>
      ) : null}
    </div>
  );
}
