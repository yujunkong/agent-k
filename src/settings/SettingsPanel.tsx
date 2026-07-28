/**
 * Settings Hub - Webview 기반 설정 UI
 *
 * 탭: Models / Permission / Queue / Harness / Context / MCP / Privacy
 * (Secrets merged into Models — single provider + credentials surface)
 * ConfigManager와 양방향 동기화
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
  initialTab?: TabId | 'secrets';
}

type TabId =
  | 'models'
  | 'permission'
  | 'queue'
  | 'harness'
  | 'context'
  | 'mcp'
  | 'features'
  | 'privacy'
  | 'json';

interface TabInfo {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: TabInfo[] = [
  { id: 'models', label: 'Models', icon: '🤖' },
  { id: 'permission', label: 'Permission', icon: '🔒' },
  { id: 'features', label: 'Features', icon: '⚙️' },
  { id: 'harness', label: 'Harness', icon: '🧪' },
  { id: 'context', label: 'Context', icon: '📚' },
  { id: 'mcp', label: 'MCP', icon: '🔌' },
  { id: 'queue', label: 'Queue', icon: '📋' },
  { id: 'privacy', label: 'Privacy', icon: '🔐' },
  { id: 'json', label: 'JSON', icon: '{ }' }
];

function normalizeTab(tab: TabId | 'secrets' | undefined): TabId {
  if (!tab || tab === 'secrets') return 'models';
  return tab;
}

export function SettingsPanel({ onClose, initialTab = 'models' }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>(() => normalizeTab(initialTab));

  const renderTab = () => {
    switch (activeTab) {
      case 'models':
        return <ModelsTab />;
      case 'permission':
        return <PermissionTab />;
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
      case 'json':
        return <JsonConfigTab />;
      default:
        return <ModelsTab />;
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>Settings</h2>
        {onClose && (
          <button className="settings-close" onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      <div className="settings-body">
        <nav className="settings-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-content">{renderTab()}</div>
      </div>
    </div>
  );
}
