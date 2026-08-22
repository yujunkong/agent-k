/**
 * SET-001 — Settings Hub overlay (v2.1 shell: search + grouped nav + all tabs).
 * SET-002…SET-013 — tab bodies live under ./settings/tabs.
 */

import { useEffect, useMemo, useState, type JSX } from 'react';
import type { ModelSettings } from './settings/modelSettings';
import { ModelsTab } from './settings/tabs/ModelsTab';
import { FeaturesTab } from './settings/tabs/FeaturesTab';
import { PermissionTab } from './settings/tabs/PermissionTab';
import { QueueTab } from './settings/tabs/QueueTab';
import { HarnessTab } from './settings/tabs/HarnessTab';
import { ContextTab } from './settings/tabs/ContextTab';
import { McpTab } from './settings/tabs/McpTab';
import { RulesTab } from './settings/tabs/RulesTab';
import { TerminalTab } from './settings/tabs/TerminalTab';
import { ReviewTab } from './settings/tabs/ReviewTab';
import { PrivacyTab } from './settings/tabs/PrivacyTab';
import { JsonConfigTab } from './settings/tabs/JsonConfigTab';

export { modelSettingsFromConfig } from './settings/modelSettings';
export type { ModelSettings } from './settings/modelSettings';

export type SettingsTabId =
  | 'models'
  | 'features'
  | 'permission'
  | 'queue'
  | 'harness'
  | 'context'
  | 'mcp'
  | 'rules'
  | 'terminal'
  | 'review'
  | 'privacy'
  | 'json';

type TabInfo = {
  id: SettingsTabId;
  label: string;
  icon: string;
  keywords: string;
};

type TabGroup = { id: string; label: string; tabs: TabInfo[] };

/** v2.1 SettingsPanel TAB_GROUPS (labels/icons/keywords). */
const TAB_GROUPS: TabGroup[] = [
  {
    id: 'general',
    label: 'General',
    tabs: [
      {
        id: 'models',
        label: 'AI Providers',
        icon: '⬡',
        keywords: 'provider model api key openai claude openrouter ollama lmstudio litellm',
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
      { id: 'mcp', label: 'MCP', icon: '◈', keywords: 'mcp server tools schema' },
      {
        id: 'rules',
        label: 'Rules',
        icon: '§',
        keywords: 'rules agentrules agents.md cursorrules',
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

const ALL_TABS = TAB_GROUPS.flatMap((g) => g.tabs);

export type SettingsPanelProps = {
  open: boolean;
  initial: ModelSettings;
  saving?: boolean;
  initialTab?: SettingsTabId;
  onClose: () => void;
  onSave: (next: ModelSettings) => void;
};

export function SettingsPanel(props: SettingsPanelProps): JSX.Element | null {
  const { open, initial, saving, initialTab = 'models', onClose, onSave } = props;
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
    setQuery('');
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TAB_GROUPS;
    return TAB_GROUPS.map((g) => ({
      ...g,
      tabs: g.tabs.filter(
        (t) =>
          t.label.toLowerCase().includes(q) ||
          t.keywords.toLowerCase().includes(q) ||
          g.label.toLowerCase().includes(q),
      ),
    })).filter((g) => g.tabs.length > 0);
  }, [query]);

  if (!open) return null;

  const activeMeta = ALL_TABS.find((t) => t.id === activeTab);

  const renderTab = (): JSX.Element => {
    switch (activeTab) {
      case 'models':
        return (
          <ModelsTab
            initialModel={initial.model}
            initialBaseUrl={initial.baseUrl}
            initialApiKey={initial.apiKey}
            saving={saving}
            onSaveDefault={onSave}
          />
        );
      case 'features':
        return <FeaturesTab />;
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
      case 'rules':
        return <RulesTab />;
      case 'terminal':
        return <TerminalTab />;
      case 'review':
        return <ReviewTab />;
      case 'privacy':
        return <PrivacyTab />;
      case 'json':
        return <JsonConfigTab />;
      default:
        return <ModelsTab initialModel={initial.model} onSaveDefault={onSave} saving={saving} />;
    }
  };

  return (
    <div
      className="settings-overlay"
      data-testid="settings-panel"
      role="dialog"
      aria-label="Agent K Settings"
    >
      <div className="settings-panel">
        <header className="settings-header">
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
                className="settings-search__input"
                data-testid="settings-search"
                type="search"
                placeholder="Search settings…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search settings"
              />
            </div>
            <button
              type="button"
              className="settings-close"
              data-testid="settings-close"
              onClick={onClose}
              aria-label="Close settings"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {filteredGroups.length === 0 ? (
              <p className="settings-nav__empty">No matching tabs</p>
            ) : (
              filteredGroups.map((group) => (
                <div className="settings-nav__group" key={group.id}>
                  <div className="settings-nav__group-label">{group.label}</div>
                  {group.tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`settings-tab${activeTab === tab.id ? ' active' : ''}`}
                      data-testid={`settings-nav-${tab.id}`}
                      onClick={() => setActiveTab(tab.id)}
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

          <div className="settings-content" data-testid={`settings-${activeTab}-tab`}>
            {renderTab()}
          </div>
        </div>
      </div>
    </div>
  );
}
