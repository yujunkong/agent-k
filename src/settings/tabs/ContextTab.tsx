import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import { persistSettings } from '../persistSettings';
import { SettingsSaveButton } from '../SettingsSaveButton';

export function ContextTab() {
  const [budget, setBudget] = useState<number>(
    configManager.get('agent-k.context.budget') || 100000
  );
  const [readMaxLines, setReadMaxLines] = useState<number>(
    configManager.get('agent-k.context.readMaxLines') || 5000
  );
  const [maxTurns, setMaxTurns] = useState<number>(
    Number(configManager.get('agent-k.maxTurns')) || 40
  );

  return (
    <div className="settings-tab-content">
      <h3>컨텍스트</h3>
      <p className="settings-hint">
        프로바이더가 모델 context 길이를 알려주면 그걸 우선합니다. 아래 값은
        fallback입니다. 프로젝트 고정값은{' '}
        <strong>Project</strong> 탭의 <code>.agentk/settings.json</code>을
        권장합니다.
      </p>
      <div className="settings-field">
        <label>Fallback 토큰 예산</label>
        <input
          type="number"
          value={budget}
          onChange={(e) => setBudget(parseInt(e.target.value, 10))}
          min={1000}
          max={1000000}
          step={1000}
        />
      </div>
      <div className="settings-field">
        <label>read_file 최대 줄 수</label>
        <input
          type="number"
          value={readMaxLines}
          onChange={(e) => setReadMaxLines(parseInt(e.target.value, 10))}
          min={100}
          max={50000}
        />
      </div>
      <div className="settings-field">
        <label>최대 턴 (에이전트 루프)</label>
        <input
          type="number"
          value={maxTurns}
          onChange={(e) => setMaxTurns(parseInt(e.target.value, 10) || 5)}
          min={5}
          max={100}
          step={1}
        />
        <p className="settings-hint">
          요청당 최대 턴. 다단계 계획 실행은 40–60 권장. Max turns에 자주 걸리면 올리세요.
        </p>
      </div>
      <SettingsSaveButton
        onSave={() => {
          const turns = Math.min(100, Math.max(5, Math.floor(maxTurns) || 40));
          setMaxTurns(turns);
          persistSettings({
            'agent-k.context.budget': budget,
            'agent-k.context.readMaxLines': readMaxLines,
            'agent-k.maxTurns': turns
          });
        }}
      />
    </div>
  );
}
