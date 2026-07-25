import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';

export function PrivacyTab() {
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean>(configManager.get('agent-k.telemetry.enabled') !== false);

  const handleSave = () => {
    configManager.set('agent-k.telemetry.enabled', telemetryEnabled);
  };

  return (
    <div className="settings-tab-content">
      <h3>Privacy & Telemetry</h3>
      <div className="settings-field">
        <label className="checkbox-label">
          <input type="checkbox" checked={telemetryEnabled} onChange={(e) => setTelemetryEnabled(e.target.checked)} />
          Enable Telemetry
        </label>
        <p className="settings-help">Telemetry helps improve Agent K by sending anonymous usage data.</p>
      </div>
      <div className="settings-actions">
        <button onClick={handleSave} className="settings-btn primary">Save</button>
      </div>
    </div>
  );
}
