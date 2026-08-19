import React, { useEffect, useState } from 'react';
import { StreamingMarkdown } from '../StreamingMarkdown';
import { stripFakeToolMarkup } from '../displaySanitize';
import { attachmentDisplayLabel } from '../attachmentFormat';
import { MessageSteps } from './MessageSteps';
import { FileEditPreviewView } from './FileEditPreviewView';
import { IconCopy, IconEdit, IconFork } from './Icons';
import { FileTypeIcon } from './FileTypeIcon';
import { visiblePlanProseFromMessage } from '../planPromote';
import type { FileEditPreview } from '../types';
import {
  deriveTurnStatus,
  TURN_STATUS_LABEL,
  TURN_STATUS_ORDER,
  type TurnStatus
} from '../turnState';
import { extractUnderstandingLead } from '../understandingLead';

const UNIFIED_TIMELINE_STEP_KINDS = new Set([
  'thinking',
  'planning',
  'searching',
  'reading',
  'editing',
  'running',
  'browsing',
  'task',
  'asking',
  'session'
]);

/** Phase 5 — index of active status on the linear progress rail (excludes error). */
function turnStatusRailIndex(status: TurnStatus | null): number {
  if (!status || status === 'error') return -1;
  const i = TURN_STATUS_ORDER.indexOf(status);
  return i >= 0 ? i : -1;
}

interface MessageBubbleProps {
  message: any;
  isStreaming?: boolean;
  /** Agent loop running (any turn) — user bubble shows Stop only */
  isAgentRunning?: boolean;
  /** Last user message in the list — owns the Stop control while running */
  isLastUser?: boolean;
  /** Last assistant message — can show Continue when mission aborted */
  isLastAssistant?: boolean;
  onEdit?: (id: string, content: string) => void;
  onFork?: (id: string) => void;
  onCopy?: (content: string) => void;
  /** Stop run and prefill composer with this user message */
  onStopAndPrefill?: (content: string) => void;
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
  /** Resume after mid-mission abort (send continue) */
  onContinueMission?: () => void;
  /** Regenerate last assistant turn (same as Composer 다시 실행) */
  onRegenerate?: () => void;
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
  isLastAssistant = false,
  onEdit,
  onFork,
  onCopy,
  onStopAndPrefill,
  onOpenFile,
  onAcceptFile,
  onRejectFile,
  onContinueMission,
  onRegenerate
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
  /** Unified WorkTimeline owns thinking + tools — MessageSteps keeps leftover chrome only. */
  const hideUnifiedSteps = hasWorkTimeline || rawSteps.some(
    (s: { kind?: string }) => UNIFIED_TIMELINE_STEP_KINDS.has(String(s.kind || ''))
  );
  const bubbleSteps = hideUnifiedSteps
    ? rawSteps.filter(
        (s: { kind?: string }) => !UNIFIED_TIMELINE_STEP_KINDS.has(String(s.kind || ''))
      )
    : rawSteps;
  const hasSteps = bubbleSteps.length > 0;
  const hasTimelineChrome = rawSteps.length > 0 || hasWorkTimeline;
  const fileEdits = Array.isArray(message.fileEdits) ? message.fileEdits : [];
  const terminalRuns = Array.isArray(message.terminalRuns) ? message.terminalRuns : [];
  const turnProse = Array.isArray(message.turnProse) ? message.turnProse : [];

  /**
   * Phase 3 — live ack sentence from message.content (openingLead is never
   * populated). Only before any tool step; body then shows `rest` so the
   * lead is not duplicated, and the box disappears the instant hasSteps.
   */
  const understanding =
    isAssistant && streamBody && !hasTimelineChrome
      ? extractUnderstandingLead(stripped)
      : { lead: '', rest: '' };
  const showUnderstandingBox = Boolean(understanding.lead);
  const bodyContent = showUnderstandingBox ? understanding.rest : displayContent;

  const stepsDone =
    isAssistant &&
    hasSteps &&
    !streamBody &&
    message.status !== 'streaming';

  const stepsHaveError =
    hasSteps &&
    (bubbleSteps as Array<{ itemStatus?: string }>).some(
      (s) => s.itemStatus === 'error'
    );

  const [workedOpen, setWorkedOpen] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

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

