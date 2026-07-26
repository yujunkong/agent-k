import React, { useEffect, useState } from 'react';
import { StreamingMarkdown } from '../StreamingMarkdown';
import { stripFakeToolMarkup } from '../displaySanitize';
import { attachmentDisplayLabel } from '../attachmentFormat';
import { MessageSteps } from './MessageSteps';
import { FileEditCard } from './FileEditCard';
import { IconCopy, IconEdit, IconFork } from './Icons';
import { FileTypeIcon } from './FileTypeIcon';

interface MessageBubbleProps {
  message: any;
  isStreaming?: boolean;
  /** Agent loop running (any turn) — user bubble shows Stop only */
  isAgentRunning?: boolean;
  /** Last user message in the list — owns the Stop control while running */
  isLastUser?: boolean;
  onEdit?: (id: string, content: string) => void;
  onFork?: (id: string) => void;
  onCopy?: (content: string) => void;
  /** Stop run and prefill composer with this user message */
  onStopAndPrefill?: (content: string) => void;
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

/** Cursor-style relative completion time */
function formatRelativeTime(ts: number, now: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const diff = Math.max(0, now - ts);
  if (diff < 45_000) return 'Just now';
  if (diff < 90_000) return '1m ago';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 5_400_000) return '1h ago';
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const days = Math.floor(diff / 86_400_000);
  return days === 1 ? '1d ago' : `${days}d ago`;
}

/**
 * Cursor-quiet message chrome: muted steps + prose, minimal decoration.
 * Footer (assistant): Just now · Fork · Copy — right-aligned.
 */
