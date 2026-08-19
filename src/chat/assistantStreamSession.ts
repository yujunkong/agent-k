/**
 * Shared assistant stream handlers for send + regenerate.
 * Keep ONE copy of delta/complete/error so the two call sites cannot drift.
 */
import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessage, Mode, StreamDelta } from './types';
import type { DebugStage } from '../debug/DebugModeController';
import type { PendingQuestion } from '../tools/session/AskQuestionTool';
import { normalizeMcqQuestion } from './normalizeAskQuestion';
import { sealBodyBeforeTools, resolveSealTurn } from './sealTurnProse';
import { stripFakeToolMarkup } from './displaySanitize';
import {
  extractPlanMarkdownFromMessage,
  findLatestPlanMarkdown,
  looksLikePlanDocument,
  looksLikePlanDraft
} from './planPromote';
import {
  settleWorkEvents,
  upsertWorkEvents,
  beginWorkEvent,
  type ConversationWorkEvent
} from './conversation/conversationWorkEvent';

export const STREAM_TOOL_KINDS = new Set([
  'searching',
  'reading',
  'editing',
  'running',
  'browsing',
  'asking'
]);

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
  return { ...msg, workItems: upsertWorkEvents(msg.workItems || [], event) };
}

function looksLikeDuplicateProse(aRaw: string, bRaw: string): boolean {
  const a = normalizeProse(aRaw);
  const b = normalizeProse(bRaw);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 40 && b.includes(a)) return true;
  if (b.length >= 40 && a.includes(b)) return true;
  const n = Math.min(160, a.length, b.length);
  if (n >= 40 && a.slice(0, n) === b.slice(0, n)) return true;
  if (a.length >= 60 && b.length >= 60) {
    const m = Math.min(120, a.length, b.length);
    if (a.slice(0, m) === b.slice(0, m)) return true;
  }
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
      return { ...msg, turnProse: [] };
    }
    return msg;
  }
  return { ...msg, turnProse: kept };
}

