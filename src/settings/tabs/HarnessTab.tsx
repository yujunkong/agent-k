import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';

export function HarnessTab() {
  const [enabled, setEnabled] = useState<boolean>(configManager.get('agent-k.harness.enabled') !== false);
  const [verificationFirst, setVerificationFirst] = useState<boolean>(configManager.get('agent-k.harness.verificationFirst') !== false);
  const [prefetchEnabled, setPrefetchEnabled] = useState<boolean>(configManager.get('agent-k.harness.prefetchEnabled') !== false);
  const [testVerification, setTestVerification] = useState<boolean>(
    configManager.get('agent-k.verification.testEnabled') === true
  );

  const handleSave = () => {
    configManager.update({
      'agent-k.harness.enabled': enabled,
      'agent-k.harness.verificationFirst': verificationFirst,
      'agent-k.harness.prefetchEnabled': prefetchEnabled,
      'agent-k.verification.testEnabled': testVerification,
    });
  };

  return (
    <div className="settings-tab-content">
      <h3>Harness Configuration</h3>
      <div className="settings-field">
        <label className="checkbox-label">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable Harness
        </label>
      </div>
      <div className="settings-field">
        <label className="checkbox-label">
          <input type="checkbox" checked={verificationFirst} onChange={(e) => setVerificationFirst(e.target.checked)} />
          Verification First
        </label>
      </div>
      <div className="settings-field">
        <label className="checkbox-label">
          <input type="checkbox" checked={prefetchEnabled} onChange={(e) => setPrefetchEnabled(e.target.checked)} />
          Enable Prefetch
        </label>
      </div>
      <div className="settings-field">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={testVerification}
            onChange={(e) => setTestVerification(e.target.checked)}
          />
          Auto-run related tests after edit (ADDON-T01)
        </label>
        <p className="settings-hint">
          Default off. When on (or model tier B), failing related tests are injected so the agent can retry.
        </p>
      </div>
      <div className="settings-actions">
        <button onClick={handleSave} className="settings-btn primary">Save</button>
      </div>
    </div>
  );
}
