/**
 * SET-008 — Privacy tab (v2.1 UI port).
 */
import { useState, type JSX } from 'react';
import { configStore, persistToHost } from '../configStore';
import { SettingsActions, SettingsSection, SettingsStatus, SettingsToggle } from '../SettingsUI';

export function PrivacyTab(): JSX.Element {
  const [telemetryEnabled, setTelemetryEnabled] = useState(
    configStore.get('agent-k.telemetry.enabled') !== false,
  );
  const [statusBarEnabled, setStatusBarEnabled] = useState(
    configStore.get('agent-k.telemetry.statusBarEnabled') !== false,
  );
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');

  const handleSave = () => {
    persistToHost({
      'agent-k.telemetry.enabled': telemetryEnabled,
      'agent-k.telemetry.statusBarEnabled': statusBarEnabled,
    });
    setStatus('saved');
  };

  return (
    <div className="settings-tab-content" data-testid="settings-privacy-tab">
      <SettingsSection title="Privacy & telemetry" description="Anonymous product signals only.">
        <SettingsToggle label="Enable telemetry" description="Anonymous usage metrics"
          checked={telemetryEnabled} onChange={(v) => { setTelemetryEnabled(v); setStatus('idle'); }} />
        <SettingsToggle label="Status bar metrics" description="Lightweight usage in status bar"
          checked={statusBarEnabled} onChange={(v) => { setStatusBarEnabled(v); setStatus('idle'); }} />
      </SettingsSection>
      <SettingsActions>
        <button type="button" className="settings-btn primary" onClick={handleSave}>Save</button>
      </SettingsActions>
      {status === 'saved' ? <SettingsStatus kind="success">Privacy settings saved.</SettingsStatus> : null}
    </div>
  );
}
