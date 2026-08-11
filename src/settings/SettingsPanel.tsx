/**
 * Settings Hub — Webview settings UI
 *
 * IA (OpenCode-inspired): Provider · Permission · Project · Advanced…
 * Persist via persistSettings → VS Code config; project JSON overrides when present.
 */
import React, { useState } from 'react';
import { ModelsTab } from './tabs/ModelsTab';
import { PermissionTab } from './tabs/PermissionTab';
import { QueueTab } from './tabs/QueueTab';
import { HarnessTab } from './tabs/HarnessTab';
import { ContextTab } from './tabs/ContextTab';
import { McpTab } from './tabs/McpTab';
import { PrivacyTab } from './tabs/PrivacyTab';
import { FeaturesTab } from './tabs/FeaturesTab';
import { JsonConfigTab } from './tabs/JsonConfigTab';

interface SettingsPanelProps {
  onClose?: () => void;
  initialTab?: TabId | 'secrets' | 'models' | 'json';
}

export type TabId =
  | 'provider'
  | 'permission'
  | 'project'
  | 'queue'
  | 'harness'
  | 'context'
  | 'mcp'
  | 'features'
  | 'privacy';

interface TabInfo {
  id: TabId;
  label: string;
  group?: 'main' | 'advanced';
}

const TABS: TabInfo[] = [
  { id: 'provider', label: 'Provider', group: 'main' },
  { id: 'permission', label: 'Permission', group: 'main' },
  { id: 'project', label: 'Project', group: 'main' },
  { id: 'features', label: 'Features', group: 'advanced' },
  { id: 'harness', label: 'Harness', group: 'advanced' },
  { id: 'context', label: 'Context', group: 'advanced' },
  { id: 'mcp', label: 'MCP', group: 'advanced' },
  { id: 'queue', label: 'Queue', group: 'advanced' },
  { id: 'privacy', label: 'Privacy', group: 'advanced' }
];

function normalizeTab(
  tab: TabId | 'secrets' | 'models' | 'json' | undefined
): TabId {
  if (!tab || tab === 'secrets' || tab === 'models') return 'provider';
  if (tab === 'json') return 'project';
  return tab;
}

export function SettingsPanel({
  onClose,
  initialTab = 'provider'
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    normalizeTab(initialTab)
  );

  const renderTab = () => {
    switch (activeTab) {
      case 'provider':
        return <ModelsTab />;
      case 'permission':
        return <PermissionTab />;
      case 'project':
        return <JsonConfigTab />;
      case 'queue':
        return <QueueTab />;
      case 'harness':
        return <HarnessTab />;
      case 'context':
        return <ContextTab />;
      case 'mcp':
        return <McpTab />;
      case 'features':
        return <FeaturesTab />;
      case 'privacy':
        return <PrivacyTab />;
      default:
        return <ModelsTab />;
    }
  };

  const mainTabs = TABS.filter((t) => t.group === 'main');
  const advancedTabs = TABS.filter((t) => t.group === 'advanced');

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>Settings</h2>
        {onClose && (
          <button type="button" className="settings-close" onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      <p className="settings-precedence" role="note">
        전역: VS Code 설정 · 프로젝트: <code>.agentk/settings.json</code>{' '}
        (있으면 우선) · API 키는 Provider 탭에 두고 프로젝트 JSON에는 넣지
        마세요.
      </p>
      <div className="settings-body">
        <nav className="settings-nav" aria-label="Settings categories">
          {mainTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`settings-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
          <div className="settings-nav__divider" aria-hidden>
            Advanced
          </div>
          {advancedTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`settings-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-content">{renderTab()}</div>
      </div>
    </div>
  );
}
