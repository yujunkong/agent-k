import React, { useEffect, useState } from 'react';
import { StreamingMarkdown } from '../StreamingMarkdown';
import { stripFakeToolMarkup } from '../displaySanitize';
import { attachmentDisplayLabel } from '../attachmentFormat';
import { FileEditPreviewView } from './FileEditPreviewView';
import { IconCopy, IconEdit, IconFork } from './Icons';
import { FileTypeIcon } from './FileTypeIcon';
import { Composer, type ComposerChromeProps } from './Composer';
import { visiblePlanProseFromMessage } from '../planPromote';
import type { Attachment, FileEditPreview } from '../types';

interface MessageBubbleProps {
  message: any;
  isStreaming?: boolean;
  /** Agent loop running (any turn) — user bubble shows Stop only */
  isAgentRunning?: boolean;
  /** Last user message in the list — owns the Stop control while running */
  isLastUser?: boolean;
  /** Last assistant message — can show Continue when mission aborted */
  isLastAssistant?: boolean;
  /** Pencil confirm — move turn to end and re-run (optional new attachments) */
  onEdit?: (id: string, content: string, files?: Attachment[]) => void;
  /** Controlled: only one user message edits at a time (owned by ChatApp) */
  isEditing?: boolean;
  onBeginEdit?: (id: string) => void;
  onCancelEdit?: () => void;
  /** Bumps Composer seed when this bubble enters edit mode */
  editSeedNonce?: number;
  /** Shared mode/model chrome with the footer Composer */
  composerChrome?: ComposerChromeProps;
  onFork?: (id: string) => void;
  onCopy?: (content: string) => void;
  /** Stop run and prefill composer with this user message */
  onStopAndPrefill?: (content: string) => void;
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
  /** Resume after mid-mission abort (send continue) */
  onContinueMission?: () => void;
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
  isLastAssistant = false,
  onEdit,
  isEditing = false,
  onBeginEdit,
  onCancelEdit,
  editSeedNonce = 0,
  composerChrome,
  onFork,
  onCopy,
  onStopAndPrefill,
  onOpenFile,
  onAcceptFile,
  onRejectFile,
  onContinueMission
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

  const rawSteps = Array.isArray(message.steps) ? message.steps : [];
  const hasWorkTimeline =
    Array.isArray(message.workItems) && message.workItems.length > 0;
  const hasTimelineChrome = rawSteps.length > 0 || hasWorkTimeline;
  const fileEdits = Array.isArray(message.fileEdits) ? message.fileEdits : [];
  const turnProse = Array.isArray(message.turnProse) ? message.turnProse : [];

  const suppressStreamingBody = isAssistant && streamBody;
  const bodyContent = displayContent;

  const [nowTick, setNowTick] = useState(() => Date.now());

