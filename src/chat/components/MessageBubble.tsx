import React from 'react';
import { StreamingMarkdown } from '../StreamingMarkdown';
import { stripFakeToolMarkup } from '../displaySanitize';
import { MessageSteps } from './MessageSteps';

interface MessageBubbleProps {
  message: any;
  isStreaming?: boolean;
  onEdit?: (id: string, content: string) => void;
  onRetry?: (id: string) => void;
  onDelete?: (id: string) => void;
  onCopy?: (content: string) => void;
}

/**
 * Cursor-quiet message chrome: muted steps + prose, minimal decoration.
 * User bubbles keep a light accent; assistant drops heavy emoji/borders.
 */
export function MessageBubble({ message, isStreaming, onEdit, onRetry, onDelete, onCopy }: MessageBubbleProps) {
  const isAssistant = message.role === 'assistant';
  const isUser = message.role === 'user';

  // Assistant: strip fake [todo_write] etc.; never inject raw HTML
  const rawContent = typeof message.content === 'string' ? message.content : '';
  const displayContent =
    isAssistant ? stripFakeToolMarkup(rawContent) : rawContent;

  const hasSteps = Array.isArray(message.steps) && message.steps.length > 0;

  return (
    <div
      className={`message-bubble ${message.role}`}
      style={{
        // Cursor-like: assistant is nearly chrome-free
        backgroundColor: isAssistant
          ? 'transparent'
          : isUser
            ? 'var(--vscode-input-background, #3c3c3c)'
            : 'transparent',
        borderLeft: isUser
          ? '2px solid var(--vscode-focusBorder, #007fd4)'
          : 'none',
        paddingLeft: isUser ? 10 : 0,
        marginBottom: 12
      }}
    >
      {!isAssistant ? (
        <div
          className="message-header"
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginBottom: 4,
            fontSize: 11,
            opacity: 0.65,
            color: 'var(--vscode-descriptionForeground)'
          }}
        >
          <span className="message-role">{message.role}</span>
          {message.status === 'error' ? (
            <span className="error-indicator">✗</span>
          ) : null}
        </div>
      ) : null}

      {/* Cursor-style: collapsible Thought / tool summaries above answer */}
      {hasSteps ? <MessageSteps steps={message.steps} /> : null}

      {/* Only show toolStatus when no steps (legacy path) */}
      {!hasSteps && message.toolStatus ? (
        <div
          className="message-tool-status"
          style={{
            padding: '2px 0 6px',
            opacity: 0.7,
            fontSize: 12,
            color: 'var(--vscode-descriptionForeground)',
            fontFamily: 'var(--vscode-font-family)'
          }}
        >
          {message.toolStatus}
        </div>
      ) : null}

      <div className="message-content">
        {isAssistant ? (
          displayContent ? (
            <StreamingMarkdown content={displayContent} isStreaming={!!isStreaming} />
          ) : isStreaming && !hasSteps ? (
            <span style={{ opacity: 0.55, color: 'var(--vscode-descriptionForeground)' }}>
              …
            </span>
          ) : null
        ) : isUser ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{displayContent}</div>
        ) : (
          <pre>{displayContent}</pre>
        )}
      </div>

      {message.attachments && message.attachments.length > 0 && (
        <div className="message-attachments">
          {message.attachments.map((att: any, i: number) => {
            const name = String(att.path || '')
              .replace(/\\/g, '/')
              .replace(/\/+$/, '')
              .split('/')
              .pop();
            return (
              <span
                key={i}
                className={`attachment-tag attachment-tag--${att.type || 'file'}`}
                title={att.path}
              >
                <span aria-hidden>{att.type === 'folder' ? '📁' : '📄'}</span>
                {name || att.path}
              </span>
            );
          })}
        </div>
      )}

      <div
        className="message-actions"
        style={{
          display: 'flex',
          gap: 4,
          marginTop: 4,
          opacity: 0.55
        }}
      >
        {isUser && (
          <button type="button" onClick={() => onEdit?.(message.id, message.content)} title="Edit">
            Edit
          </button>
        )}
        {(isAssistant || message.role === 'tool') && message.status !== 'streaming' && (
          <button type="button" onClick={() => onRetry?.(message.id)} title="Regenerate">
            Retry
          </button>
        )}
        <button type="button" onClick={() => onCopy?.(displayContent)} title="Copy">
          Copy
        </button>
        {message.role !== 'system' && (
          <button type="button" onClick={() => onDelete?.(message.id)} title="Delete">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
