import React, { useState } from 'react';
import { configManager } from '../../core/ConfigManager';

export function ContextTab() {
  const [budget, setBudget] = useState<number>(configManager.get('agent-k.context.budget') || 100000);
  const [readMaxLines, setReadMaxLines] = useState<number>(configManager.get('agent-k.context.readMaxLines') || 5000);
  const [maxTurns, setMaxTurns] = useState<number>(
    Number(configManager.get('agent-k.maxTurns')) || 25
  );

  const handleSave = () => {
    const turns = Math.min(100, Math.max(5, Math.floor(maxTurns) || 25));
    setMaxTurns(turns);
    configManager.update({
      'agent-k.context.budget': budget,
      'agent-k.context.readMaxLines': readMaxLines,
      'agent-k.maxTurns': turns
    });
  };

  return (
    <div className="settings-tab-content">
      <h3>Context Budget</h3>
      <p style={{ fontSize: 12, opacity: 0.75, marginTop: 0 }}>
        Fallback only — Agent K prefers max_input_tokens / context length from the selected provider (LiteLLM, Ollama, OpenAI, …).
        프로젝트 설정은 Settings → JSON 탭의 <code>.agentk/settings.json</code>을 권장합니다.
      </p>
      <div className="settings-field">
        <label>Fallback Max Token Budget</label>
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
      <div className="settings-field">
        <label>Max Turns (에이전트 루프)</label>
        <input
          type="number"
          value={maxTurns}
          onChange={(e) => setMaxTurns(parseInt(e.target.value) || 5)}
          min={5}
          max={100}
          step={1}
        />
        <p style={{ fontSize: 11, opacity: 0.7, margin: '4px 0 0' }}>
          한 요청당 최대 턴. 소형/로컬 모델은 25–40 권장. VS Code 설정에도 저장됩니다.
        </p>
      </div>
      <div className="settings-actions">
        <button onClick={handleSave} className="settings-btn primary">Save</button>
      </div>
    </div>
  );
}
