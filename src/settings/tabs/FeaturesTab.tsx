/**
 * FeaturesTab — feature toggles persisted to VS Code and enforced at runtime.
 */
import React, { useState, useEffect } from 'react';
import { configManager } from '../../core/ConfigManager';
import { persistSettings } from '../persistSettings';
import { SettingsSaveButton } from '../SettingsSaveButton';

interface FeatureToggle {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  tier: string;
  /** Where the toggle takes effect */
  gates: string;
}

const DEFAULT_FEATURES: FeatureToggle[] = [
  {
    id: 'browser',
    label: 'Browser Tools',
    description: 'Playwright 기반 브라우저 자동화',
    enabled: true,
    tier: 'B',
    gates: 'browser_* 도구'
  },
  {
    id: 'design-mode',
    label: 'Design Mode',
    description: '스크린샷 오버레이 + 주석',
    enabled: true,
    tier: 'B',
    gates: 'Design Mode 패널'
  },
  {
    id: 'worktree',
    label: 'Worktree & Best-of-N',
    description: 'git worktree 병렬 Agent 실행',
    enabled: true,
    tier: 'B',
    gates: 'Best-of-N 명령'
  },
  {
    id: 'agent-review',
    label: 'Agent Review',
    description: '자동 코드 리뷰 + Fix 제안',
    enabled: true,
    tier: 'B',
    gates: 'Review 명령'
  },
  {
    id: 'mcp',
    label: 'MCP Client',
    description: 'MCP 서버 도구 통합',
    enabled: true,
    tier: 'B',
    gates: 'MCP 연결·mcp_* 도구'
  },
  {
    id: 'skills',
    label: 'Skills',
    description: 'Pinned Skills 자동 주입',
    enabled: true,
    tier: 'A',
    gates: '스킬 주입·skill_run'
  },
  {
    id: 'sub-agents',
    label: 'Sub-Agents (Task)',
    description: '병렬 서브에이전트 실행',
    enabled: true,
    tier: 'B',
    gates: 'task / task_run'
  },
  {
    id: 'memories',
    label: 'Memories',
    description: '장기 기억',
    enabled: true,
    tier: 'A',
    gates: '컨텍스트 memories 슬롯'
  },
  {
    id: 'inline-completion',
    label: 'Inline Completion',
    description: '코드 입력 중 자동 완성',
    enabled: false,
    tier: 'A',
    gates: '인라인 완성 제공자'
  },
  {
    id: 'github',
    label: 'GitHub Agent',
    description: 'gh CLI PR/이슈',
    enabled: true,
    tier: 'B',
    gates: 'GitHubAgent (gh)'
  },
  {
    id: 'codebase-index',
    label: 'Codebase Index',
    description: '로컬 인덱싱 + @codebase',
    enabled: true,
    tier: 'B',
    gates: 'codebase_search · @codebase'
  },
];

export function FeaturesTab() {
  const [features, setFeatures] = useState<FeatureToggle[]>(DEFAULT_FEATURES);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setFeatures(
      DEFAULT_FEATURES.map((f) => ({
        ...f,
        enabled: configManager.get(`agent-k.features.${f.id}`) ?? f.enabled
      }))
    );
  }, []);

  const toggleFeature = (id: string) => {
    setFeatures((prev) =>
      prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f))
    );
    setDirty(true);
  };

  const saveSettings = () => {
    const updates: Record<string, boolean> = {};
    for (const f of features) {
      updates[`agent-k.features.${f.id}`] = f.enabled;
    }
    persistSettings(updates);
    setDirty(false);
  };

  const enabledCount = features.filter((f) => f.enabled).length;

  return (
    <div className="settings-tab-content">
      <h3>기능</h3>
      <p className="settings-banner settings-banner--info" role="status">
        저장 후 도구 스키마·명령·컨텍스트 주입에 반영됩니다. 이미 열린 채팅은
        다음 턴부터 적용됩니다.
      </p>
      <p className="settings-hint">
        {enabledCount}/{features.length} 사용 중
      </p>

      <div className="settings-feature-list">
        {features.map((feature) => (
          <label
            key={feature.id}
            className={`settings-feature-row${
              feature.enabled ? '' : ' settings-feature-row--off'
            }`}
          >
            <input
              type="checkbox"
              checked={feature.enabled}
              onChange={() => toggleFeature(feature.id)}
            />
            <span className="settings-feature-row__body">
              <span className="settings-feature-row__title">
                {feature.label}
                <span className="settings-feature-row__tier">
                  Tier {feature.tier}
                </span>
              </span>
              <span className="settings-feature-row__desc">
                {feature.description}
              </span>
              <span className="settings-feature-row__gates">
                게이트: {feature.gates}
              </span>
            </span>
          </label>
        ))}
      </div>

      <SettingsSaveButton onSave={saveSettings} disabled={!dirty} />
    </div>
  );
}
