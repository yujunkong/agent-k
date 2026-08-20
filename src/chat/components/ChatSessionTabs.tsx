/**
 * Cursor-style session tabs + header actions.
 * Also hosts subagent progress tabs (no composer — detail view in ChatApp).
 */
import React, { useMemo, useState, useRef, useEffect } from 'react';
import type { ChatSessionMeta } from '../ChatSessionStore';
import type { SubagentDetailTab } from './SubagentDetailView';
import {
  IconClose,
  IconHistory,
  IconMore,
  IconPlus,
  IconSidebar
} from './Icons';

const MAX_VISIBLE_TABS = 8;

/** Same first-message title → distinguish with time so tabs don't look identical */
function formatTabTitle(s: ChatSessionMeta, all: ChatSessionMeta[]): string {
  const base = (s.title || 'New chat').trim() || 'New chat';
  const dupes = all.filter((x) => (x.title || 'New chat').trim() === base);
  if (dupes.length <= 1) return base;
  const d = new Date(s.updatedAt || s.createdAt || Date.now());
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${base} · ${hh}:${mm}`;
}

export interface ChatSessionTabsProps {
  sessions: ChatSessionMeta[];
  currentId: string;
  /** Tabs the user has open (ordered). Missing ids are filtered out. */
  openTabIds: string[];
  onSelect: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNew: () => void;
  onHistory: () => void;
  onSettings: () => void;
  historyOpen?: boolean;
  /** Open subagent progress tabs (Cursor-style agent tabs). */
  subagentTabs?: SubagentDetailTab[];
  activeSubagentId?: string | null;
  onSelectSubagent?: (id: string) => void;
  onCloseSubagent?: (id: string) => void;
}

export function ChatSessionTabs({
  sessions,
  currentId,
  openTabIds,
  onSelect,
  onCloseTab,
  onNew,
  onHistory,
  onSettings,
  historyOpen,
  subagentTabs = [],
  activeSubagentId = null,
  onSelectSubagent,
  onCloseSubagent
}: ChatSessionTabsProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => {
    const m = new Map<string, ChatSessionMeta>();
    for (const s of sessions) m.set(s.id, s);
    return m;
  }, [sessions]);

  const tabs = useMemo(() => {
    // Only explicitly open tabs — never force-add current (that broke ✕ close)
    const ordered: ChatSessionMeta[] = [];
    for (const id of openTabIds) {
      const s = byId.get(id);
      if (s) ordered.push(s);
    }
    return ordered.slice(0, MAX_VISIBLE_TABS);
  }, [openTabIds, byId]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreOpen]);

  const sessionActive = !activeSubagentId;

  return (
    <header className="chat-header chat-header--tabs">
      <div className="chat-header-tabs" role="tablist" aria-label="Chat sessions">
        {tabs.map((s) => {
          const active = sessionActive && s.id === currentId;
          const title = formatTabTitle(s, sessions);
          return (
            <div
              key={s.id}
              className={`chat-tab${active ? ' chat-tab--active' : ''}`}
              role="tab"
              aria-selected={active}
            >
              <button
                type="button"
                className="chat-tab__btn"
                title={`${title}\n${s.id}`}
                onClick={() => onSelect(s.id)}
              >
                <span className="chat-tab__title">{title}</span>
              </button>
              <button
                type="button"
                className="chat-tab__close"
                title="Close tab"
                aria-label={`Close ${title} tab`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCloseTab(s.id);
                }}
              >
                <IconClose size={12} />
              </button>
            </div>
          );
        })}
        {/* Subagent progress tabs — same strip, distinct chrome */}
        {subagentTabs.map((t) => {
          const active = activeSubagentId === t.id;
          return (
            <div
              key={`sub-${t.id}`}
              className={`chat-tab chat-tab--subagent${active ? ' chat-tab--active' : ''}`}
              role="tab"
              aria-selected={active}
            >
              <button
                type="button"
                className="chat-tab__btn"
                title={`Agent · ${t.title}`}
                onClick={() => onSelectSubagent?.(t.id)}
              >
                <span className="chat-tab__badge" aria-hidden>
                  A
                </span>
                <span className="chat-tab__title">{t.title}</span>
              </button>
              <button
                type="button"
                className="chat-tab__close"
                title="Close agent tab"
                aria-label={`Close ${t.title} agent tab`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCloseSubagent?.(t.id);
                }}
              >
                <IconClose size={12} />
              </button>
            </div>
          );
        })}
        {tabs.length === 0 && subagentTabs.length === 0 ? (
          <span className="chat-tab chat-tab--placeholder" aria-hidden>
            New chat
          </span>
        ) : null}
      </div>

      <div className="chat-actions">
        <button
          type="button"
          className="chat-icon-btn"
          onClick={onNew}
          title="New chat"
          aria-label="New chat"
        >
          <IconPlus />
        </button>
        <button
          type="button"
          className="chat-icon-btn"
          onClick={onHistory}
          title="Chat history"
          aria-label="Chat history"
          aria-pressed={historyOpen}
        >
          <IconHistory />
        </button>
        <div className="chat-header-more" ref={moreRef}>
          <button
            type="button"
            className="chat-icon-btn"
            onClick={() => setMoreOpen((v) => !v)}
            title="More"
            aria-label="More"
            aria-expanded={moreOpen}
          >
            <IconMore />
          </button>
          {moreOpen ? (
            <div className="chat-header-more__menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  onSettings();
                }}
              >
                Settings
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  onHistory();
                }}
              >
                Chat history
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="chat-icon-btn"
          onClick={onHistory}
          title="History panel"
          aria-label="History panel"
          aria-pressed={historyOpen}
        >
          <IconSidebar />
        </button>
      </div>
    </header>
  );
}
