import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';

/** Queue settings tab — RW-P0-03: onEnter / onStop / debounce keys */
export function QueueTab() {
  const [onEnter, setOnEnter] = useState<string>(configManager.get('agent-k.queue.onEnterWhileRunning') || 'resynthesize');
  const [onStop, setOnStop] = useState<string>(configManager.get('agent-k.queue.onStop') || 'keep');
  const [debounceMs, setDebounceMs] = useState<number>(
    configManager.get('agent-k.queue.resynthesizeDebounceMs') ||
    configManager.get('agent-k.queue.debounceMs') ||
    300
  );

  const handleSave = () => {
    // Persist all queue keys so VS Code settings + ConfigManager stay in sync
    configManager.update({
      'agent-k.queue.onEnterWhileRunning': onEnter,
      'agent-k.queue.onStop': onStop,
      'agent-k.queue.resynthesizeDebounceMs': debounceMs,
      'agent-k.queue.debounceMs': debounceMs
    });
  };

  return (
    <div className="settings-tab-content">
      <h3>Queue Settings</h3>
      <div className="settings-field">
        <label>On Enter While Running</label>
        <select value={onEnter} onChange={(e) => setOnEnter(e.target.value)}>
          <option value="resynthesize">Interrupt & Resynthesize</option>
          <option value="queue_only">Queue only</option>
        </select>
      </div>
      <div className="settings-field">
        <label>On Stop</label>
        <select value={onStop} onChange={(e) => setOnStop(e.target.value)}>
          <option value="keep">Keep queue</option>
          <option value="discard">Discard queue</option>
        </select>
      </div>
      <div className="settings-field">
        <label>Resynthesize Debounce (ms)</label>
        <input
          type="number"
          value={debounceMs}
          onChange={(e) => setDebounceMs(parseInt(e.target.value, 10) || 300)}
          min={100}
          max={5000}
        />
      </div>
      <div className="settings-actions">
        <button onClick={handleSave} className="settings-btn primary">Save</button>
      </div>
    </div>
  );
}
