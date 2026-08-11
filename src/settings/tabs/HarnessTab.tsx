import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import { persistSettings } from '../persistSettings';
import { SettingsSaveButton } from '../SettingsSaveButton';

export function HarnessTab() {
  const [enabled, setEnabled] = useState<boolean>(
    configManager.get('agent-k.harness.enabled') !== false
  );
  const [verificationFirst, setVerificationFirst] = useState<boolean>(
    configManager.get('agent-k.harness.verificationFirst') !== false
  );
  const [prefetchEnabled, setPrefetchEnabled] = useState<boolean>(
    configManager.get('agent-k.harness.prefetchEnabled') !== false
  );
  const [testVerification, setTestVerification] = useState<boolean>(
    configManager.get('agent-k.verification.testEnabled') === true
  );

  return (
    <div className="settings-tab-content">
      <h3>하네스</h3>
      <p className="settings-hint">
        Prefetch·검증 루프 등 에이전트 안정성 관련 옵션입니다.
      </p>
      <div className="settings-field">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          하네스 사용
        </label>
      </div>
      <div className="settings-field">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={verificationFirst}
            onChange={(e) => setVerificationFirst(e.target.checked)}
          />
          Verification First (검증 우선 프롬프트)
        </label>
      </div>
      <div className="settings-field">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={prefetchEnabled}
            onChange={(e) => setPrefetchEnabled(e.target.checked)}
          />
          Prefetch (관련 파일 미리 읽기)
        </label>
      </div>
      <div className="settings-field">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={testVerification}
            onChange={(e) => setTestVerification(e.target.checked)}
          />
          편집 후 관련 테스트 자동 실행
        </label>
        <p className="settings-hint">
          기본 꺼짐. 켜면(또는 모델 tier B) 실패한 테스트를 주입해 재시도합니다.
        </p>
      </div>
      <SettingsSaveButton
        onSave={() =>
          persistSettings({
            'agent-k.harness.enabled': enabled,
            'agent-k.harness.verificationFirst': verificationFirst,
            'agent-k.harness.prefetchEnabled': prefetchEnabled,
            'agent-k.verification.testEnabled': testVerification
          })
        }
      />
    </div>
  );
}