  // Keep "Just now" fresh for a few minutes after completion
  useEffect(() => {
    if (streamBody) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [streamBody, message.id]);

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

  /**
   * Final answer under the timeline. Mid-dig self-talk lives in WorkTimeline Thought.
   * While streaming, body is MessageSteps liveProse — do not duplicate here.
   */
  const sealedProseFallback = turnProse
    .map((p: { content: string }) => String(p.content || '').trim())
    .filter(Boolean)
    .join('\n\n');
  const planBody = visiblePlanProseFromMessage(message);
  const assistantBodyText = suppressStreamingBody
    ? ''
    : bodyContent.trim() ||
      planBody ||
      (!streamBody && !hasTimelineChrome ? sealedProseFallback : '');
  const showAssistantBody = Boolean(isAssistant && assistantBodyText);
  const missionAborted =
    isAssistant &&
    isLastAssistant &&
    !streamBody &&
    /did not finish the task|left the final answer empty|tool result summary \(auto-recovery\)|임무를 끝내지 않은 채 중단|최종 답변 문장을 비운 채|도구 결과 요약입니다 \(자동 복구\)/.test(
      assistantBodyText
    );

  // No Cursor-style turn-phase chrome (understanding|planning|… rail/label).
  // Pre-22c2cf3 / pre-STREAM-002: timeline + body only; optional understanding box stays (STREAM-009).

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
        showUserStop ? 'message-bubble--running' : '',
        isLastAssistant ? 'message-bubble--latest' : ''
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
      {isAssistant && message.status === 'error' ? (
        <div className="message-header message-header--error">
          <span className="error-indicator">✗</span>
          <span className="message-role">Error</span>
        </div>
      ) : null}

      {/* STREAM-009 understanding box removed — dig streams in MessageSteps liveProse */}

      {/* File edits only when WorkTimeline has no work items (legacy). */}
      {!hasWorkTimeline && fileEdits.length > 0 ? (
        <div className="ak-file-edits" style={{ margin: '4px 0 8px' }}>
          {fileEdits.map((fe: FileEditPreview) => (
            <FileEditPreviewView
              key={fe.id}
              file={fe}
              onOpenFile={onOpenFile}
              onAccept={onAcceptFile}
              onReject={onRejectFile}
            />
          ))}
        </div>
      ) : null}

      {!hasTimelineChrome && message.toolStatus ? (
        <div className="message-tool-status">{message.toolStatus}</div>
      ) : null}

      {isUser ? (
        <div
          className={isEditing ? 'user-turn user-turn--editing' : 'user-turn'}
        >
          {!isEditing && attachments.length > 0 ? (
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
          {isEditing && composerChrome ? (
            <Composer
              variant="inline-edit"
              {...composerChrome}
              seedText={rawContent}
              seedNonce={editSeedNonce}
              seedAttachments={attachments}
              sessionId={`edit:${message.id}`}
              onSend={(text, files) => onEdit?.(message.id, text, files)}
              onStop={() => {}}
              onDismiss={onCancelEdit}
              disabled={false}
              isStreaming={false}
            />
          ) : displayContent.trim() ? (
            <div className="user-turn__text">{displayContent}</div>
          ) : null}
          {showFooter && !isEditing ? (
            <div
              className="message-actions message-actions--user"
              role="group"
              aria-label="Message actions"
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
                  title="Stop"
                  aria-label="Stop"
                >
                  <span className="msg-stop-square" aria-hidden />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="msg-action-btn"
                    onClick={() => onBeginEdit?.(message.id)}
                    title="Edit & re-run"
                    aria-label="Edit & re-run"
                  >
                    <IconEdit />
                  </button>
                  <button
                    type="button"
                    className="msg-action-btn"
                    onClick={() => onCopy?.(copyText)}
                    title="Copy"
                    aria-label="Copy"
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
          {/* 2) Answer always after timeline — never swallowed by Worked */}
          <div className="message-content">
            {showAssistantBody ? (
              <StreamingMarkdown
                content={assistantBodyText}
                isStreaming={streamBody}
              />
            ) : null}
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
            <div className="message-actions" role="group" aria-label="Message actions">
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
              {/* ↻ removed — re-run via user pencil (Save & Run) only */}
              {isLastAssistant &&
              !streamBody &&
              missionAborted &&
              onContinueMission ? (
                <button
                  type="button"
                  className="msg-action-btn msg-action-btn--regen msg-action-btn--regen-primary"
                  onClick={() => onContinueMission()}
                  disabled={!!isAgentRunning}
                  title="Continue"
                  aria-label="Continue"
                >
                  <span aria-hidden>↻</span>
                </button>
              ) : null}
              {isAssistant ? (
                <button
                  type="button"
                  className="msg-action-btn"
                  onClick={() => onFork?.(message.id)}
                  title="Fork conversation from here"
                  aria-label="Fork conversation from here"
                >
                  <IconFork />
                </button>
              ) : null}
              <button
                type="button"
                className="msg-action-btn"
                onClick={() => onCopy?.(copyText)}
                title="Copy message"
                aria-label="Copy message"
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
