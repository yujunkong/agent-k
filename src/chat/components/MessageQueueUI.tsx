/**
 * QueueUI — pending messages above the composer (not mixed into chat).
 */
import React from 'react';
import type { QueuedMessage } from '../../loop/MessageQueue';

interface QueueUIProps {
  messages: QueuedMessage[];
  onApplyNow: (messageId: string) => void;
  onCancel: (messageId: string) => void;
  isProcessing: boolean;
}

export function QueueUI({ messages, onApplyNow, onCancel, isProcessing }: QueueUIProps) {
  const activeMessages = messages.filter(
    (m) => m.status === 'queued' || m.status === 'processing'
  );
  if (activeMessages.length === 0 && !isProcessing) return null;

  return (
    <div className="queue-ui" role="status" aria-live="polite">
      <div className="queue-ui__header">
        <span className="queue-ui__title">
          대기열 {activeMessages.length > 0 ? `· ${activeMessages.length}` : ''}
        </span>
        <span className="queue-ui__hint">현재 턴 종료 후 전송</span>
      </div>

      {activeMessages.map((msg) => (
        <div
          key={msg.id}
          className={`queue-item${msg.status === 'processing' ? ' queue-item--processing' : ''}`}
        >
          <span className="queue-badge">
            {msg.status === 'processing' ? '전송 중' : '대기'}
          </span>

          <span className="queue-text" title={msg.text}>
            {msg.text.slice(0, 80)}
            {msg.text.length > 80 ? '…' : ''}
          </span>

          {msg.status === 'queued' ? (
            <span className="queue-actions">
              <button
                type="button"
                onClick={() => onApplyNow(msg.id)}
                className="queue-btn"
                title="지금 적용 (현재 턴 중단 후 병합)"
              >
                지금 적용
              </button>
              <button
                type="button"
                onClick={() => onCancel(msg.id)}
                className="queue-btn queue-btn--cancel"
                title="대기열에서 제거"
              >
                ✕
              </button>
            </span>
          ) : (
            <span className="queue-processing-dot" aria-hidden />
          )}
        </div>
      ))}
    </div>
  );
}
