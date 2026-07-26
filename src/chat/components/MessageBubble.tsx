import React from 'react';
import { StreamingMarkdown } from '../StreamingMarkdown';
import { stripFakeToolMarkup } from '../displaySanitize';
import { MessageSteps } from './MessageSteps';
import { FileEditCard } from './FileEditCard';
import { isValidOpeningLead, sanitizeOpeningLead, stripDuplicateOpeningLead } from '../openingLead';

interface MessageBubbleProps {
  message: any;
  isStreaming?: boolean;
  onEdit?: (id: string, content: string) => void;
  onRetry?: (id: string) => void;
  onDelete?: (id: string) => void;
  onCopy?: (content: string) => void;
  onOpenFile?: (path: string) => void;
}

/**
 * Cursor-quiet message chrome: muted steps + prose, minimal decoration.
 * Order: opening lead → Thought/tools/edits (timeline) → final answer.
 */
export function MessageBubble({ message, isStreaming, onEdit, onRetry, onDelete, onCopy, onOpenFile }: MessageBubbleProps) {
  const isAssistant = message.role === 'assistant';
  const isUser = message.role === 'user';

  // Assistant: strip fake [todo_write] etc.; never inject raw HTML
  const rawContent = typeof message.content === 'string' ? message.content : '';
  const rawLead =
    isAssistant && typeof message.openingLead === 'string'
      ? message.openingLead.trim()
      : '';
  const stripped = isAssistant ? stripFakeToolMarkup(rawContent) : rawContent;
  // While streaming, keep a short lead in place; repair demotions only when complete
  const repaired = isAssistant
    ? isStreaming && rawLead && (isValidOpeningLead(rawLead) || rawLead.length <= 220)
      ? { lead: rawLead, content: stripDuplicateOpeningLead(stripped, rawLead) }
      : sanitizeOpeningLead(rawLead, stripped)
    : { lead: '', content: stripped };
  const lead = repaired.lead;
  const displayContent =
    isAssistant && lead
      ? stripDuplicateOpeningLead(repaired.content, lead)
      : repaired.content;

  const hasSteps = Array.isArray(message.steps) && message.steps.length > 0;
  const fileEdits = Array.isArray(message.fileEdits) ? message.fileEdits : [];
  const terminalRuns = Array.isArray(message.terminalRuns) ? message.terminalRuns : [];
  const turnProse = Array.isArray(message.turnProse) ? message.turnProse : [];
  // While streaming with a timeline, show body inside the timeline (not below),
  // so the next tool round can seal it as turnProse without a bottom flicker.
  const liveInTimeline = !!(
    isAssistant &&
    isStreaming &&
    hasSteps &&
    displayContent.trim()
  );

  return (
    <div
      className={`message-bubble ${message.role}`}
      style={{
        // Cursor-like: assistant is nearly chrome-free; full width in sidebar
        backgroundColor: isAssistant
          ? 'transparent'
          : isUser
            ? 'var(--vscode-input-background, #3c3c3c)'
            : 'transparent',
        borderLeft: isUser
          ? '2px solid var(--vscode-focusBorder, #007fd4)'
          : 'none',
        paddingLeft: isUser ? 10 : 0,
        marginBottom: 12,
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box'
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

      {/* Cursor: short ack first, then Thought / Exploring — never a full dump */}
      {isAssistant && lead ? (
        <div className="message-opening-lead">
          <StreamingMarkdown content={lead} isStreaming={false} />
        </div>
      ) : null}

      {/* Cursor-style: Thought / Exploring / edit cards / mid-turn prose */}
      {hasSteps ? (
        <MessageSteps
          steps={message.steps}
          fileEdits={fileEdits}
          terminalRuns={terminalRuns}
          turnProse={turnProse}
          liveProse={liveInTimeline ? displayContent : undefined}
          liveProseStreaming={liveInTimeline}
          onOpenFile={onOpenFile}
        />
      ) : fileEdits.length > 0 ? (
        <div className="ak-file-edits" style={{ margin: '4px 0 8px' }}>
          {fileEdits.map((fe: any) => (
            <FileEditCard
              key={fe.id}
              path={fe.path}
              absPath={fe.absPath}
              additions={fe.additions}
              deletions={fe.deletions}
              lines={fe.lines || []}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      ) : null}

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
          displayContent && !liveInTimeline ? (
            <StreamingMarkdown content={displayContent} isStreaming={!!isStreaming} />
          ) : isStreaming && !hasSteps && !lead ? (
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
          gap: 6,
          marginTop: 8,
          opacity: 0.65
        }}
      >
        {isUser && (
          <button type="button" className="msg-action-btn" onClick={() => onEdit?.(message.id, message.content)} title="Edit">
            Edit
          </button>
        )}
        {(isAssistant || message.role === 'tool') && message.status !== 'streaming' && (
          <button type="button" className="msg-action-btn" onClick={() => onRetry?.(message.id)} title="Regenerate">
            Retry
          </button>
        )}
        <button
          type="button"
          className="msg-action-btn"
          onClick={() =>
            onCopy?.(
              [lead, ...turnProse.map((p: { content: string }) => p.content), displayContent]
                .filter(Boolean)
                .join('\n\n') || displayContent
            )
          }
          title="Copy message"
        >
          Copy
        </button>
        {message.role !== 'system' && (
          <button type="button" className="msg-action-btn" onClick={() => onDelete?.(message.id)} title="Delete">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
