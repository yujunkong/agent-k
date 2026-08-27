/**
 * STREAM-001 — Assistant stream session (chat-ui / 표시).
 *
 * Shared onDelta / onComplete / onError for send + regenerate so call sites
 * cannot drift. Routes all transcript mutations to **ownerSessionId** via
 * `updateSessionMessages` (CHAT-007 tab isolation): background tabs keep
 * receiving tokens; complete/error always settle the owner bubble.
 *
 * Runtime LLM/HTTP streaming lives elsewhere (`useChatStream` + core REL).
 * This module is the webview session adapter only — do not move into core.
 */
import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessage, Mode, StreamDelta } from './types';
import type { DebugStage } from '../debug/DebugModeController';
import type { PendingQuestion } from '../tools/session/AskQuestionTool';
import { normalizeMcqQuestion } from './normalizeAskQuestion';
import { sealBodyBeforeTools, resolveSealTurn, summarizeMidReplySeal } from './sealTurnProse';
import { stripFakeToolMarkup } from './displaySanitize';
import {
  extractPlanMarkdownFromMessage,
  findLatestPlanMarkdown,
  looksLikePlanDocument,
  looksLikePlanDraft
} from './planPromote';
import {
  settleWorkEvents,
  applyWorkEvent,
  beginWorkEvent,
  sealStaleThoughtsBeforeTools,
  isSubagentHeaderEvent,
  isTerminalWorkStatus,
  type ConversationWorkEvent
} from './conversation/conversationWorkEvent';
import { linkPreviewToWorkEvents } from './conversation/workEventDetails';
import { debugError, debugLog } from './debugLog';
import type { SessionStepStartMap, SessionTurnMap } from './sendEpoch';

export const STREAM_TOOL_KINDS = new Set([
  'searching',
  'reading',
  'editing',
  'running',
  'browsing',
  'asking'
]);

/**
 * Mark running Thought rows done so the next segment can start mid-timeline.
 * @param exceptId — keep this Thought running (same tab segment still open).
 *   Per-stream `thoughtSeg` already isolates tabs; this only protects the
 *   active segment inside one owner session from premature seal.
 */
function sealRunningThoughtSteps(
  msg: ChatMessage,
  now = Date.now(),
  exceptId?: string
): ChatMessage {
  // Comment: stamp durationMs on seal — UI shows "Thought 3s", not "briefly"
  const workById = new Map((msg.workItems || []).map((e) => [e.id, e]));
  const steps = (msg.steps || []).map((s) => {
    if (!(s.kind === 'thinking' && s.itemStatus === 'running')) return s;
    if (exceptId && s.id === exceptId) return s;
    const startedAt = workById.get(s.id)?.startedAt;
    // Comment: always recompute from startedAt — never keep a premature briefly stamp
    const durationMs =
      startedAt != null ? Math.max(0, now - startedAt) : s.durationMs;
    return {
      ...s,
      itemStatus: 'done' as const,
      ...(durationMs != null ? { durationMs } : {})
    };
  });
  const workItems = sealStaleThoughtsBeforeTools(
    (msg.workItems || []).map((e) => {
      if (
        !(
          e.type === 'thinking' &&
          (e.status === 'running' || e.status === 'pending')
        )
      ) {
        return e;
      }
      if (exceptId && e.id === exceptId) return e;
      const completedAt = e.completedAt ?? now;
      return {
        ...e,
        status: 'complete' as const,
        completedAt
      };
    }),
    now
  );
  return { ...msg, steps, workItems };
}

function thoughtIdForSeg(turn: number, seg: number): string {
  return seg <= 0 ? `tl_thinking_${turn}` : `tl_thinking_${turn}_s${seg}`;
}

/** Ask / Ran / Edit / Subagent — Thought above these must not keep growing. */
function isThoughtOrderBlocker(s: {
  kind?: string;
  toolName?: string;
}): boolean {
  const kind = String(s.kind || '');
  const n = String(s.toolName || '').toLowerCase();
  if (kind === 'asking' || n === 'ask_question') return true;
  if (
    kind === 'subagent' ||
    kind === 'task' ||
    n === 'task_run' ||
    n === 'task'
  ) {
    return true;
  }
  return STREAM_TOOL_KINDS.has(kind);
}

/** True when `thoughtId` already has Ask/Ran/Edit below it in arrival order. */
function thoughtHasBlockersAfter(
  steps: ChatMessage['steps'] | undefined,
  thoughtId: string
): boolean {
  if (!steps?.length || !thoughtId) return false;
  const idx = steps.findIndex(
    (s) => s.id === thoughtId && s.kind === 'thinking'
  );
  if (idx < 0) return false;
  return steps.slice(idx + 1).some(isThoughtOrderBlocker);
}

/** Highest `_sN` (or 0 for opening) among tl_thinking_<turn> ids. */
function maxThoughtSegForTurn(
  steps: ChatMessage['steps'] | undefined,
  turn: number
): number {
  let max = -1;
  const re = new RegExp(`^tl_thinking_${turn}(?:_s(\\d+))?$`);
  for (const s of steps || []) {
    if (s.kind !== 'thinking') continue;
    const m = String(s.id || '').match(re);
    if (!m) continue;
    max = Math.max(max, m[1] ? Number(m[1]) : 0);
  }
  return max;
}

