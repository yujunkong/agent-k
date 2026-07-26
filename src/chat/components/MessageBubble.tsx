import React, { useEffect, useState } from 'react';
import { StreamingMarkdown } from '../StreamingMarkdown';
import { stripFakeToolMarkup } from '../displaySanitize';
import { MessageSteps } from './MessageSteps';
import { FileEditCard } from './FileEditCard';
import { IconCopy, IconEdit, IconRefresh, IconTrash } from './Icons';

interface MessageBubbleProps {
  message: any;
  isStreaming?: boolean;
  onEdit?: (id: string, content: string) => void;
  onRetry?: (id: string) => void;
  onDelete?: (id: string) => void;
  onCopy?: (content: string) => void;
  onOpenFile?: (path: string) => void;
}

/** Fold legacy openingLead into body (no top-of-bubble lead slot). */
function foldLeadIntoBody(lead: string, body: string): string {
  if (!lead) return body;
  if (!body) return lead;
  if (body.startsWith(lead) || body.includes(lead)) return body;
  if (/\s$/.test(lead) || /^\s/.test(body)) return `${lead}${body}`.trim();
  if (/[가-힣a-zA-Z]$/.test(lead) && /^[가-힣a-zA-Z]/.test(body)) {
    return `${lead} ${body}`.trim();
  }
  return `${lead}${body}`.trim();
}

function formatWorkedLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 800) return 'Worked briefly';
  if (ms < 60_000) {
    const sec = ms / 1000;
    return `Worked for ${sec >= 10 ? Math.round(sec) : sec.toFixed(1)}s`;
  }
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s > 0 ? `Worked for ${m}m ${s}s` : `Worked for ${m}m`;
}

function resolveWorkedMs(message: any): number {
  if (typeof message.workedDurationMs === 'number' && message.workedDurationMs >= 0) {
    return message.workedDurationMs;
  }
  const steps = Array.isArray(message.steps) ? message.steps : [];
  const sum = steps.reduce(
    (acc: number, s: { durationMs?: number }) =>
      acc + (typeof s.durationMs === 'number' ? s.durationMs : 0),
    0
  );
  return sum;
}

/**
 * Cursor-quiet message chrome: muted steps + prose, minimal decoration.
 * Order: Thought → mid-turn prose → tools → final answer.
 * When done: collapse all steps under "Worked for …" (expandable).
 */
export function MessageBubble({ message, isStreaming, onEdit, onRetry, onDelete, onCopy, onOpenFile }: MessageBubbleProps) {
  const isAssistant = message.role === 'assistant';
  const isUser = message.role === 'user';

  const rawContent = typeof message.content === 'string' ? message.content : '';
  const rawLead =
    isAssistant && typeof message.openingLead === 'string'
      ? message.openingLead.trim()
      : '';
  const stripped = isAssistant ? stripFakeToolMarkup(rawContent) : rawContent;
  const displayContent = isAssistant ? foldLeadIntoBody(rawLead, stripped) : stripped;

  const hasSteps = Array.isArray(message.steps) && message.steps.length > 0;
  const fileEdits = Array.isArray(message.fileEdits) ? message.fileEdits : [];
  const terminalRuns = Array.isArray(message.terminalRuns) ? message.terminalRuns : [];
  const turnProse = Array.isArray(message.turnProse) ? message.turnProse : [];
  const liveInTimeline = !!(
    isAssistant &&
    isStreaming &&
    hasSteps &&
    displayContent.trim()
  );

  const stepsDone =
    isAssistant &&
    hasSteps &&
    !isStreaming &&
    message.status !== 'streaming';

  const stepsHaveError =
    hasSteps &&
    (message.steps as Array<{ itemStatus?: string }>).some(
      (s) => s.itemStatus === 'error'
    );

  const [workedOpen, setWorkedOpen] = useState(false);
  useEffect(() => {
    // New run / still streaming → show live timeline; collapse when finished
    if (isStreaming || message.status === 'streaming') {
      setWorkedOpen(true);
    } else if (stepsDone) {
      setWorkedOpen(false);
    }
  }, [message.id, isStreaming, message.status, stepsDone]);

  const workedLabel = formatWorkedLabel(resolveWorkedMs(message));

  const stepsBlock = hasSteps ? (
    <MessageSteps
      steps={message.steps}
      fileEdits={fileEdits}
      terminalRuns={terminalRuns}
      turnProse={turnProse}
      liveProse={liveInTimeline ? displayContent : undefined}
      liveProseStreaming={liveInTimeline}
      onOpenFile={onOpenFile}
    />
  ) : null;

  return (
    <div
      className={`message-bubble ${message.role}`}
      style={{
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

      {stepsDone ? (
        <div
          className={[
            'ak-worked',
            workedOpen ? 'ak-worked--open' : '',
            stepsHaveError ? 'ak-worked--error' : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <button
            type="button"
            className="ak-worked__toggle"
            onClick={() => setWorkedOpen((v) => !v)}
            aria-expanded={workedOpen}
          >
            <span className="ak-worked__chevron" aria-hidden>
              {workedOpen ? '▾' : '▸'}
            </span>
            <span className="ak-worked__label">{workedLabel}</span>
          </button>
          {workedOpen ? (
            <div className="ak-worked__body">{stepsBlock}</div>
          ) : null}
        </div>
      ) : hasSteps ? (
        stepsBlock
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
          ) : isStreaming && !hasSteps && !displayContent.trim() ? (
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
            const isLog = att.type === 'log' || att.type === 'snippet';
            const name = isLog
              ? att.label || 'log'
              : String(att.path || '')
                  .replace(/\\/g, '/')
                  .replace(/\/+$/, '')
                  .split('/')
                  .pop();
            const range =
              att.startLine != null
                ? att.endLine != null && att.endLine !== att.startLine
                  ? ` (${att.startLine}-${att.endLine})`
                  : ` (${att.startLine})`
                : '';
            return (
              <span
                key={att.id || i}
                className={`attachment-tag attachment-tag--${att.type || 'file'}`}
                title={isLog ? (att.content || '').slice(0, 200) : att.path}
              >
                <span aria-hidden>
                  {att.type === 'folder' ? '📁' : isLog ? '📋' : '📄'}
                </span>
                {(name || att.path) + range}
              </span>
            );
          })}
        </div>
      )}

      <div className="message-actions" role="group" aria-label="메시지 작업">
        {isUser && (
          <button
            type="button"
            className="msg-action-btn"
            onClick={() => onEdit?.(message.id, message.content)}
            title="메시지 편집"
            aria-label="메시지 편집"
          >
            <IconEdit />
          </button>
        )}
        {(isAssistant || message.role === 'tool') && message.status !== 'streaming' && (
          <button
            type="button"
            className="msg-action-btn"
            onClick={() => onRetry?.(message.id)}
            title="다시 생성"
            aria-label="다시 생성"
          >
            <IconRefresh />
          </button>
        )}
        <button
          type="button"
          className="msg-action-btn"
          onClick={() =>
            onCopy?.(
              [...turnProse.map((p: { content: string }) => p.content), displayContent]
                .filter(Boolean)
                .join('\n\n') || displayContent
            )
          }
          title="메시지 복사"
          aria-label="메시지 복사"
        >
          <IconCopy />
        </button>
        {message.role !== 'system' && (
          <button
            type="button"
            className="msg-action-btn"
            onClick={() => onDelete?.(message.id)}
            title="메시지 삭제"
            aria-label="메시지 삭제"
          >
            <IconTrash />
          </button>
        )}
      </div>
    </div>
  );
}
