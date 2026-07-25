import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';

export function PermissionTab() {
  const [level, setLevel] = useState<string>(configManager.get('agent-k.permission.level') || 'ask');

  const handleSave = () => {
    configManager.set('agent-k.permission.level', level);
  };

  return (
    <div className="settings-tab-content">
      <h3>Permission Gate</h3>
      <div className="settings-field">
        <label>Permission Level</label>
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="ask">Ask (confirm every action)</option>
          <option value="accept_edits">Accept Edits (auto-approve edits)</option>
          <option value="auto">Auto (full trust)</option>
          <option value="bypass">Bypass (no permission gate)</option>
        </select>
      </div>
      <div className="settings-actions">
        <button onClick={handleSave} className="settings-btn primary">Save</button>
      </div>
    </div>
  );
}
