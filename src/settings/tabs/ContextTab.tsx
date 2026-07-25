import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';

export function ContextTab() {
  const [budget, setBudget] = useState<number>(configManager.get('agent-k.context.budget') || 100000);
  const [readMaxLines, setReadMaxLines] = useState<number>(configManager.get('agent-k.context.readMaxLines') || 5000);

  const handleSave = () => {
    configManager.update({
      'agent-k.context.budget': budget,
      'agent-k.context.readMaxLines': readMaxLines
    });
  };

  return (
    <div className="settings-tab-content">
      <h3>Context Budget</h3>
      <div className="settings-field">
        <label>Max Token Budget</label>
        <input
          type="number"
          value={budget}
          onChange={(e) => setBudget(parseInt(e.target.value))}
          min={1000}
          max={1000000}
          step={1000}
        />
      </div>
      <div className="settings-field">
        <label>Read Max Lines</label>
        <input
          type="number"
          value={readMaxLines}
          onChange={(e) => setReadMaxLines(parseInt(e.target.value))}
          min={100}
          max={50000}
        />
      </div>
      <div className="settings-actions">
        <button onClick={handleSave} className="settings-btn primary">Save</button>
      </div>
    </div>
  );
}
