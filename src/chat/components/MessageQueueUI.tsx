/**
 * QueueUI — pending messages above the composer (not mixed into chat).
 */
import React from 'react';
import type { QueuedMessage } from '../../loop/MessageQueue';
import { IconClose, IconPlay } from './Icons';

interface QueueUIProps {
  messages: QueuedMessage[];
  onApplyNow: (messageId: string) => void;
  onCancel: (messageId: string) => void;
  isProcessing: boolean;
}

export function QueueUI({ messages, onApplyNow, onCancel }: QueueUIProps) {
  // Only true pending items — never stuck "processing" ghosts
  const activeMessages = messages.filter((m) => m.status === 'queued');
  if (activeMessages.length === 0) return null;

  return (
    <div className="queue-ui" role="status" aria-live="polite">
      <div className="queue-ui__header">
        <span className="queue-ui__title">대기열 · {activeMessages.length}</span>
        <span className="queue-ui__hint">현재 턴 종료 후 전송 · 재생은 해당 항목만 지금 적용</span>
      </div>

      {activeMessages.map((msg) => (
        <div key={msg.id} className="queue-item">
          <span className="queue-badge">대기</span>

          <span className="queue-text" title={msg.text}>
            {msg.text.slice(0, 80)}
            {msg.text.length > 80 ? '…' : ''}
          </span>

          <span className="queue-actions">
            <button
              type="button"
              onClick={() => onApplyNow(msg.id)}
              className="queue-icon-btn"
              title="이 항목만 지금 적용 (나머지는 대기열에 유지)"
              aria-label="지금 적용"
            >
              <IconPlay />
            </button>
            <button
              type="button"
              onClick={() => onCancel(msg.id)}
              className="queue-icon-btn queue-icon-btn--cancel"
              title="대기열에서 제거"
              aria-label="대기열에서 제거"
            >
              <IconClose />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