export interface AssistantStreamCtx {
  isStale?: () => boolean;
  mode: Mode;
  stepStartRef: { current: Record<string, number> };
  turnNumberRef: { current: number };
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
  planV2HasPlan: () => boolean;
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
  const getOwnerSessionId = () =>
    ctx.ownerSessionId || ctx.loopSessionIdRef.current || ctx.sessionIdRef.current;
  const applyOwnerMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    ctx.updateSessionMessages(getOwnerSessionId(), updater);
  };

  const sealLeadFromMessage = (
    msg: ChatMessage,
    explicitTurn?: number | null
  ): ChatMessage => {
    const sealed = sealBodyBeforeTools(msg, resolveSealTurn(msg, explicitTurn));
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

  const onDelta = (delta: StreamDelta) => {
    if (ctx.isStale?.()) return;

    if (delta.askQuestion?.id) {
      const q = delta.askQuestion;
      const normalized = normalizeMcqQuestion(
        q.question ||
          'A decision is needed. Pick an option below, or type your own under Other.',
        q.options
      );
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
      const ownerId = ctx.loopSessionIdRef.current || ctx.sessionIdRef.current;
      const qEntry: PendingQuestion = {
        id: q.id,
        question: normalized.question,
        options: normalized.options,
        required: q.required !== false,
        allowMultiple: Boolean(q.allowMultiple),
        answered: false
      };
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

    if (delta.clearContent) {
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) return prev;
        const newMsgs = [...prev];
        newMsgs[hit.lastIdx] = withWorkEvent(
          sealLeadFromMessage(hit.msg, delta.sealTurn),
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
        turn: delta.fileEdit.turn || ctx.turnNumberRef.current || 1
      };
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) return prev;
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
        const copy = [...prev];
        copy[hit.lastIdx] = { ...msg, fileEdits };
        return copy;
      });
      return;
    }

    if (delta.terminalRun) {
      const ev = delta.terminalRun;
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) return prev;
        const msg = hit.msg;
        const runs = [...(msg.terminalRuns || [])];
        const idx = runs.findIndex((r) => r.id === ev.id);
        const turn = ev.turn || ctx.turnNumberRef.current || 1;
        if (ev.phase === 'start' || idx < 0) {
          const next = {
            id: ev.id,
            command: ev.command || '',
            description: ev.description,
            cwd: ev.cwd,
            status: (ev.status || 'running') as 'running' | 'done' | 'error',
            stdout: '',
            stderr: '',
            turn
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
            turn: ev.turn || cur.turn
          };
        }
        const copy = [...prev];
        copy[hit.lastIdx] = { ...msg, terminalRuns: runs };
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
      const id =
        tl.id ||
        `step_${tl.kind}_${tl.turn}_${tl.toolName || 'x'}_${Date.now()}`;
      const now = Date.now();
      if (!ctx.stepStartRef.current[id]) ctx.stepStartRef.current[id] = now;
      const durationMs =
        tl.itemStatus === 'done' || tl.itemStatus === 'error'
          ? now - ctx.stepStartRef.current[id]
          : undefined;
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) return prev;
        let msg = hit.msg;
        if (STREAM_TOOL_KINDS.has(tl.kind) && tl.itemStatus === 'running') {
          msg = sealLeadFromMessage(msg, tl.turn);
        }
        msg = withWorkEvent(msg, delta.workEvent);
        const steps = [...(msg.steps || [])];
        const idx = steps.findIndex((s) => s.id === id);
        const nextStep = {
          id,
          kind: tl.kind,
          label: tl.label,
          detail: tl.detail !== undefined ? tl.detail : steps[idx]?.detail,
          toolName: tl.toolName,
          turn: tl.turn,
          thoughtRole:
            tl.thoughtRole ??
            (tl.kind === 'thinking'
              ? steps[idx]?.thoughtRole ?? 'opening'
              : steps[idx]?.thoughtRole),
          itemStatus: tl.itemStatus,
          durationMs: durationMs ?? steps[idx]?.durationMs
        };
        if (idx >= 0) steps[idx] = { ...steps[idx], ...nextStep };
        else steps.push(nextStep);
        const copy = [...prev];
        copy[hit.lastIdx] = { ...msg, steps };
        return copy;
      });
      return;
    }

    if (delta.workEvent) {
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) return prev;
        const copy = [...prev];
        copy[hit.lastIdx] = withWorkEvent(hit.msg, delta.workEvent);
        return copy;
      });
      return;
    }

    if (delta.reasoning) {
      const id = `tl_thinking_${ctx.turnNumberRef.current || 1}`;
      const now = Date.now();
      if (!ctx.stepStartRef.current[id]) ctx.stepStartRef.current[id] = now;
      const thinkingEvent = beginWorkEvent({
        id,
        timelineKind: 'thinking',
        now: ctx.stepStartRef.current[id]
      });
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) return prev;
        const msg = withWorkEvent(hit.msg, thinkingEvent ?? undefined);
        const steps = [...(msg.steps || [])];
        const idx = steps.findIndex((s) => s.id === id);
        const prevDetail = idx >= 0 ? steps[idx].detail || '' : '';
        const nextStep = {
          id,
          kind: 'thinking',
          label: 'Thought',
          detail: prevDetail + delta.reasoning,
          turn: ctx.turnNumberRef.current || 1,
          thoughtRole: 'opening' as const,
          itemStatus: 'running' as const
        };
        if (idx >= 0) steps[idx] = { ...steps[idx], ...nextStep };
        else steps.push(nextStep);
        const copy = [...prev];
        copy[hit.lastIdx] = { ...msg, steps };
        return copy;
      });
      return;
    }

    if (delta.status !== undefined) {
      if (delta.status === 'asking') {
        const ownerId = ctx.loopSessionIdRef.current || ctx.sessionIdRef.current;
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

    if (delta.content) {
      if (planPinned) return;
      applyOwnerMessages((prev) => {
        const hit = lastStreaming(prev);
        if (!hit) return prev;
        const newMsgs = [...prev];
        newMsgs[hit.lastIdx] = {
          ...hit.msg,
          toolStatus: undefined,
          openingLead: undefined,
          content: (hit.msg.content || '') + delta.content!
        };
        return newMsgs;
      });
    }
  };

  const onComplete = () => {
    if (ctx.isStale?.()) return;
    const ownerId = getOwnerSessionId();
    if (ownerId === ctx.sessionIdRef.current) {
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
      const prevSteps = newMsgs[lastIdx].steps || [];
      const steps = prevSteps.map((s) =>
        s.itemStatus === 'running' ? { ...s, itemStatus: 'done' as const } : s
      );
      const workItems = settleWorkEvents(newMsgs[lastIdx].workItems);
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
      return newMsgs;
    });

    const stageNow = ctx.planStageRef.current;
    const shouldPromotePlan =
      ctx.mode === 'plan' &&
      !ctx.planV2HasPlan() &&
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
      ctx.setShowClarifying(true);
    }
  };

  const onError = (err: string) => {
    if (ctx.isStale?.()) return;
    const ownerId = getOwnerSessionId();
    if (ownerId === ctx.sessionIdRef.current) {
      ctx.setAwaitingUser(false);
      ctx.setError(err);
    }
    applyOwnerMessages((prev) => {
      const hit = lastStreaming(prev);
      if (!hit) return prev;
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
