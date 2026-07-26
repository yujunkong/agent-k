import React from 'react';
import type { ChatSessionMeta } from '../ChatSessionStore';
import type { Mode } from '../types';

interface HistoryPanelProps {
  sessions: ChatSessionMeta[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}

const MODE_SHORT: Record<Mode, string> = {
  ask: 'Ask',
  agent: 'Agent',
  plan: 'Plan',
  debug: 'Debug'
};

function formatWhen(ts: number): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function HistoryPanel({
  sessions,
  currentId,
  onSelect,
  onDelete,
  onNew,
  onClose
}: HistoryPanelProps) {
  return (
    <div className="history-panel" role="dialog" aria-label="Chat history">
      <div className="history-panel__header">
        <h2>History</h2>
        <div className="history-panel__header-actions">
          <button type="button" className="history-panel__new" onClick={onNew}>
            New
          </button>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
      </div>
      <div className="history-panel__list">
        {sessions.length === 0 ? (
          <p className="history-panel__empty">No saved chats yet.</p>
        ) : (
          sessions.map((s) => {
            const active = s.id === currentId;
            return (
              <div
                key={s.id}
                className={`history-panel__item${active ? ' history-panel__item--active' : ''}`}
              >
                <button
                  type="button"
                  className="history-panel__item-main"
                  onClick={() => onSelect(s.id)}
                  title={s.title}
                >
                  <span className="history-panel__title">{s.title || 'New chat'}</span>
                  <span className="history-panel__meta">
                    <span>{MODE_SHORT[s.mode] || s.mode}</span>
                    <span>·</span>
                    <span>{s.messageCount} msgs</span>
                    <span>·</span>
                    <span>{formatWhen(s.updatedAt)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="history-panel__delete"
                  title="Delete session"
                  aria-label={`Delete ${s.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                >
                  ⌫
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
