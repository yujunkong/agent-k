/**
 * QueueUI - Queued 뱃지, Apply now, Interrupted 타임라인 (C3-T08)
 */
import React from 'react';
import type { QueuedMessage, QueueAction } from '../../loop/MessageQueue';

interface QueueUIProps {
  messages: QueuedMessage[];
  onApplyNow: (messageId: string) => void;
  onCancel: (messageId: string) => void;
  isProcessing: boolean;
}

export function QueueUI({ messages, onApplyNow, onCancel, isProcessing }: QueueUIProps) {
  const activeMessages = messages.filter(m => m.status === 'queued' || m.status === 'processing');
  if (activeMessages.length === 0 && !isProcessing) return null;

  return (
    <div className="queue-ui" style={{
      padding: '4px 8px',
      fontSize: '0.8em',
      background: 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.05))',
      borderRadius: 4,
      margin: '2px 0'
    }}>
      {isProcessing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
          <span>Processing...</span>
        </div>
      )}
      
      {activeMessages.map(msg => (
        <div key={msg.id} className="queue-item" style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '2px 4px',
          opacity: msg.status === 'processing' ? 1 : 0.7
        }}>
          <span className="queue-badge" style={{
            padding: '1px 6px', borderRadius: 3,
            background: msg.action === 'resynthesize' ? 'rgba(59,130,246,0.2)' : 'rgba(107,114,128,0.2)',
            color: msg.action === 'resynthesize' ? '#60a5fa' : '#9ca3af',
            fontSize: '0.75em', fontWeight: 500
          }}>
            {msg.action === 'resynthesize' ? '↻ Resynth' : '📥 Queue'}
          </span>
          
          <span className="queue-text" style={{
            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {msg.text.slice(0, 60)}{msg.text.length > 60 ? '...' : ''}
          </span>

          {msg.status === 'queued' && (
            <>
              <button onClick={() => onApplyNow(msg.id)} className="queue-btn" style={{ fontSize: '0.8em', cursor: 'pointer' }}
                title="Apply now (interrupt current)">
                ▶ Apply
              </button>
              <button onClick={() => onCancel(msg.id)} className="queue-btn" style={{ fontSize: '0.8em', cursor: 'pointer', color: '#f87171' }}
                title="Cancel">
                ✕
              </button>
            </>
          )}
          
          {msg.status === 'processing' && (
            <span style={{ fontSize: '0.75em', opacity: 0.5 }}>⏳</span>
          )}
        </div>
      ))}
    </div>
  );
}