export function MessageBubble({
  message,
  isStreaming,
  isAgentRunning = false,
  isLastUser = false,
  onEdit,
  onFork,
  onCopy,
  onStopAndPrefill,
  onOpenFile
}: MessageBubbleProps) {
  const isAssistant = message.role === 'assistant';
  const isUser = message.role === 'user';
  const streaming = !!isStreaming || message.status === 'streaming';
  const showUserStop = isUser && isAgentRunning && isLastUser;

  const rawContent = typeof message.content === 'string' ? message.content : '';
  const rawLead =
    isAssistant && typeof message.openingLead === 'string'
      ? message.openingLead.trim()
      : '';
  const stripped = isAssistant ? stripFakeToolMarkup(rawContent) : rawContent;
  const displayContent = isAssistant ? foldLeadIntoBody(rawLead, stripped) : stripped;
  /** Only the in-flight assistant bubble streams — never a sealed sibling */
  const streamBody =
    streaming && isAssistant && message.status === 'streaming';

  const hasSteps = Array.isArray(message.steps) && message.steps.length > 0;
  const fileEdits = Array.isArray(message.fileEdits) ? message.fileEdits : [];
  const terminalRuns = Array.isArray(message.terminalRuns) ? message.terminalRuns : [];
  const turnProse = Array.isArray(message.turnProse) ? message.turnProse : [];
  const liveInTimeline = !!(
    isAssistant &&
    streamBody &&
    hasSteps &&
    displayContent.trim()
  );

  const stepsDone =
    isAssistant &&
    hasSteps &&
    !streamBody &&
    message.status !== 'streaming';

  const stepsHaveError =
    hasSteps &&
    (message.steps as Array<{ itemStatus?: string }>).some(
      (s) => s.itemStatus === 'error'
    );

  const [workedOpen, setWorkedOpen] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const sealedTimelineProse = turnProse
    .map((p: { content: string }) => String(p.content || '').trim())
    .filter(Boolean)
    .join('\n\n');
  /** Hide final body while timeline is visible and already shows the same text */
  const hideDuplicateBody = (() => {
    if (!isAssistant || !hasSteps || streamBody) return false;
    const stepsVisible = !stepsDone || workedOpen;
    if (!stepsVisible || !sealedTimelineProse) return false;
    const x = displayContent.replace(/\s+/g, ' ').trim();
    const y = sealedTimelineProse.replace(/\s+/g, ' ').trim();
    if (!x || !y) return false;
    if (x === y) return true;
    if (x.length >= 40 && y.includes(x)) return true;
    if (y.length >= 40 && x.includes(y)) return true;
    const n = Math.min(120, x.length, y.length);
    return n >= 40 && x.slice(0, n) === y.slice(0, n);
  })();

  useEffect(() => {
    if (streamBody || message.status === 'streaming') {
      setWorkedOpen(true);
    } else if (stepsDone) {
      setWorkedOpen(false);
    }
  }, [message.id, streamBody, message.status, stepsDone]);

  // Keep "Just now" fresh for a few minutes after completion
  useEffect(() => {
    if (streamBody) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [streamBody, message.id]);

  const workedLabel = formatWorkedLabel(resolveWorkedMs(message));
  const completedAt =
    typeof message.timestamp === 'number' && message.timestamp > 0
      ? message.timestamp + (resolveWorkedMs(message) || 0)
      : typeof message.timestamp === 'number'
        ? message.timestamp
        : 0;
  const relativeTime = formatRelativeTime(completedAt || message.timestamp || 0, nowTick);

  const copyText =
    [
      ...turnProse.map((p: { content: string }) => p.content),
      displayContent
    ]
      .filter(Boolean)
      .join('\n\n') || displayContent;

  const stepsBlock = hasSteps ? (
    <MessageSteps
      steps={message.steps}
      fileEdits={fileEdits}
      terminalRuns={terminalRuns}
      turnProse={turnProse}
      liveProse={liveInTimeline ? displayContent : undefined}
      liveProseStreaming={liveInTimeline}
      isStreaming={streamBody}
      onOpenFile={onOpenFile}
    />
  ) : null;

  const showFooter =
    message.role !== 'system' &&
    (showUserStop || (!streamBody && (isAssistant || isUser)));

  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : [];

  return (
    <div
      className={[
        'message-bubble',
        message.role,
        showUserStop ? 'message-bubble--running' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Role chrome only for non-user / errors — Cursor hides "User" */}
      {!isAssistant && !isUser ? (
        <div className="message-header">
          <span className="message-role">{message.role}</span>
          {message.status === 'error' ? (
            <span className="error-indicator">✗</span>
          ) : null}
        </div>
      ) : null}
      {isUser && message.status === 'error' ? (
        <div className="message-header message-header--error">
          <span className="error-indicator">✗</span>
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
            <span className="ak-worked__label">{workedLabel}</span>
            <span className="ak-worked__chevron" aria-hidden>
              ▾
            </span>
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
        <div className="message-tool-status">{message.toolStatus}</div>
      ) : null}

      {isUser ? (
        <div className="user-turn">
          {attachments.length > 0 ? (
            <div className="user-turn__chips" aria-label="Attached context">
              {attachments.map((att: any, i: number) => {
                const isLog = att.type === 'log' || att.type === 'snippet';
                const label = attachmentDisplayLabel(att);
                return (
                  <span
                    key={att.id || i}
                    className={`user-chip user-chip--${att.type || 'file'}`}
                    title={isLog ? (att.content || '').slice(0, 200) : att.path}
                  >
                    <span className="user-chip__icon" aria-hidden>
                      {att.type === 'folder' ? (
                        <FileTypeIcon path={label} kind="folder" size={11} />
                      ) : isLog ? (
                        '📋'
                      ) : (
                        <FileTypeIcon
                          path={String(att.path || label)}
                          kind="file"
                          size={11}
                        />
                      )}
                    </span>
                    <span className="user-chip__label">{label}</span>
                  </span>
                );
              })}
            </div>
          ) : null}
          {displayContent.trim() ? (
            <div className="user-turn__text">{displayContent}</div>
          ) : null}
          {showFooter ? (
            <div
              className="message-actions message-actions--user"
              role="group"
              aria-label="메시지 작업"
            >
              {showUserStop ? (
                <button
                  type="button"
                  className="msg-action-btn msg-action-btn--stop"
                  onClick={() =>
                    onStopAndPrefill?.(
                      typeof message.content === 'string' ? message.content : ''
                    )
                  }
                  title="중지"
                  aria-label="중지"
                >
                  <span className="msg-stop-square" aria-hidden />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="msg-action-btn"
                    onClick={() => onEdit?.(message.id, message.content)}
                    title="편집"
                    aria-label="편집"
                  >
                    <IconEdit />
                  </button>
                  <button
                    type="button"
                    className="msg-action-btn"
                    onClick={() => onCopy?.(copyText)}
                    title="복사"
                    aria-label="복사"
                  >
                    <IconCopy />
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="message-content">
            {isAssistant ? (
              displayContent && !liveInTimeline && !hideDuplicateBody ? (
                <StreamingMarkdown
                  content={displayContent}
                  isStreaming={streamBody}
                />
              ) : streamBody && !hasSteps && !displayContent.trim() ? (
                <span className="message-streaming-ellipsis">…</span>
              ) : null
            ) : (
              <pre>{displayContent}</pre>
            )}
          </div>

          {attachments.length > 0 ? (
            <div className="message-attachments">
              {attachments.map((att: any, i: number) => {
                const isLog = att.type === 'log' || att.type === 'snippet';
                const label = attachmentDisplayLabel(att);
                return (
                  <span
                    key={att.id || i}
                    className={`attachment-tag attachment-tag--${att.type || 'file'}`}
                    title={isLog ? (att.content || '').slice(0, 200) : att.path}
                  >
                    <span aria-hidden>
                      {att.type === 'folder' ? '📁' : isLog ? '📋' : '📄'}
                    </span>
                    {label}
                  </span>
                );
              })}
            </div>
          ) : null}

          {showFooter ? (
            <div className="message-actions" role="group" aria-label="메시지 작업">
              {isAssistant && relativeTime ? (
                <span
                  className="msg-action-time"
                  title={new Date(
                    completedAt || message.timestamp
                  ).toLocaleString()}
                >
                  {relativeTime}
                </span>
              ) : null}
              {isAssistant ? (
                <button
                  type="button"
                  className="msg-action-btn"
                  onClick={() => onFork?.(message.id)}
                  title="이 지점에서 대화 포크"
                  aria-label="이 지점에서 대화 포크"
                >
                  <IconFork />
                </button>
              ) : null}
              <button
                type="button"
                className="msg-action-btn"
                onClick={() => onCopy?.(copyText)}
                title="메시지 복사"
                aria-label="메시지 복사"
              >
                <IconCopy />
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
