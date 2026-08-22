/**
 * CHAT-006 — Message queue strip chrome (v2.1 MessageQueueUI).
 */
import type { JSX } from 'react';

export type QueueItem = { id: string; text: string; status: 'queued' | 'processing' };

export type MessageQueueUIProps = {
  items: QueueItem[];
  onCancel?: (id: string) => void;
};

export function MessageQueueUI(props: MessageQueueUIProps): JSX.Element | null {
  const { items, onCancel } = props;
  if (items.length === 0) return null;
  return (
    <div className="queue-ui" data-testid="ui-message-queue">
      <div className="queue-ui__header">
        <span className="queue-ui__title">Queue</span>
        <span className="queue-ui__hint">{items.length}</span>
      </div>
      {items.map((it) => (
        <div key={it.id} className={`queue-item queue-item--${it.status}`}>
          {it.status === 'processing' ? <span className="queue-processing-dot" /> : (
            <span className="queue-badge">queued</span>
          )}
          <span className="queue-text">{it.text}</span>
          {onCancel ? (
            <button type="button" className="queue-btn queue-btn--cancel" onClick={() => onCancel(it.id)}>
              ✕
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
