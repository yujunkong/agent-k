import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import { persistSetting } from '../persistSettings';
import { SettingsSaveButton } from '../SettingsSaveButton';

export function PrivacyTab() {
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean>(
    configManager.get('agent-k.telemetry.enabled') !== false
  );

  return (
    <div className="settings-tab-content">
      <h3>개인정보</h3>
      <div className="settings-field">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={telemetryEnabled}
            onChange={(e) => setTelemetryEnabled(e.target.checked)}
          />
          텔레메트리 사용
        </label>
        <p className="settings-hint">
          익명 사용 통계로 Agent K 개선에 도움이 됩니다. API 키는 포함되지
          않습니다.
        </p>
      </div>
      <SettingsSaveButton
        onSave={() =>
          persistSetting('agent-k.telemetry.enabled', telemetryEnabled)
        }
      />
    </div>
  );
}
