/**
 * SET-005 — Harness tab (v2.1 UI port).
 */
import { useState, type JSX } from 'react';
import { configStore, persistToHost } from '../configStore';
import { SettingsActions, SettingsSection, SettingsStatus, SettingsToggle } from '../SettingsUI';

export function HarnessTab(): JSX.Element {
  const [enabled, setEnabled] = useState(configStore.get('agent-k.harness.enabled') !== false);
  const [verificationFirst, setVerificationFirst] = useState(
    configStore.get('agent-k.harness.verificationFirst') !== false,
  );
  const [prefetchEnabled, setPrefetchEnabled] = useState(
    configStore.get('agent-k.harness.prefetchEnabled') !== false,
  );
  const [microLoop, setMicroLoop] = useState(
    configStore.get('agent-k.harness.verificationMicroLoop') !== false,
  );
  const [testVerification, setTestVerification] = useState(
    configStore.get('agent-k.verification.testEnabled') === true,
  );
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');
  const dirty = () => setStatus('idle');

  const handleSave = () => {
    persistToHost({
      'agent-k.harness.enabled': enabled,
      'agent-k.harness.verificationFirst': verificationFirst,
      'agent-k.harness.prefetchEnabled': prefetchEnabled,
      'agent-k.harness.verificationMicroLoop': microLoop,
      'agent-k.verification.testEnabled': testVerification,
    });
    setStatus('saved');
  };

  return (
    <div className="settings-tab-content" data-testid="settings-harness-tab">
      <SettingsSection title="Harness" description="Runtime checks around agent turns.">
        <SettingsToggle label="Enable harness" description="Master switch" checked={enabled}
          onChange={(v) => { setEnabled(v); dirty(); }} />
        <SettingsToggle label="Verification first" description="Prefer verification before broad edits"
          checked={verificationFirst} onChange={(v) => { setVerificationFirst(v); dirty(); }} />
        <SettingsToggle label="Prefetch" description="Prefetch related context during turns"
          checked={prefetchEnabled} onChange={(v) => { setPrefetchEnabled(v); dirty(); }} />
        <SettingsToggle label="Verification micro-loop" description="Tight verify → fix cycle"
          checked={microLoop} onChange={(v) => { setMicroLoop(v); dirty(); }} />
        <SettingsToggle label="Test verification" description="Run related tests as verification"
          checked={testVerification} onChange={(v) => { setTestVerification(v); dirty(); }} />
      </SettingsSection>
      <SettingsActions>
        <button type="button" className="settings-btn primary" onClick={handleSave}>Save</button>
      </SettingsActions>
      {status === 'saved' ? <SettingsStatus kind="success">Harness settings saved.</SettingsStatus> : null}
    </div>
  );
}
