import React from 'react';

interface MessageBubbleProps {
  message: any;
  isStreaming?: boolean;
  onEdit?: (id: string, content: string) => void;
  onRetry?: (id: string) => void;
  onDelete?: (id: string) => void;
  onCopy?: (content: string) => void;
}

export function MessageBubble({ message, isStreaming, onEdit, onRetry, onDelete, onCopy }: MessageBubbleProps) {
  const roleIcons: Record<string, string> = {
    user: '👤',
    assistant: '🤖',
    tool: '🔧',
    system: '⚙️'
  };

  const roleColors: Record<string, string> = {
    user: '#1e3a5f',
    assistant: '#1a1a2e',
    tool: '#3d2e00',
    system: '#2a2a2a'
  };

  const timeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div
      className={`message-bubble ${message.role}`}
      style={{
        backgroundColor: roleColors[message.role] || '#1a1a2e',
        borderLeftColor:
          message.role === 'user' ? '#3b82f6' :
          message.role === 'assistant' ? '#6366f1' :
          message.role === 'tool' ? '#f59e0b' :
          message.role === 'system' ? '#6b7280' : undefined,
        borderLeftWidth: '4px',
        borderLeftStyle: 'solid'
      }}
    >
      <div className="message-header">
        <span className="message-avatar">{roleIcons[message.role] || '💬'}</span>
        <span className="message-role">{message.role}</span>
        <span className="message-time">{timeAgo(message.timestamp)}</span>
        {message.status === 'streaming' && <span className="streaming-indicator">⏳</span>}
        {message.status === 'error' && <span className="error-indicator">✗</span>}
        {message.status === 'complete' && <span className="complete-indicator">✓</span>}
      </div>

      <div className="message-content">
        {message.role === 'assistant' || message.role === 'user' ? (
          <div dangerouslySetInnerHTML={{ __html: message.content }} />
        ) : (
          <pre>{message.content}</pre>
        )}
      </div>

      {message.attachments && message.attachments.length > 0 && (
        <div className="message-attachments">
          {message.attachments.map((att: any, i: number) => (
            <span key={i} className="attachment-tag">
              @{att.type}:{att.path}
            </span>
          ))}
        </div>
      )}

      <div className="message-actions">
        {message.role === 'user' && (
          <button onClick={() => onEdit?.(message.id, message.content)} title="Edit">✏️</button>
        )}
        {(message.role === 'assistant' || message.role === 'tool') && message.status !== 'streaming' && (
          <button onClick={() => onRetry?.(message.id)} title="Regenerate">↻</button>
        )}
        <button onClick={() => onCopy?.(message.content)} title="Copy">📋</button>
        {message.role !== 'system' && (
          <button onClick={() => onDelete?.(message.id)} title="Delete">🗑️</button>
        )}
      </div>
    </div>
  );
}