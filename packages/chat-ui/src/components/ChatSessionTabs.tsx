/**
 * CHAT-007 / CURSOR-003 — Session tabs chrome (v2.1 ChatSessionTabs).
 */
import type { JSX } from 'react';

export type ChatSession = { id: string; title: string };

export type ChatSessionTabsProps = {
  sessions: ChatSession[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
  onNew?: () => void;
};

export function ChatSessionTabs(props: ChatSessionTabsProps): JSX.Element {
  const { sessions, activeId, onSelect, onClose, onNew } = props;
  return (
    <div className="chat-header-tabs" data-testid="ui-session-tabs" role="tablist">
      {sessions.map((s) => {
        const active = s.id === activeId;
        return (
          <div key={s.id} className={`chat-tab${active ? ' chat-tab--active' : ''}`}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className="chat-tab__btn"
              onClick={() => onSelect(s.id)}
            >
              <span className="chat-tab__title">{s.title}</span>
            </button>
            {onClose ? (
              <button
                type="button"
                className="chat-tab__close"
                aria-label={`Close ${s.title}`}
                onClick={() => onClose(s.id)}
              >
                ×
              </button>
            ) : null}
          </div>
        );
      })}
      {onNew ? (
        <button type="button" className="chat-tab chat-tab--new" data-testid="ui-session-new" onClick={onNew}>
          +
        </button>
      ) : null}
    </div>
  );
}
