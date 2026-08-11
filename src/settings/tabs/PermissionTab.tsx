import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import { persistSetting } from '../persistSettings';
import { SettingsSaveButton } from '../SettingsSaveButton';

export function PermissionTab() {
  const [level, setLevel] = useState<string>(
    configManager.get('agent-k.permission.level') || 'accept_edits'
  );

  return (
    <div className="settings-tab-content">
      <h3>권한</h3>
      <p className="settings-hint">
        도구·파일 편집을 실행하기 전에 얼마나 확인할지 정합니다.
      </p>
      <div className="settings-field">
        <label>권한 수준</label>
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="ask">Ask — 매번 확인</option>
          <option value="accept_edits">Accept Edits — 편집은 자동 승인</option>
          <option value="auto">Auto — 대부분 자동</option>
          <option value="bypass">Bypass — 게이트 없음</option>
        </select>
      </div>
      <SettingsSaveButton
        onSave={() => persistSetting('agent-k.permission.level', level)}
      />
    </div>
  );
}
