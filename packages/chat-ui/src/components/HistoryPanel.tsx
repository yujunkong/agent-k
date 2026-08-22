/**
 * CHAT-008 — History panel chrome (v2.1 HistoryPanel).
 */
import type { JSX } from 'react';

export type HistoryItem = { id: string; title: string; updatedAt?: string };

export type HistoryPanelProps = {
  open: boolean;
  items: HistoryItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function HistoryPanel(props: HistoryPanelProps): JSX.Element | null {
  const { open, items, onSelect, onClose } = props;
  if (!open) return null;
  return (
    <aside className="history-panel" data-testid="ui-history-panel" aria-label="Chat history">
      <header className="history-panel__header">
        <h3>History</h3>
        <button type="button" className="history-panel__close" onClick={onClose} aria-label="Close history">
          ✕
        </button>
      </header>
      <ul className="history-panel__list">
        {items.length === 0 ? <li className="history-panel__empty">No conversations yet</li> : null}
        {items.map((it) => (
          <li key={it.id}>
            <button type="button" className="history-panel__item" onClick={() => onSelect(it.id)}>
              <span className="history-panel__title">{it.title}</span>
              {it.updatedAt ? <span className="history-panel__time">{it.updatedAt}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
