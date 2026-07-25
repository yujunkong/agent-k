import React, { useState, useEffect } from 'react';
import { configManager } from '../../core/ConfigManager';

export function ModelsTab() {
  const [baseUrl, setBaseUrl] = useState<string>(configManager.get('agent-k.provider.baseUrl') || '');
  const [model, setModel] = useState<string>(configManager.get('agent-k.provider.model') || '');
  const [providerType, setProviderType] = useState<string>(configManager.get('agent-k.provider.type') || 'litellm');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const handleSave = () => {
    configManager.update({
      'agent-k.provider.baseUrl': baseUrl,
      'agent-k.provider.model': model,
      'agent-k.provider.type': providerType
    });
  };

  const handleTest = async () => {
    setTestStatus('testing');
    try {
      const response = await fetch(`${baseUrl}/v1/models`, {
        signal: AbortSignal.timeout(5000)
      });
      setTestStatus(response.ok ? 'success' : 'error');
    } catch {
      setTestStatus('error');
    }
  };

  return (
    <div className="settings-tab-content">
      <h3>Provider Configuration</h3>
      
      <div className="settings-field">
        <label>Provider Type</label>
        <select value={providerType} onChange={(e) => setProviderType(e.target.value)}>
          <option value="litellm">LiteLLM</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="ollama">Ollama</option>
          <option value="lmstudio">LM Studio</option>
        </select>
      </div>

      <div className="settings-field">
        <label>Base URL</label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://localhost:4000"
        />
      </div>

      <div className="settings-field">
        <label>Model</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="gemma-2-27b"
        />
      </div>

      <div className="settings-actions">
        <button onClick={handleTest} className="settings-btn">
          {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
        </button>
        <button onClick={handleSave} className="settings-btn primary">Save</button>
      </div>

      {testStatus === 'success' && <div className="settings-success">Connection successful ✓</div>}
      {testStatus === 'error' && <div className="settings-error">Connection failed ✗</div>}
    </div>
  );
}
