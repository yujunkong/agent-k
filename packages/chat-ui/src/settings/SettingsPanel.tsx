/**
 * Settings Hub — Webview settings UI (redesign shell)
 *
 * Groups: General / Agent / Integrations / Advanced
 * Search filters tabs; Escape closes via parent overlay.
 * V31-UI-09 — focus trap + keyboard tab navigation; nav scrolls independently.
 * ConfigManager sync remains per-tab responsibility.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  IconCheck,
  IconNavContext,
  IconNavFeatures,
  IconNavHarness,
  IconNavJson,
  IconNavMcp,
  IconNavPermission,
  IconNavPrivacy,
  IconNavProviders,
  IconNavRules,
  IconNavTerminal,
  IconQueue,
} from '../chat/components/Icons';

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
        label: 'AI Providers',
        keywords: 'provider model api key openai claude openrouter ollama lmstudio litellm credentials save',
      },
      {
        id: 'features',
        label: 'Features',
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
        keywords: 'permission gate ask auto deny globs trust',
      },
      {
        id: 'queue',
        label: 'Queue',
        keywords: 'queue enter stop resynthesize debounce',
      },
      {
        id: 'harness',
        label: 'Harness',
        keywords: 'harness verification prefetch micro loop',
      },
      {
        id: 'context',
        label: 'Context',
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
        keywords: 'mcp server tools schema',
      },
      {
        id: 'rules',
        label: 'Rules',
        keywords: 'rules agentrules agents.md cursorrules clinerules custom .agentk/rules',
      },
      {
        id: 'terminal',
        label: 'Terminal',
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
        keywords: 'review checkpoint apply policy rollback',
      },
      {
        id: 'privacy',
        label: 'Privacy',
        keywords: 'privacy telemetry status bar',
      },
      {
        id: 'json',
        label: 'JSON',
        keywords: 'json settings.json project config file',
      },
    ],
  },
];

const ALL_TABS: TabInfo[] = TAB_GROUPS.flatMap((g) => g.tabs);

/**
 * V31-UI-09 — setting-level keywords so search matches actual settings, not just
 * tab labels. Each entry maps a user-typed term to the tab that owns it.
 */
const TAB_SETTING_KEYWORDS: Record<TabId, string> = {
  models: 'temperature base url api key model provider connection profile preset test refresh',
  permission: 'ask auto deny globs trust level gate write',
  queue: 'enter ctrl enter alt enter stop discard resynthesize debounce send',
  harness: 'verification first prefetch micro loop lint read_lints enabled',
  context: 'budget tokens turns lines window max turns read max lines compaction',
  mcp: 'server stdio command args env schema tokens',
  features: 'browser design worktree review mcp skills sub agents memories github inline completion codebase',
  privacy: 'telemetry status bar cost usage secrets',
  json: 'settings.json project config file raw editor',
  rules: 'agents.md cursor rules agentrules clinerules .agentk/rules custom',
  terminal: 'shell timeout deny pattern allowlist command',
  review: 'checkpoint apply policy rollback diff findings accept undo',
};

function tabMatchesQuery(tab: TabInfo, q: string): boolean {
  const extra = TAB_SETTING_KEYWORDS[tab.id] || '';
  return (
    tab.label.toLowerCase().includes(q) ||
    tab.keywords.toLowerCase().includes(q) ||
    extra.toLowerCase().includes(q)
  );
}

function normalizeTab(tab: TabId | 'secrets' | undefined): TabId {
  if (!tab || tab === 'secrets') return 'models';
  if (ALL_TABS.some((t) => t.id === tab)) return tab;
  return 'models';
}

/** Comment: V31-UI-17 — SVG nav glyphs (Cursor settings density). */
function SettingsNavIcon({ id }: { id: TabId }) {
  const props = { size: 14 as const };
  switch (id) {
    case 'models':
      return <IconNavProviders {...props} />;
    case 'features':
      return <IconNavFeatures {...props} />;
    case 'permission':
      return <IconNavPermission {...props} />;
    case 'queue':
      return <IconQueue {...props} />;
    case 'harness':
      return <IconNavHarness {...props} />;
    case 'context':
      return <IconNavContext {...props} />;
    case 'mcp':
      return <IconNavMcp {...props} />;
    case 'rules':
      return <IconNavRules {...props} />;
    case 'terminal':
      return <IconNavTerminal {...props} />;
    case 'review':
      return <IconCheck {...props} />;
    case 'privacy':
      return <IconNavPrivacy {...props} />;
    case 'json':
      return <IconNavJson {...props} />;
    default:
      return <IconNavProviders {...props} />;
  }
}

export function SettingsPanel({ onClose, initialTab = 'models', onTabChange }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>(() => normalizeTab(initialTab));
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setActiveTab(normalizeTab(initialTab));
  }, [initialTab]);

  // V31-UI-09 — Escape closes; Tab is trapped inside the dialog
  useEffect(() => {
    const root = panelRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && root) {
        const focusables = root.querySelectorAll<HTMLElement>(
          'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // V31-UI-09 — move focus into the dialog when it opens
  useEffect(() => {
    const root = panelRef.current;
    if (!root) return;
    const first = root.querySelector<HTMLElement>(
      '.settings-search__input, button:not([disabled])',
    );
    first?.focus();
  }, []);

  /** V31-UI-09 — arrow keys move between visible tabs in the nav */
  const onNavKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const nav = navRef.current;
      if (!nav) return;
      const tabs = Array.from(
        nav.querySelectorAll<HTMLButtonElement>('.settings-tab'),
      );
      if (tabs.length === 0) return;
      const idx = tabs.findIndex((t) => t === document.activeElement);
      const next =
        e.key === 'ArrowDown'
          ? (idx + 1) % tabs.length
          : (idx - 1 + tabs.length) % tabs.length;
      e.preventDefault();
      tabs[next].focus();
    },
    [],
  );

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TAB_GROUPS;
    return TAB_GROUPS.map((g) => ({
      ...g,
      tabs: g.tabs.filter(
        (t) =>
          tabMatchesQuery(t, q) ||
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
    <div
      className="settings-panel"
      role="dialog"
      aria-label="Agent K Settings"
      aria-modal="true"
      ref={panelRef}
    >
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
        <nav
          className="settings-nav"
          aria-label="Settings categories"
          ref={navRef}
          onKeyDown={onNavKeyDown}
        >
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
                      <SettingsNavIcon id={tab.id} />
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
