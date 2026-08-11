import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import { persistSettings } from '../persistSettings';
import { SettingsSaveButton } from '../SettingsSaveButton';

/** Queue settings tab — RW-P0-03: onEnter / onStop / debounce keys */
export function QueueTab() {
  const [onEnter, setOnEnter] = useState<string>(
    configManager.get('agent-k.queue.onEnterWhileRunning') || 'resynthesize'
  );
  const [onStop, setOnStop] = useState<string>(
    configManager.get('agent-k.queue.onStop') || 'keep'
  );
  const [debounceMs, setDebounceMs] = useState<number>(
    configManager.get('agent-k.queue.resynthesizeDebounceMs') ||
      configManager.get('agent-k.queue.debounceMs') ||
      300
  );

  return (
    <div className="settings-tab-content">
      <h3>메시지 큐</h3>
      <p className="settings-hint">에이전트가 실행 중일 때 Enter / Stop 동작을 정합니다.</p>
      <div className="settings-field">
        <label>실행 중 Enter</label>
        <select value={onEnter} onChange={(e) => setOnEnter(e.target.value)}>
          <option value="resynthesize">중단 후 다시 종합</option>
          <option value="queue_only">큐에만 넣기</option>
        </select>
      </div>
      <div className="settings-field">
        <label>Stop 시 큐</label>
        <select value={onStop} onChange={(e) => setOnStop(e.target.value)}>
          <option value="keep">유지</option>
          <option value="discard">비우기</option>
        </select>
      </div>
      <div className="settings-field">
        <label>재종합 디바운스 (ms)</label>
        <input
          type="number"
          value={debounceMs}
          onChange={(e) => setDebounceMs(parseInt(e.target.value, 10) || 300)}
          min={100}
          max={5000}
        />
      </div>
      <SettingsSaveButton
        onSave={() =>
          persistSettings({
            'agent-k.queue.onEnterWhileRunning': onEnter,
            'agent-k.queue.onStop': onStop,
            'agent-k.queue.resynthesizeDebounceMs': debounceMs,
            'agent-k.queue.debounceMs': debounceMs
          })
        }
      />
    </div>
  );
}
