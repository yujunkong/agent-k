import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';

export function QueueTab() {
  const [onEnter, setOnEnter] = useState<string>(configManager.get('agent-k.queue.onEnterWhileRunning') || 'resynthesize');
  const [debounceMs, setDebounceMs] = useState<number>(configManager.get('agent-k.queue.debounceMs') || 500);

  const handleSave = () => {
    configManager.update({
      'agent-k.queue.onEnterWhileRunning': onEnter,
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
        <label>Debounce (ms)</label>
        <input
          type="number"
          value={debounceMs}
          onChange={(e) => setDebounceMs(parseInt(e.target.value))}
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