  /**
   * Timeline only — final/streaming answer always renders BELOW in the bubble
   * so Worked collapse never swallows the reply.
   */
  const stepsBlock = hasSteps ? (
    <MessageSteps
      steps={bubbleSteps}
      fileEdits={hasSteps ? fileEdits : []}
      terminalRuns={hasSteps ? terminalRuns : []}
      turnProse={turnProse}
      isStreaming={streamBody}
      onOpenFile={onOpenFile}
      onAcceptFile={onAcceptFile}
      onRejectFile={onRejectFile}
    />
  ) : null;

  /**
   * Final answer under the timeline. Mid-dig self-talk is in Thought;
   * opening leads render inside MessageSteps — do not dump turnProse here
   * when a tool timeline exists (that hid real replies earlier).
   */
  const sealedProseFallback = turnProse
    .map((p: { content: string }) => String(p.content || '').trim())
    .filter(Boolean)
    .join('\n\n');
  const planBody = visiblePlanProseFromMessage(message);
  const assistantBodyText =
    bodyContent.trim() ||
    planBody ||
    (stepsDone && !streamBody && !hasSteps ? sealedProseFallback : '');
  const showAssistantBody = Boolean(isAssistant && assistantBodyText);
  const missionAborted =
    isAssistant &&
    isLastAssistant &&
    !streamBody &&
    /did not finish the task|left the final answer empty|tool result summary \(auto-recovery\)|임무를 끝내지 않은 채 중단|최종 답변 문장을 비운 채|도구 결과 요약입니다 \(자동 복구\)/.test(
      assistantBodyText
    );

  /**
   * Phase 5 — Cursor-style live phase chrome.
   * Progress rail + current label while streaming; "Worked for Xs" replaces
   * this once the turn settles (badge would be redundant chrome).
   */
  const turnStatus: TurnStatus | null =
    isAssistant && streamBody ? deriveTurnStatus(message, true) : null;
  const railIndex = turnStatusRailIndex(turnStatus);
  const showPhaseChrome = Boolean(turnStatus);

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
        isLastAssistant ? 'message-bubble--latest' : '',
        showPhaseChrome ? 'message-bubble--live-phase' : ''
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

      {/*
        Phase 5 unified live header:
        - linear progress rail (TURN_STATUS_ORDER)
        - current phase label
        - understanding box as the first card under the rail
        MessageSteps grouping (Thought / Exploring / actions) continues below.
      */}
      {showPhaseChrome && turnStatus ? (
        <div
          className="ak-phase-chrome"
          data-status={turnStatus}
          aria-live="polite"
        >
          <div className="ak-turn-rail" role="list" aria-label="Turn progress">
            {TURN_STATUS_ORDER.map((s, i) => {
              const done = railIndex >= 0 && i < railIndex;
              const active = railIndex === i;
              return (
                <span
                  key={s}
                  role="listitem"
                  className={[
                    'ak-turn-rail__seg',
                    done ? 'ak-turn-rail__seg--done' : '',
                    active ? 'ak-turn-rail__seg--active' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={TURN_STATUS_LABEL[s]}
                  data-status={s}
                />
              );
            })}
          </div>
          <div className="ak-turn-status" data-status={turnStatus}>
            <span className="ak-turn-status__dot" aria-hidden>
              ●
            </span>
            <span className="ak-turn-status__label">
              {TURN_STATUS_LABEL[turnStatus]}
            </span>
          </div>
          {showUnderstandingBox ? (
            <div className="ak-understanding-box">
              <div className="ak-understanding-box__label">Understanding</div>
              <div className="ak-understanding-box__text">
                {understanding.lead}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 1) Timeline / Worked — tools & thoughts only (MessageSteps grouping) */}
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
                    onClick={() => onEdit?.(message.id, message.content)}
                    title="Edit"
                    aria-label="Edit"
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
            ) : streamBody && !hasTimelineChrome && !showUnderstandingBox ? (
              <span className="message-streaming-ellipsis">…</span>
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
              {isLastAssistant &&
              !streamBody &&
              (onRegenerate || onContinueMission) ? (
                <button
                  type="button"
                  className={
                    missionAborted
                      ? 'msg-action-btn msg-action-btn--regen msg-action-btn--regen-primary'
                      : 'msg-action-btn msg-action-btn--regen'
                  }
                  onClick={() => {
                    if (missionAborted && onContinueMission) {
                      onContinueMission();
                      return;
                    }
                    onRegenerate?.();
                  }}
                  disabled={!!isAgentRunning}
                  title="Regenerate"
                  aria-label="Regenerate"
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
