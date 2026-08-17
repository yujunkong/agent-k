/**
 * Settings Hub — Webview settings UI (redesign shell)
 *
 * Groups: General / Agent / Integrations / Advanced
 * Search filters tabs; Escape closes via parent overlay.
 * ConfigManager sync remains per-tab responsibility.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ModelsTab } from './tabs/ModelsTab';
import { PermissionTab } from './tabs/PermissionTab';
import { QueueTab } from './tabs/QueueTab';
import { HarnessTab } from './tabs/HarnessTab';
import { ContextTab } from './tabs/ContextTab';
import { McpTab } from './tabs/McpTab';
import { PrivacyTab } from './tabs/PrivacyTab';
import { FeaturesTab } from './tabs/FeaturesTab';
import { JsonConfigTab } from './tabs/JsonConfigTab';
import { RulesTab } from './tabs/RulesTab';
import { TerminalTab } from './tabs/TerminalTab';
import { ReviewTab } from './tabs/ReviewTab';

interface SettingsPanelProps {
  onClose?: () => void;
  initialTab?: TabId | 'secrets';
  /** Fired when user selects a tab (for last-tab memory in ChatApp) */
  onTabChange?: (tab: TabId) => void;
}

export type TabId =
  | 'models'
  | 'permission'
  | 'queue'
  | 'harness'
  | 'context'
  | 'mcp'
  | 'features'
  | 'privacy'
  | 'json'
  | 'rules'
  | 'terminal'
  | 'review';

interface TabInfo {
  id: TabId;
  label: string;
  /** Short keywords for search */
  keywords: string;
  icon: string;
}

interface TabGroup {
  id: string;
  label: string;
  tabs: TabInfo[];
}

const TAB_GROUPS: TabGroup[] = [
  {
    id: 'general',
    label: 'General',
    tabs: [
      {
        id: 'models',
        label: 'Models',
        icon: '⬡',
        keywords: 'provider model api key openai litellm ollama credentials github token',
      },
      {
        id: 'features',
        label: 'Features',
        icon: '◇',
        keywords: 'toggle browser mcp skills worktree review memories',
      },
    ],
  },
  {
    id: 'agent',
    label: 'Agent',
    tabs: [
      {
        id: 'permission',
        label: 'Permission',
        icon: '◎',
        keywords: 'permission gate ask auto deny globs trust',
      },
      {
        id: 'queue',
        label: 'Queue',
        icon: '☰',
        keywords: 'queue enter stop resynthesize debounce',
      },
      {
        id: 'harness',
        label: 'Harness',
        icon: '▣',
        keywords: 'harness verification prefetch micro loop',
      },
      {
        id: 'context',
        label: 'Context',
        icon: '▤',
        keywords: 'context budget turns lines window',
      },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    tabs: [
      {
        id: 'mcp',
        label: 'MCP',
        icon: '◈',
        keywords: 'mcp server tools schema',
      },
      {
        id: 'rules',
        label: 'Rules',
        icon: '§',
        keywords: 'rules agentrules agents.md cursorrules clinerules custom .agentk/rules',
      },
      {
        id: 'terminal',
        label: 'Terminal',
        icon: '>_',
        keywords: 'terminal shell timeout deny allowlist',
      },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    tabs: [
      {
        id: 'review',
        label: 'Review',
        icon: '✓',
        keywords: 'review checkpoint apply policy rollback',
      },
      {
        id: 'privacy',
        label: 'Privacy',
        icon: '◐',
        keywords: 'privacy telemetry status bar',
      },
      {
        id: 'json',
        label: 'JSON',
        icon: '{ }',
        keywords: 'json settings.json project config file',
      },
    ],
  },
];

const ALL_TABS: TabInfo[] = TAB_GROUPS.flatMap((g) => g.tabs);

function normalizeTab(tab: TabId | 'secrets' | undefined): TabId {
  if (!tab || tab === 'secrets') return 'models';
  if (ALL_TABS.some((t) => t.id === tab)) return tab;
  return 'models';
}

export function SettingsPanel({ onClose, initialTab = 'models', onTabChange }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>(() => normalizeTab(initialTab));
  const [query, setQuery] = useState('');

  useEffect(() => {
    setActiveTab(normalizeTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TAB_GROUPS;
    return TAB_GROUPS.map((g) => ({
      ...g,
      tabs: g.tabs.filter(
        (t) =>
          t.label.toLowerCase().includes(q) ||
          t.keywords.toLowerCase().includes(q) ||
          g.label.toLowerCase().includes(q)
      ),
    })).filter((g) => g.tabs.length > 0);
  }, [query]);

  const activeMeta = ALL_TABS.find((t) => t.id === activeTab);

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
      case 'rules':
        return <RulesTab />;
      case 'terminal':
        return <TerminalTab />;
      case 'review':
        return <ReviewTab />;
      default:
        return <ModelsTab />;
    }
  };

  return (
    <div className="settings-panel" role="dialog" aria-label="Agent K Settings">
      <div className="settings-header">
        <div className="settings-header__titles">
          <h2>Settings</h2>
          {activeMeta ? (
            <span className="settings-header__subtitle">{activeMeta.label}</span>
          ) : null}
        </div>
        <div className="settings-header__actions">
          <div className="settings-search">
            <span className="settings-search__icon" aria-hidden>
              ⌕
            </span>
            <input
              type="search"
              className="settings-search__input"
              placeholder="Search settings…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search settings tabs"
            />
          </div>
          {onClose ? (
            <button
              type="button"
              className="settings-close"
              onClick={onClose}
              aria-label="Close settings"
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      <div className="settings-body">
        <nav className="settings-nav" aria-label="Settings categories">
          {filteredGroups.length === 0 ? (
            <p className="settings-nav__empty">No matching tabs</p>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.id} className="settings-nav__group">
                <div className="settings-nav__group-label">{group.label}</div>
                {group.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`settings-tab${activeTab === tab.id ? ' active' : ''}`}
                    onClick={() => {
                      setActiveTab(tab.id);
                      onTabChange?.(tab.id);
                    }}
                    aria-current={activeTab === tab.id ? 'page' : undefined}
                  >
                    <span className="tab-icon" aria-hidden>
                      {tab.icon}
                    </span>
                    <span className="tab-label">{tab.label}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </nav>
        <div className="settings-content">{renderTab()}</div>
      </div>
    </div>
  );
}
