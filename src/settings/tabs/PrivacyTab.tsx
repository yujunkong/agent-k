/**
 * Privacy & telemetry.
 */
import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import {
  SettingsActions,
  SettingsSection,
  SettingsStatus,
  SettingsToggle,
  persistToHost,
} from '../components/SettingsUI';

export function PrivacyTab() {
  const [telemetryEnabled, setTelemetryEnabled] = useState(
    configManager.get('agent-k.telemetry.enabled') !== false
  );
  const [statusBarEnabled, setStatusBarEnabled] = useState(
    configManager.get('agent-k.telemetry.statusBarEnabled') !== false
  );
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');

  const handleSave = () => {
    const values = {
      'agent-k.telemetry.enabled': telemetryEnabled,
      'agent-k.telemetry.statusBarEnabled': statusBarEnabled,
    };
    configManager.update(values);
    persistToHost(values);
    setStatus('saved');
  };

  return (
    <div className="settings-tab-content">
      <SettingsSection
        title="Privacy & telemetry"
        description="Anonymous product signals only. API keys and file contents are not included in telemetry payloads."
      >
        <SettingsToggle
          label="Enable telemetry"
          description="Helps improve Agent K with anonymous usage metrics"
          checked={telemetryEnabled}
          onChange={(v) => {
            setTelemetryEnabled(v);
            setStatus('idle');
          }}
        />
        <SettingsToggle
          label="Status bar metrics"
          description="Show lightweight usage indicators in the VS Code status bar"
          checked={statusBarEnabled}
          onChange={(v) => {
            setStatusBarEnabled(v);
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
        <SettingsStatus kind="success">Privacy settings saved.</SettingsStatus>
      ) : null}
    </div>
  );
}