function normalizeProse(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^---+\s*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function withWorkEvent(
  msg: ChatMessage,
  event: ConversationWorkEvent | undefined
): ChatMessage {
  if (!event) return msg;
  return { ...msg, workItems: applyWorkEvent(msg.workItems || [], event) };
}

function looksLikeDuplicateProse(aRaw: string, bRaw: string): boolean {
  const a = normalizeProse(aRaw);
  const b = normalizeProse(bRaw);
  if (!a || !b) return false;
  if (a === b) return true;
  // Comment: only drop when sealed mid-reply is a full prefix of the final body
  // (same buffer grew). Do NOT use shared-head matching — that wiped distinct
  // mid-replies that merely opened with the same ~40 chars.
  if (a.length >= 40 && b.startsWith(a)) return true;
  if (b.length >= 40 && a.startsWith(b)) return true;
  return false;
}

/** Drop sealed turnProse that duplicates the final body. */
export function dedupeAssistantBody(msg: ChatMessage): ChatMessage {
  const body = (msg.content || '').trim();
  const prose = msg.turnProse || [];
  if (!body || prose.length === 0) return msg;

  const kept = prose.filter(
    (p) => !looksLikeDuplicateProse(String(p.content || ''), body)
  );
  if (kept.length === prose.length) {
    const sealed = prose
      .map((p) => String(p.content || '').trim())
      .filter(Boolean)
      .join('\n\n');
    if (looksLikeDuplicateProse(body, sealed)) {
      debugLog('timeline-order', 'mid-reply.dedupe-wipe', {
        reason: 'turnProse duplicates final body',
        proseCount: prose.length,
        bodyLen: body.length,
        prosePreview: sealed.slice(0, 80)
      });
      return { ...msg, turnProse: [] };
    }
    return msg;
  }
  if (kept.length < prose.length) {
    debugLog('timeline-order', 'mid-reply.dedupe-trim', {
      before: prose.length,
      after: kept.length,
      dropped: prose.length - kept.length
    });
  }
  return { ...msg, turnProse: kept };
}

export interface AssistantStreamCtx {
  isStale?: () => boolean;
  mode: Mode;
  /** Per-tab step clocks — bag(ownerId) only. */
  stepStartRef: { current: SessionStepStartMap };
  /** Per-tab agent-loop turn — get/bump(ownerId). */
  turnNumberRef: { current: SessionTurnMap };
  sessionIdRef: { current: string };
  loopSessionIdRef: { current: string | null };
  parkedAwaitingRef: {
    current: { sessionId: string; questions: PendingQuestion[] } | null;
  };
  messagesRef: { current: ChatMessage[] };
  planStageRef: { current: string };
  pendingQuestionsRef: { current: PendingQuestion[] };
  promotePlanOnCompleteRef: { current: boolean };
  planController: {
    enterQuestionsStage: () => void;
    addQuestion: (q: { id: string; question: string }) => void;
    getQuestions: () => Array<{ id: string }>;
  };
  debugController: {
    getStage: () => string;
    getHypotheses: () => Array<{ title: string }>;
    addHypothesis: (title: string, description: string, files: string[]) => void;
    syncStageFromHost: (stage: DebugStage) => void;
  };
  planSessionHasPlan: () => boolean;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  updateSessionMessages: (
    sessionId: string,
    updater: (prev: ChatMessage[]) => ChatMessage[]
  ) => void;
  getSessionMessages: (sessionId: string) => ChatMessage[];
  ownerSessionId?: string;
  setPendingQuestions: Dispatch<SetStateAction<PendingQuestion[]>>;
  setShowClarifying: (v: boolean) => void;
  setAwaitingUser: (v: boolean) => void;
  setDebugTick: Dispatch<SetStateAction<number>>;
  setError: (v: string | null) => void;
  promotePlanToReview: (md: string) => void;
}

export function createAssistantStreamSession(ctx: AssistantStreamCtx): {
  onDelta: (delta: StreamDelta) => void;
  onComplete: () => void;
  onError: (err: string) => void;
} {
  let planPinned = false;
  /**
   * Cursor-style Thought segments — scoped to THIS stream session instance
   * (one send / one owner tab). Never share across parallel tab streams.
   */
  let thoughtSeg = 0;
  let thoughtOpen = false;
  let thoughtBlocked = false;

  /** Freeze owner at create — tab switch must not retarget this stream. */
  const ownerIdFrozen = String(
    ctx.ownerSessionId ||
      ctx.loopSessionIdRef.current ||
      ctx.sessionIdRef.current ||
      ''
  );

  const getOwnerSessionId = () => ownerIdFrozen || ctx.sessionIdRef.current;

  const stepStarts = (): Record<string, number> =>
    ctx.stepStartRef.current.bag(getOwnerSessionId());

  const streamTurn = (): number =>
    Math.max(1, ctx.turnNumberRef.current.get(getOwnerSessionId()) || 1);

  const applyOwnerMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    ctx.updateSessionMessages(getOwnerSessionId(), updater);
  };

  // Comment: CTX-004 — keep Summarizing chat context... visible briefly (compact is sync)
  let summarizingClearTimer: ReturnType<typeof setTimeout> | undefined;

  debugLog('timeline-order', 'stream.session.create', {
    ownerId: getOwnerSessionId(),
    turn: streamTurn(),
    activeTab: ctx.sessionIdRef.current,
    thoughtSeg: 0
  });

  /**
   * Soft-pause Thought before tools: seal the live row, but do NOT keep appending
   * into the same opening accordion. Next reasoning rotates to a mid segment
   * (nests under Exploring) — Cursor-style dig → read → dig.
   */
  const pauseThoughtSegment = (reason: string) => {
    debugLog('timeline-order', 'thought.seal', {
      ownerId: getOwnerSessionId(),
      reason,
      seg: thoughtSeg,
      wasOpen: thoughtOpen,
      blocked: thoughtBlocked,
      rotateOnReopen: true
    });
    thoughtOpen = false;
    thoughtBlocked = true;
  };

  const sealLeadFromMessage = (
    msg: ChatMessage,
    explicitTurn?: number | null,
    reason = 'seal'
  ): ChatMessage => {
    const turn = resolveSealTurn(msg, explicitTurn);
    const beforeLen = String(msg.content || '').trim().length;
    const beforeLead = String(msg.openingLead || '').trim().length;
    const beforeProse = msg.turnProse?.length ?? 0;
    // Comment: content → turnProse always (structural; no NLP / forceVisible)
    const sealed = sealBodyBeforeTools(msg, turn);
    const snap = summarizeMidReplySeal(msg, sealed);
    // Always log clearContent / tool seals so missing mid-reply is diagnosable.
    debugLog('timeline-order', 'mid-reply.seal', {
      ownerId: getOwnerSessionId(),
      reason,
      turn,
      dest: snap.dest,
      contentLenBefore: snap.contentLenBefore || beforeLen,
      contentLenAfter: snap.contentLenAfter,
      leadLenBefore: snap.leadLenBefore || beforeLead,
      turnProseBefore: snap.turnProseBefore || beforeProse,
      turnProseAfter: snap.turnProseAfter,
      sealedPreview: snap.sealedPreview,
      lastProsePreview: snap.lastProsePreview,
      thoughtDetailLen: snap.thoughtDetailLen,
      hadSource: beforeLen > 0 || beforeLead > 0
    });
    if (ctx.mode === 'plan' && !planPinned) {
      const md = extractPlanMarkdownFromMessage(sealed);
      if (looksLikePlanDocument(md) || looksLikePlanDraft(md)) {
        planPinned = true;
        ctx.promotePlanToReview(md);
      }
    }
    return sealed;
  };

  const lastStreaming = (
    prev: ChatMessage[]
  ): { lastIdx: number; msg: ChatMessage } | null => {
    const lastIdx = prev.length - 1;
    if (
      lastIdx < 0 ||
      prev[lastIdx].role !== 'assistant' ||
      prev[lastIdx].status !== 'streaming'
    ) {
      return null;
    }
    return { lastIdx, msg: prev[lastIdx] };
  };

  /** Last assistant bubble — for terminal subagent settle after parent stream ended. */
  const lastAssistant = (
    prev: ChatMessage[]
  ): { lastIdx: number; msg: ChatMessage } | null => {
    for (let i = prev.length - 1; i >= 0; i--) {
      if (prev[i].role === 'assistant') {
        return { lastIdx: i, msg: prev[i] };
      }
    }
    return null;
  };

  const onDelta = (delta: StreamDelta) => {
    // Superseded turn only — tab switch must still apply tokens to the owner session.
    if (ctx.isStale?.()) return;

    if (delta.compaction) {
      // Comment: CTX-004 — flash Summarizing chat context... (wire compact is sync; hold ~1.2s)
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev) || lastAssistant(prev);
        if (!hit) return prev;
        const copy = [...prev];
        copy[hit.lastIdx] = {
          ...hit.msg,
          metadata: {
            ...hit.msg.metadata,
            contextSummarizing: true
          }
        };
        return copy;
      });
      if (summarizingClearTimer) clearTimeout(summarizingClearTimer);
      summarizingClearTimer = setTimeout(() => {
        summarizingClearTimer = undefined;
        applyOwnerMessages((prev) => {
          const hit = lastStreaming(prev) || lastAssistant(prev);
          if (!hit?.msg.metadata?.contextSummarizing) return prev;
          const copy = [...prev];
          copy[hit.lastIdx] = {
            ...hit.msg,
            metadata: { ...hit.msg.metadata, contextSummarizing: false }
          };
          return copy;
        });
      }, 1200);
      return;
    }

    if (delta.askQuestion?.id) {
      const q = delta.askQuestion;
      const rawQuestion = String(q.question || '').trim();
      // Comment: no fabricated prompt — empty ask_question must not paint a card
      if (!rawQuestion) {
        return;
      }
      const normalized = normalizeMcqQuestion(rawQuestion, q.options);
      if (ctx.mode === 'plan') {
        ctx.planController.enterQuestionsStage();
      }
      if (
        ctx.mode === 'debug' &&
        ctx.debugController.getStage() === 'hypothesis' &&
        normalized.options.length >= 2
      ) {
        for (const opt of normalized.options) {
          const title = String(opt).trim();
          if (!title || /^기타$/i.test(title) || /^other$/i.test(title)) continue;
          if (!ctx.debugController.getHypotheses().some((h) => h.title === title)) {
            ctx.debugController.addHypothesis(title, title, []);
          }
        }
        ctx.setDebugTick((t) => t + 1);
      }
      const ownerId = getOwnerSessionId();
      const qEntry: PendingQuestion = {
        id: q.id,
        question: normalized.question,
        options: normalized.options,
        required: q.required !== false,
        allowMultiple: Boolean(q.allowMultiple),
        answered: false
      };
      // Comment: ask_question bypasses timeline.tool — seal Thought like Read/Ran so
      // Thought accordion is not glued open above AskQuestionCard
      pauseThoughtSegment('askQuestion');
      // Comment: stamp / upsert AskQuestionCard — never stomp a different running ask
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) return prev;
        let msg = sealRunningThoughtSteps(
          sealLeadFromMessage(hit.msg, undefined, 'askQuestion')
        );
        const steps = [...(msg.steps || [])];
        const byQid = steps.findIndex((s) => s.askQid === q.id);
        // Comment: only adopt a tool.start shell that has no qid yet (batch Q2+ must append)
        const byEmptyShell = steps.findIndex(
          (s) =>
            (s.kind === 'asking' || s.toolName === 'ask_question') &&
            s.itemStatus === 'running' &&
            !s.askQid
        );
        const idx = byQid >= 0 ? byQid : byEmptyShell >= 0 ? byEmptyShell : -1;
        const askId = idx >= 0 ? steps[idx].id : `tl_ask_${q.id}`;
        const nextStep = {
          id: askId,
          kind: 'asking' as const,
          label: 'ask_question',
          toolName: 'ask_question',
          detail: normalized.question,
          options: normalized.options,
          allowMultiple: Boolean(q.allowMultiple),
          askQid: q.id,
          itemStatus: 'running' as const,
          turn: idx >= 0 ? steps[idx].turn : streamTurn(),
        };
        if (idx >= 0) steps[idx] = { ...steps[idx], ...nextStep };
        else steps.push(nextStep);
        // Comment: workItems ask row = Thought-cut barrier (same as Read/Edit in sealStale)
        const now = Date.now();
        const askEvent: ConversationWorkEvent = {
          id: askId,
          type: 'ask',
          status: 'running',
          label: 'Ask',
          toolName: 'ask_question',
          detail: normalized.question,
          startedAt: now
        };
        msg = withWorkEvent({ ...msg, steps }, askEvent);
        msg = {
          ...msg,
          workItems: sealStaleThoughtsBeforeTools(msg.workItems || [], now)
        };
        const copy = [...prev];
        copy[hit.lastIdx] = msg;
        return copy;
      });
      if (ownerId && ownerId !== ctx.sessionIdRef.current) {
        ctx.parkedAwaitingRef.current = {
          sessionId: ownerId,
          questions: [qEntry]
        };
        ctx.planController.addQuestion({ id: q.id, question: normalized.question });
        return;
      }
      ctx.setPendingQuestions((prev) => {
        if (prev.find((p) => p.id === q.id)) return prev;
        const normQ = normalized.question.replace(/\s+/g, ' ').trim().toLowerCase();
        if (
          prev.some(
            (p) =>
              String(p.question || '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase() === normQ
          )
        ) {
          return prev;
        }
        ctx.planController.addQuestion({ id: q.id, question: normalized.question });
        return [...prev, qEntry];
      });
      ctx.setShowClarifying(true);
      ctx.setAwaitingUser(true);
      return;
    }

    if (delta.debugStage && ctx.mode === 'debug') {
      ctx.debugController.syncStageFromHost(delta.debugStage as DebugStage);
      ctx.setDebugTick((t) => t + 1);
      return;
    }

    // Comment: tool.start packs clearContent + timeline(detail) together.
    // Early-return here used to skip the timeline upsert → bare "Read"/"Grepped".
    if (delta.clearContent && !delta.timeline) {
      // Comment: never hard-rotate on clear alone — same Thought id resumes after tools
      pauseThoughtSegment('clearContent');
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) return prev;
        const newMsgs = [...prev];
        newMsgs[hit.lastIdx] = withWorkEvent(
          sealRunningThoughtSteps(
            sealLeadFromMessage(hit.msg, delta.sealTurn, 'clearContent')
          ),
          delta.workEvent
        );
        return newMsgs;
      });
      return;
    }

    if (delta.fileEdit) {
      const fe = {
        ...delta.fileEdit,
        id:
          delta.fileEdit.id ||
          `fe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        turn: delta.fileEdit.turn || streamTurn()
      };
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) {
          // Comment: diagnose drop — host emitted but no streaming assistant to attach
          debugLog('card.pipe', 'state.fileEdit DROP no-streaming', {
            ownerId: getOwnerSessionId(),
            path: fe.path,
            toolId: fe.toolId
          });
          return prev;
        }
        const msg = hit.msg;
        const key = (fe.absPath || fe.path || '').replace(/\\/g, '/');
        const prevEdits = msg.fileEdits || [];
        const idx = key
          ? prevEdits.findIndex((x) => {
              const xk = (x.absPath || x.path || '').replace(/\\/g, '/');
              return xk === key && (x.turn || 0) === (fe.turn || 0);
            })
          : -1;
        const fileEdits =
          idx >= 0
            ? prevEdits.map((x, i) => (i === idx ? { ...fe, id: x.id || fe.id } : x))
            : [...prevEdits, fe];
        const workItems = linkPreviewToWorkEvents(msg.workItems || [], {
          kind: 'fileEdit',
          fileEdit: fe
        });
        // Comment: state attach — if missing after host emit, DROP or preview parse failed
        debugLog('card.pipe', 'state.fileEdit', {
          ownerId: getOwnerSessionId(),
          path: fe.path,
          add: fe.additions,
          del: fe.deletions,
          lines: fe.lines?.length ?? 0,
          upsert: idx >= 0 ? 'patch' : 'append',
          total: fileEdits.length,
          toolId: fe.toolId
        });
        const copy = [...prev];
        copy[hit.lastIdx] = { ...msg, fileEdits, workItems };
        return copy;
      });
      return;
    }

    if (delta.terminalRun) {
      const ev = delta.terminalRun;
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) {
          if (ev.phase !== 'chunk') {
            debugLog('card.pipe', 'state.terminal DROP no-streaming', {
              ownerId: getOwnerSessionId(),
              phase: ev.phase,
              id: ev.id
            });
          }
          return prev;
        }
        const msg = hit.msg;
        const runs = [...(msg.terminalRuns || [])];
        const idx = runs.findIndex((r) => r.id === ev.id);
        const turn = ev.turn || streamTurn();
        if (ev.phase === 'start' || idx < 0) {
          const next = {
            id: ev.id,
            command: ev.command || '',
            description: ev.description,
            cwd: ev.cwd,
            status: (ev.status || 'running') as 'running' | 'done' | 'error',
            stdout: '',
            stderr: '',
            turn,
            toolId: ev.toolId
          };
          if (idx >= 0) runs[idx] = { ...runs[idx], ...next };
          else runs.push(next);
        } else if (ev.phase === 'chunk') {
          const cur = runs[idx];
          if (ev.stream === 'stderr') {
            runs[idx] = { ...cur, stderr: (cur.stderr || '') + (ev.chunk || '') };
          } else {
            runs[idx] = { ...cur, stdout: (cur.stdout || '') + (ev.chunk || '') };
          }
        } else if (ev.phase === 'end') {
          const cur = runs[idx];
          let stdout = cur.stdout || '';
          let stderr = cur.stderr || '';
          if (!stdout && !stderr && ev.chunk) stdout = ev.chunk;
          runs[idx] = {
            ...cur,
            command: ev.command || cur.command,
            cwd: ev.cwd || cur.cwd,
            status: ev.status || (ev.error ? 'error' : 'done'),
            exitCode: ev.exitCode,
            error: ev.error,
            durationMs: ev.durationMs,
            stdout,
            stderr,
            turn: ev.turn || cur.turn,
            toolId: ev.toolId || cur.toolId
          };
        }
        if (ev.phase !== 'chunk') {
          debugLog('card.pipe', 'state.terminal', {
            ownerId: getOwnerSessionId(),
            phase: ev.phase,
            id: ev.id,
            status: runs[idx]?.status ?? runs[runs.length - 1]?.status,
            total: runs.length,
            toolId: ev.toolId
          });
        }
        const linked = runs[idx] || runs[runs.length - 1];
        const workItems = linked
          ? linkPreviewToWorkEvents(msg.workItems || [], {
              kind: 'terminal',
              terminalRun: linked
            })
          : msg.workItems;
        const copy = [...prev];
        copy[hit.lastIdx] = { ...msg, terminalRuns: runs, workItems };
        return copy;
      });
      return;
    }

    if (delta.timeline) {
      const tl = delta.timeline;
      if (tl.kind === 'done') {
        if (delta.workEvent) {
          applyOwnerMessages((prev) => {
            const hit = lastStreaming(prev);
            if (!hit) return prev;
            const copy = [...prev];
            copy[hit.lastIdx] = withWorkEvent(hit.msg, delta.workEvent);
            return copy;
          });
        }
        return;
      }
      const now = Date.now();
      const starts = stepStarts();
      // Comment: id may rotate if host reuses a sealed Thought id (child SUB-010)
      let id =
        tl.id ||
        `step_${tl.kind}_${tl.turn}_${tl.toolName || 'x'}_${Date.now()}`;
      let remappedThinkingId = false;
      if (
        tl.kind === 'thinking' &&
        (tl.itemStatus === 'running' || tl.itemStatus == null)
      ) {
        const ownerId = getOwnerSessionId();
        const ownerMsgs =
          ownerId && typeof ctx.getSessionMessages === 'function'
            ? ctx.getSessionMessages(ownerId)
            : ctx.messagesRef.current;
        const hitPeek = lastStreaming(ownerMsgs || []);
        const sealedSame = !!hitPeek?.msg.steps?.some(
          (s) =>
            s.id === id &&
            s.kind === 'thinking' &&
            (s.itemStatus === 'done' || s.itemStatus === 'error')
        );
        if (sealedSame) {
          // Comment: host reused sealed id — route to live mid Thought (or open one)
          if (thoughtBlocked) thoughtBlocked = false;
          thoughtOpen = true;
          const liveMid = hitPeek?.msg.steps?.find(
            (s) =>
              s.kind === 'thinking' &&
              s.itemStatus === 'running' &&
              s.id !== id
          );
          if (liveMid?.id) {
            id = liveMid.id;
          } else {
            thoughtSeg += 1;
            id = thoughtIdForSeg(tl.turn ?? streamTurn(), thoughtSeg);
          }
          remappedThinkingId = true;
          debugLog('timeline-order', 'thought.reopen-timeline', {
            ownerId,
            hostId: tl.id,
            id,
            seg: thoughtSeg,
            reason: liveMid ? 'alias-live' : 'sealed-same-id'
          });
        } else if (
          thoughtHasBlockersAfter(hitPeek?.msg.steps, id)
        ) {
          // Comment: Ask/Ran already below this id — never reopen the accordion above
          if (thoughtBlocked) thoughtBlocked = false;
          thoughtOpen = true;
          thoughtSeg += 1;
          id = thoughtIdForSeg(tl.turn ?? streamTurn(), thoughtSeg);
          remappedThinkingId = true;
          debugLog('timeline-order', 'thought.reopen-timeline', {
            ownerId,
            hostId: tl.id,
            id,
            seg: thoughtSeg,
            reason: 'blockers-after'
          });
        } else if (thoughtBlocked) {
          // Comment: tools already paused Thought; host sent a fresh id — keep it,
          // but advance seg so later delta.reasoning cannot reopen opening Thought.
          thoughtBlocked = false;
          thoughtOpen = true;
          const turnForSeg = tl.turn ?? streamTurn();
          const maxSeg = maxThoughtSegForTurn(
            hitPeek?.msg.steps,
            turnForSeg
          );
          if (thoughtSeg <= maxSeg) thoughtSeg = maxSeg + 1;
        }
      }
      if (!starts[id]) starts[id] = now;
      const durationMs =
        tl.itemStatus === 'done' || tl.itemStatus === 'error'
          ? now - starts[id]
          : undefined;
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) {
          // Comment: SUB-010 — parent may already be complete; still settle RunRow
          if (
            tl.subagentId &&
            (tl.itemStatus === 'done' || tl.itemStatus === 'error') &&
            (tl.id?.startsWith('tl_subagent_') || tl.kind === 'task')
          ) {
            const asst = lastAssistant(prev);
            if (!asst) return prev;
            const we = delta.workEvent;
            if (!we || !isSubagentHeaderEvent(we)) return prev;
            const copy = [...prev];
            copy[asst.lastIdx] = withWorkEvent(asst.msg, we);
            return copy;
          }
          return prev;
        }
        let msg = hit.msg;
        if (STREAM_TOOL_KINDS.has(tl.kind) && tl.itemStatus === 'running' && !tl.subagentId) {
          // Comment: Cursor-style — pause opening Thought; mid seg opens after tools
          pauseThoughtSegment(`timeline.tool:${tl.kind}`);
          msg = sealRunningThoughtSteps(
            sealLeadFromMessage(msg, tl.turn, `timeline.tool:${tl.kind}`)
          );
        }
        // Comment: SUB-010 — parent keeps tl_subagent_* header only; child tools live on child session
        if (tl.subagentId) {
          const we = delta.workEvent;
          const keepHeader =
            (we != null && isSubagentHeaderEvent(we)) ||
            (tl.id != null && String(tl.id).startsWith('tl_subagent_')) ||
            tl.kind === 'task';
          if (!keepHeader) return prev;
          // Comment: task_run skips tool.start — still seal Thought so next dig is
          // a NEW Thought *below* SubagentRunRow (not growing the open accordion above).
          if (tl.itemStatus === 'running' || tl.itemStatus == null) {
            pauseThoughtSegment('timeline.subagent');
            msg = sealRunningThoughtSteps(
              sealLeadFromMessage(msg, tl.turn, 'timeline.subagent')
            );
          }
          msg = withWorkEvent(msg, we);
          const copy = [...prev];
          copy[hit.lastIdx] = msg;
          return copy;
        }
        msg = withWorkEvent(msg, delta.workEvent);
        const steps = [...(msg.steps || [])];
        const idx = steps.findIndex((s) => s.id === id);
        const nextStep = {
          id,
          kind: tl.kind,
          label: tl.label,
          // Comment: never blank Grepped/Read — keep prior detail unless end sends a real one
          detail:
            tl.detail != null && String(tl.detail).trim()
              ? String(tl.detail)
              : steps[idx]?.detail,
          toolName: tl.toolName ?? steps[idx]?.toolName,
          openPath:
            tl.openPath != null && String(tl.openPath).trim()
              ? String(tl.openPath)
              : steps[idx]?.openPath,
          turn: tl.turn,
          thoughtRole: remappedThinkingId
            ? thoughtSeg > 0
              ? 'mid'
              : 'opening'
            : tl.thoughtRole ??
              (tl.kind === 'thinking'
                ? steps[idx]?.thoughtRole ?? 'opening'
                : steps[idx]?.thoughtRole),
          itemStatus: tl.itemStatus,
          durationMs: durationMs ?? steps[idx]?.durationMs,
          options: tl.options ?? steps[idx]?.options,
          answer: tl.answer ?? steps[idx]?.answer,
          allowMultiple: tl.allowMultiple ?? steps[idx]?.allowMultiple,
          askQid: tl.askQid ?? steps[idx]?.askQid,
        };
        if (idx >= 0) steps[idx] = { ...steps[idx], ...nextStep };
        else steps.push(nextStep);
        debugLog('timeline-order', 'stream.timeline', {
          ownerId: getOwnerSessionId(),
          delta: `${id}|${tl.kind}|${tl.itemStatus}|t${tl.turn ?? '?'}${tl.subagentId ? `@${tl.subagentId}` : ''}`,
          upsert: idx >= 0 ? 'patch' : 'append',
          at: idx >= 0 ? idx : steps.length - 1,
          thoughtSeg,
          order: steps.map(
            (s, i) =>
              `${i}:${s.id}|${s.kind}|${s.itemStatus}|t${s.turn ?? '?'}`
          )
        });
        const copy = [...prev];
        copy[hit.lastIdx] = { ...msg, steps };
        return copy;
      });
      return;
    }

    if (delta.workEvent) {
      applyOwnerMessages((prev) => {
        const terminalHeader =
          isSubagentHeaderEvent(delta.workEvent!) &&
          isTerminalWorkStatus(delta.workEvent!.status);
        const hit =
          lastStreaming(prev) || (terminalHeader ? lastAssistant(prev) : null);
        if (!hit) return prev;
        // Comment: SUB-010 — drop child-tagged tool rows that leaked onto parent
        if (
          delta.workEvent!.subagentId &&
          !isSubagentHeaderEvent(delta.workEvent!)
        ) {
          return prev;
        }
        let msg = hit.msg;
        // Comment: subagent.event path (no timeline) must also seal+rotate Thought
        if (
          isSubagentHeaderEvent(delta.workEvent!) &&
          (delta.workEvent!.status === 'running' ||
            delta.workEvent!.status === 'pending') &&
          hit.msg.status === 'streaming'
        ) {
          pauseThoughtSegment('workEvent.subagent');
          msg = sealRunningThoughtSteps(
            sealLeadFromMessage(msg, undefined, 'workEvent.subagent')
          );
        }
        const copy = [...prev];
        copy[hit.lastIdx] = withWorkEvent(msg, delta.workEvent);
        return copy;
      });
      return;
    }

    if (delta.reasoning) {
      // Comment: after tools, rotate to mid Thought (Exploring nest) — do not append to top Thinking
      if (thoughtBlocked) {
        thoughtBlocked = false;
        thoughtSeg += 1;
        debugLog('timeline-order', 'thought.reopen', {
          ownerId: getOwnerSessionId(),
          seg: thoughtSeg,
          role: thoughtSeg > 0 ? 'mid' : 'opening'
        });
      }
      if (!thoughtOpen) {
        thoughtOpen = true;
      }
      const turn = streamTurn();
      // Comment: peek owner steps — avoid reopening a Thought that already has Ask/Ran below
      const ownerIdPeek = getOwnerSessionId();
      const ownerMsgsPeek =
        ownerIdPeek && typeof ctx.getSessionMessages === 'function'
          ? ctx.getSessionMessages(ownerIdPeek)
          : ctx.messagesRef.current;
      const hitPeek = lastStreaming(ownerMsgsPeek || []);
      const maxSeg = maxThoughtSegForTurn(hitPeek?.msg.steps, turn);
      if (thoughtSeg < maxSeg) thoughtSeg = maxSeg;
      let id = thoughtIdForSeg(turn, thoughtSeg);
      if (thoughtHasBlockersAfter(hitPeek?.msg.steps, id)) {
        thoughtSeg += 1;
        id = thoughtIdForSeg(turn, thoughtSeg);
        debugLog('timeline-order', 'thought.rotate-past-blockers', {
          ownerId: ownerIdPeek,
          id,
          seg: thoughtSeg
        });
      }
      const now = Date.now();
      const starts = stepStarts();
      if (!starts[id]) starts[id] = now;
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) return prev;
        // Comment: inside updater — rotate again if Ask landed between peek and commit
        let liveId = id;
        let liveSeg = thoughtSeg;
        if (thoughtHasBlockersAfter(hit.msg.steps, liveId)) {
          liveSeg += 1;
          liveId = thoughtIdForSeg(turn, liveSeg);
          thoughtSeg = liveSeg;
          if (!starts[liveId]) starts[liveId] = now;
          debugLog('timeline-order', 'thought.rotate-past-blockers', {
            ownerId: getOwnerSessionId(),
            id: liveId,
            seg: liveSeg,
            where: 'apply'
          });
        }
        // Comment: seal older Thoughts only — keep current segment live (Thinking clock grows)
        let msg = sealRunningThoughtSteps(hit.msg, now, liveId);
        msg = {
          ...msg,
          workItems: sealStaleThoughtsBeforeTools(msg.workItems || [], now)
        };
        const liveRole: 'opening' | 'mid' = liveSeg > 0 ? 'mid' : 'opening';
        const prevEvent = (msg.workItems || []).find(
          (event) => event.id === liveId
        );
        const prevDetail = prevEvent?.detail || '';
        const thinkingEvent: ConversationWorkEvent = {
          ...(prevEvent ||
            beginWorkEvent({
              id: liveId,
              timelineKind: 'thinking',
              now: starts[liveId]
            })!),
          id: liveId,
          type: 'thinking',
          status: 'running',
          label: 'Thought',
          detail: prevDetail + delta.reasoning,
          startedAt: prevEvent?.startedAt ?? starts[liveId],
          // Comment: clear completedAt if a prior soft seal left this id complete
          completedAt: undefined
        };
        const msgWithWork = withWorkEvent(msg, thinkingEvent);
        const steps = [...(msgWithWork.steps || [])];
        const idx = steps.findIndex((s) => s.id === liveId);
        const prevStepDetail = idx >= 0 ? steps[idx].detail || '' : '';
        const nextStep = {
          id: liveId,
          kind: 'thinking' as const,
          label: 'Thought',
          detail: prevStepDetail + delta.reasoning,
          turn,
          thoughtRole: liveRole,
          itemStatus: 'running' as const,
          // Comment: drop premature durationMs so title stays Thinking until real seal
          durationMs: undefined as number | undefined
        };
        if (idx >= 0) {
          const { durationMs: _drop, ...rest } = steps[idx];
          void _drop;
          steps[idx] = { ...rest, ...nextStep };
        } else {
          steps.push(nextStep);
        }
        debugLog('timeline-order', 'thought.append', {
          ownerId: getOwnerSessionId(),
          id: liveId,
          seg: liveSeg,
          role: liveRole,
          detailLen: (prevStepDetail + delta.reasoning).length
        });
        const copy = [...prev];
        copy[hit.lastIdx] = { ...msgWithWork, steps };
        return copy;
      });
      return;
    }

    if (delta.status !== undefined) {
      if (delta.status === 'asking') {
        const ownerId = getOwnerSessionId();
        if (!ownerId || ownerId === ctx.sessionIdRef.current) {
          ctx.setAwaitingUser(true);
        }
      }
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) return prev;
        const newMsgs = [...prev];
        newMsgs[hit.lastIdx] = {
          ...hit.msg,
          toolStatus: undefined
        };
        return newMsgs;
      });
      return;
    }

    if (delta.replaceContent != null) {
      const finalText = String(delta.replaceContent);
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) return prev;
        const cur = hit.msg.content || '';
        // Never shrink a longer in-UI body (out-of-order catch-up).
        if (finalText.length < cur.length && cur.startsWith(finalText)) {
          debugLog('timeline-order', 'mid-reply.replace-skip', {
            ownerId: getOwnerSessionId(),
            reason: 'would shrink longer UI body',
            curLen: cur.length,
            finalLen: finalText.length
          });
          return prev;
        }
        if (finalText === cur) return prev;
        debugLog('timeline-order', 'mid-reply.replaceContent', {
          ownerId: getOwnerSessionId(),
          curLen: cur.length,
          finalLen: finalText.length,
          turnProse: hit.msg.turnProse?.length ?? 0,
          curPreview: cur.trim().slice(0, 80),
          finalPreview: finalText.trim().slice(0, 80)
        });
        if (finalText.length > cur.length) {
          debugLog('parallel tab stream catch-up', {
            owner: getOwnerSessionId(),
            from: cur.length,
            to: finalText.length
          });
        }
        const newMsgs = [...prev];
        newMsgs[hit.lastIdx] = {
          ...hit.msg,
          toolStatus: undefined,
          openingLead: undefined,
          content: finalText
        };
        return newMsgs;
      });
      return;
    }

    if (delta.content) {
      if (planPinned) return;
      // Comment: content alone must NOT rotate/seal Thought. Models interleave
      // content+reasoning between tools; one live Thought per tab until turn end.
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) return prev;
        const nextContent = (hit.msg.content || '') + delta.content!;
        const prevLen = (hit.msg.content || '').length;
        // Fingerprint mid-reply growth (skip pure 1–2 char token spam).
        if (
          nextContent.trim().length >= 8 &&
          (nextContent.length - prevLen >= 12 || /[。.!?…]\s*$/.test(nextContent))
        ) {
          debugLog('timeline-order', 'mid-reply.content', {
            ownerId: getOwnerSessionId(),
            contentLen: nextContent.length,
            thoughtOpen,
            thoughtSeg,
            preview: nextContent.trim().slice(0, 100)
          });
        }
        const newMsgs = [...prev];
        newMsgs[hit.lastIdx] = {
          ...hit.msg,
          toolStatus: undefined,
          openingLead: undefined,
          content: nextContent
        };
        return newMsgs;
      });
    }
  };

  const onComplete = () => {
    // Always settle the owner transcript — isStale must not leave a forever-
    // streaming bubble (tab switch / superseded turn still owns this request).
    if (summarizingClearTimer) {
      clearTimeout(summarizingClearTimer);
      summarizingClearTimer = undefined;
    }
    const ownerId = getOwnerSessionId();
    const stale = Boolean(ctx.isStale?.());
    debugLog('CHAT-007 tab stream settle', 'stream.onComplete', { ownerId, stale });
    if (!stale && ownerId === ctx.sessionIdRef.current) {
      ctx.setAwaitingUser(false);
    }
    let completedAssistant: ChatMessage | undefined;
    applyOwnerMessages((prev) => {
      const lastIdx = prev.length - 1;
      if (lastIdx < 0 || prev[lastIdx].role !== 'assistant') return prev;
      if (prev[lastIdx].status !== 'streaming') {
        completedAssistant = prev[lastIdx];
        return prev;
      }
      const newMsgs = [...prev];
      let content = stripFakeToolMarkup(newMsgs[lastIdx].content);
      if (/^🔧/.test(content.trim()) && content.length < 80) {
        content = '';
      }
      // Comment: owner-tab only — sealRunningThoughtSteps stamps durationMs for Thought Ns
      const sealedThoughts = sealRunningThoughtSteps(newMsgs[lastIdx]);
      const steps = sealedThoughts.steps || [];
      const workItems = settleWorkEvents(sealedThoughts.workItems);
      const leadLeft = (newMsgs[lastIdx].openingLead || '').trim();
      const body = content.trim();
      const finalContent =
        leadLeft && body && !body.includes(leadLeft)
          ? `${leadLeft}${body}`.trim()
          : body || leadLeft;
      const draft = dedupeAssistantBody({
        ...newMsgs[lastIdx],
        toolStatus: undefined,
        openingLead: undefined,
        content: finalContent,
        steps,
        workItems,
        metadata: {
          ...newMsgs[lastIdx].metadata,
          contextSummarizing: false
        },
        workedDurationMs: Math.max(
          0,
          Date.now() - (newMsgs[lastIdx].timestamp || Date.now())
        )
      });
      const hasBody = Boolean(draft.content?.trim());
      const hasOther =
        (draft.turnProse?.length ?? 0) > 0 ||
        (draft.steps?.length ?? 0) > 0 ||
        (draft.workItems?.length ?? 0) > 0 ||
        (draft.fileEdits?.length ?? 0) > 0 ||
        (draft.terminalRuns?.length ?? 0) > 0;
      newMsgs[lastIdx] = {
        ...draft,
        status: hasBody || hasOther ? 'complete' : 'error',
        content: hasBody ? draft.content : hasOther ? '' : '(no response)'
      };
      completedAssistant = newMsgs[lastIdx];
      debugLog('CHAT-007 tab stream settle', 'stream.onComplete settled', {
        ownerId,
        stale,
        status: newMsgs[lastIdx].status,
        contentLen: (newMsgs[lastIdx].content || '').length,
        hasOther
      });
      return newMsgs;
    });

    const stageNow = ctx.planStageRef.current;
    const shouldPromotePlan =
      ctx.mode === 'plan' &&
      !ctx.planSessionHasPlan() &&
      (ctx.promotePlanOnCompleteRef.current ||
        stageNow === 'planning' ||
        stageNow === 'questions' ||
        stageNow === 'research');
    if (shouldPromotePlan) {
      const ownerMessages = ctx.getSessionMessages(ownerId);
      const last =
        completedAssistant ||
        [...ownerMessages].reverse().find((m) => m.role === 'assistant');
      let planMd = extractPlanMarkdownFromMessage(last);
      const soft =
        ctx.promotePlanOnCompleteRef.current || stageNow === 'planning';
      const ok = soft
        ? looksLikePlanDraft(planMd) || looksLikePlanDocument(planMd)
        : looksLikePlanDocument(planMd);
      if (!ok) {
        planMd = findLatestPlanMarkdown(ownerMessages);
      }
      if (looksLikePlanDocument(planMd) || (soft && looksLikePlanDraft(planMd))) {
        ctx.promotePlanToReview(planMd);
      }
    }
    if (
      ctx.mode === 'plan' &&
      (ctx.planStageRef.current === 'research' ||
        ctx.planStageRef.current === 'questions') &&
      ctx.planController.getQuestions().length > 0 &&
      ctx.pendingQuestionsRef.current.length > 0
    ) {
      // Clarifying chrome is global — only open it for the active owner tab.
      if (ownerId === ctx.sessionIdRef.current) {
        ctx.setShowClarifying(true);
      } else {
        ctx.parkedAwaitingRef.current = {
          sessionId: ownerId,
          questions: ctx.pendingQuestionsRef.current.map((q) => ({ ...q }))
        };
      }
    }
  };

  const onError = (err: string) => {
    // Always paint error UI — even when isStale (superseded turn). Dropping
    // onError left empty streaming assistants that finalizeStreamingAssistant
    // later deleted → "user bubble only, no error".
    const ownerId = getOwnerSessionId();
    const stale = Boolean(ctx.isStale?.());
    debugError('chat.send empty reply', 'stream.onError', {
      ownerId,
      stale,
      err: String(err || '').slice(0, 200)
    });
    if (ownerId === ctx.sessionIdRef.current) {
      ctx.setAwaitingUser(false);
      ctx.setError(err);
    }
    applyOwnerMessages((prev) => {
      const hit = lastStreaming(prev);
      if (!hit) {
        // Early onError before paint / ref race — still show a visible error turn.
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.status === 'error') {
          return prev;
        }
        return [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'assistant' as const,
            content: err,
            timestamp: Date.now(),
            status: 'error' as const
          }
        ];
      }
      const newMsgs = [...prev];
      const prevSteps = hit.msg.steps || [];
      const steps = prevSteps.map((s) =>
        s.itemStatus === 'running' ? { ...s, itemStatus: 'error' as const } : s
      );
      newMsgs[hit.lastIdx] = {
        ...hit.msg,
        status: 'error',
        toolStatus: undefined,
        steps,
        workItems: settleWorkEvents(hit.msg.workItems, 'error'),
        content: hit.msg.content?.trim()
          ? `${hit.msg.content}\n\n⚠ ${err}`
          : err,
        workedDurationMs: Math.max(
          0,
          Date.now() - (hit.msg.timestamp || Date.now())
        )
      };
      return newMsgs;
    });
  };

  return { onDelta, onComplete, onError };
}
