/**
 * FeaturesTab — 기능 토글 UI (C7-T46)
 *
 * ConfigManager와 동기화. 각 기능의 on/off 토글.
 */
import React, { useState, useEffect } from 'react';
import { configManager } from '../../core/ConfigManager';

interface FeatureToggle {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  tier: string;
}

const DEFAULT_FEATURES: FeatureToggle[] = [
  { id: 'browser', label: 'Browser Tools', description: 'Playwright 기반 브라우저 자동화', enabled: true, tier: 'B' },
  { id: 'design-mode', label: 'Design Mode', description: '스크린샷 오버레이 + 주석', enabled: true, tier: 'B' },
  { id: 'worktree', label: 'Worktree & Best-of-N', description: 'git worktree 병렬 Agent 실행', enabled: true, tier: 'B' },
  { id: 'agent-review', label: 'Agent Review Loop', description: '자동 코드 리뷰 + Fix 제안', enabled: true, tier: 'B' },
  { id: 'mcp', label: 'MCP Client', description: 'MCP 서버 도구 통합', enabled: true, tier: 'B' },
  { id: 'skills', label: 'Skills System', description: 'Pinned Skills 자동 주입', enabled: true, tier: 'A' },
  { id: 'sub-agents', label: 'Sub-Agents (Task)', description: '병렬 서브에이전트 실행', enabled: true, tier: 'B' },
  { id: 'memories', label: 'Memories', description: 'SecretStorage 기반 장기 기억', enabled: true, tier: 'A' },
  { id: 'inline-completion', label: 'Inline Completion', description: '코드 입력 중 자동 완성', enabled: false, tier: 'A' },
  { id: 'github', label: 'GitHub Agent', description: 'gh CLI PR/이슈 관리', enabled: true, tier: 'B' },
  { id: 'codebase-index', label: 'Codebase Indexing', description: '로컬 코드 인덱싱 + @codebase 검색', enabled: true, tier: 'B' },
];

export function FeaturesTab() {
  const [features, setFeatures] = useState<FeatureToggle[]>(DEFAULT_FEATURES);
  const [dirty, setDirty] = useState(false);

  // ConfigManager에서 초기 토글 로드 (RW-C7-08)
  useEffect(() => {
    setFeatures(
      DEFAULT_FEATURES.map(f => ({
        ...f,
        enabled: configManager.get(`agent-k.features.${f.id}`) ?? f.enabled
      }))
    );
  }, []);

  const toggleFeature = (id: string) => {
    setFeatures(prev =>
      prev.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f)
    );
    setDirty(true);
  };

  const saveSettings = () => {
    const updates: Record<string, boolean> = {};
    for (const f of features) {
      updates[`agent-k.features.${f.id}`] = f.enabled;
    }
    configManager.update(updates);
    setDirty(false);
  };

  const exportSchema = () => {
    const schema = {
      type: 'object',
      properties: Object.fromEntries(
        features.map(f => [
          f.id,
          { type: 'boolean', description: f.description, default: f.enabled }
        ])
      )
    };

    // Show as JSON (secrets excluded)
    navigator.clipboard.writeText(JSON.stringify(schema, null, 2));
  };

  const tierCount = (tier: string) => features.filter(f => f.tier === tier).length;
  const enabledCount = features.filter(f => f.enabled).length;

  return (
    <div className="features-tab">
      <div style={{ marginBottom: 12, fontSize: '0.85em', opacity: 0.7 }}>
        <span>{enabledCount}/{features.length} features enabled</span>
        <span style={{ marginLeft: 12 }}>Tier A: {tierCount('A')} | Tier B: {tierCount('B')}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {features.map(feature => (
          <div key={feature.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 4,
              background: 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.03))',
              border: `1px solid var(--vscode-panel-border, #333)`,
              opacity: feature.enabled ? 1 : 0.5
            }}>
            <label style={{
              position: 'relative', display: 'inline-block',
              width: 36, height: 20, cursor: 'pointer', flexShrink: 0
            }}>
              <input
                type="checkbox"
                checked={feature.enabled}
                onChange={() => toggleFeature(feature.id)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute', inset: 0,
                borderRadius: 10,
                background: feature.enabled ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.1)',
                transition: '0.2s'
              }}>
                <span style={{
                  position: 'absolute', top: 2, left: feature.enabled ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#fff', transition: '0.2s'
                }} />
              </span>
            </label>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85em', fontWeight: 500 }}>
                {feature.label}
                <span style={{
                  marginLeft: 6, padding: '1px 6px', borderRadius: 3,
                  fontSize: '0.7em', opacity: 0.5,
                  background: feature.tier === 'A' ? 'rgba(59,130,246,0.1)' : 'rgba(139,92,246,0.1)'
                }}>
                  Tier {feature.tier}
                </span>
              </div>
              <div style={{ fontSize: '0.75em', opacity: 0.6, marginTop: 2 }}>
                {feature.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={exportSchema}
          style={{
            padding: '6px 12px', borderRadius: 4, fontSize: '0.85em',
            background: 'transparent',
            border: '1px solid var(--vscode-panel-border, #555)',
            cursor: 'pointer'
          }}>
          Export Schema
        </button>
        <button onClick={saveSettings}
          disabled={!dirty}
          style={{
            padding: '6px 16px', borderRadius: 4, fontSize: '0.85em',
            background: dirty ? 'var(--vscode-button-background, #0078d4)' : 'var(--vscode-button-secondaryBackground, #5a5a5a)',
            color: 'var(--vscode-button-foreground, #fff)',
            border: 'none', cursor: dirty ? 'pointer' : 'default'
          }}>
          {dirty ? 'Save Changes' : 'Saved'}
        </button>
      </div>
    </div>
  );
}
