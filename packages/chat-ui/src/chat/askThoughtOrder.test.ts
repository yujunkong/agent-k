/**
 * Ask → Thought order: post-ask reasoning must land below AskQuestionCard.
 * Feature: PLAN-003 / CONV-014 — Ask is a sequential card like Ran/Edit.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createAssistantStreamSession,
  type AssistantStreamCtx
} from './assistantStreamSession';
import type { ChatMessage } from './types';
import { SessionStepStartMap, SessionTurnMap } from './sendEpoch';
import { buildCuriosityPhases } from './curiosityPhases';

function assistant(
  extra?: Partial<ChatMessage>
): ChatMessage {
  return {
    id: 'a1',
    role: 'assistant',
    content: '',
    timestamp: 1,
    status: 'streaming',
    ...extra
  };
}

function baseCtx(store: { msgs: ChatMessage[] }): AssistantStreamCtx {
  return {
    mode: 'agent',
    stepStartRef: { current: new SessionStepStartMap() },
    turnNumberRef: { current: new SessionTurnMap() },
    sessionIdRef: { current: 'sess' },
    loopSessionIdRef: { current: 'sess' },
    parkedAwaitingRef: { current: null },
    messagesRef: { current: store.msgs },
    planStageRef: { current: '' },
    pendingQuestionsRef: { current: [] },
    promotePlanOnCompleteRef: { current: false },
    planController: {
      enterQuestionsStage: () => {},
      addQuestion: () => {},
      getQuestions: () => []
    },
    debugController: {
      getStage: () => 'idle',
      getHypotheses: () => [],
      addHypothesis: () => {},
      syncStageFromHost: () => {}
    },
    planSessionHasPlan: () => false,
    setMessages: vi.fn(),
    updateSessionMessages: (_id, updater) => {
      store.msgs = updater(store.msgs);
    },
    getSessionMessages: () => store.msgs,
    setPendingQuestions: vi.fn(),
    setShowClarifying: vi.fn(),
    setAwaitingUser: vi.fn(),
    setDebugTick: vi.fn(),
    setError: vi.fn(),
    promotePlanToReview: vi.fn()
  };
}

function phaseActionIds(steps: NonNullable<ChatMessage['steps']>): string[] {
  const phases = buildCuriosityPhases(
    steps.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: s.label || '',
      detail: s.detail,
      toolName: s.toolName,
      turn: s.turn,
      thoughtRole: s.thoughtRole,
      itemStatus: (s.itemStatus || 'done') as 'running' | 'done' | 'error',
      askQid: s.askQid
    })) as any
  );
  return phases.flatMap((p) => [
    ...(p.openingThought ? [p.openingThought.id] : []),
    ...p.actions.map((a) => a.id)
  ]);
}

describe('ask then thought order', () => {
  it('post-ask reasoning is a new step after ask (same stream)', () => {
    const store = { msgs: [assistant()] };
    const ctx = baseCtx(store);
    ctx.turnNumberRef.current.bump('sess');
    const { onDelta } = createAssistantStreamSession(ctx);

    onDelta({ reasoning: 'pre-ask dig about serde ' });
    onDelta({
      askQuestion: {
        id: 'q1',
        question: 'Phase 2 scope?',
        options: ['Full', 'Partial']
      }
    });
    onDelta({ reasoning: 'post-ask continuing about persistence ' });

    const steps = store.msgs[0].steps || [];
    const askIdx = steps.findIndex((s) => s.kind === 'asking');
    const thoughts = steps.filter((s) => s.kind === 'thinking');
    expect(askIdx).toBeGreaterThanOrEqual(0);
    expect(thoughts).toHaveLength(2);
    expect(thoughts[0]!.detail).toContain('pre-ask');
    expect(thoughts[0]!.detail).not.toContain('post-ask');
    expect(thoughts[1]!.id).toBe('tl_thinking_1_s1');
    expect(thoughts[1]!.detail).toContain('post-ask');
    expect(steps.indexOf(thoughts[1]!)).toBeGreaterThan(askIdx);

    const ids = phaseActionIds(steps);
    expect(ids.indexOf('tl_ask_q1')).toBeLessThan(
      ids.indexOf('tl_thinking_1_s1')
    );
  });

  it('stamps ask into workItems so Thought cannot resume the tag above', () => {
    const store = { msgs: [assistant()] };
    const ctx = baseCtx(store);
    ctx.turnNumberRef.current.bump('sess');
    const { onDelta } = createAssistantStreamSession(ctx);

    onDelta({ reasoning: 'pre ' });
    onDelta({
      askQuestion: {
        id: 'q1',
        question: 'Scope?',
        options: ['A', 'B']
      }
    });

    const items = store.msgs[0].workItems || [];
    expect(items.some((e) => e.type === 'ask')).toBe(true);
    const thought = items.find((e) => e.type === 'thinking');
    expect(thought?.status).toBe('complete');
    const askIdx = items.findIndex((e) => e.type === 'ask');
    const thoughtIdx = items.findIndex((e) => e.type === 'thinking');
    expect(thoughtIdx).toBeLessThan(askIdx);

    onDelta({ reasoning: 'below card ' });
    const after = store.msgs[0].workItems || [];
    const thoughts = after.filter((e) => e.type === 'thinking');
    expect(thoughts.length).toBeGreaterThanOrEqual(2);
    expect(thoughts[0]!.detail).toContain('pre');
    expect(thoughts[0]!.detail).not.toContain('below card');
    expect(thoughts[thoughts.length - 1]!.detail).toContain('below card');
  });

  it('does not reopen opening Thought above Ask when seg was reset', () => {
    // Comment: simulates host/timeline clearing thoughtBlocked without ++seg,
    // or a stale session counter — reasoning must still rotate past Ask.
    const store = {
      msgs: [
        assistant({
          steps: [
            {
              id: 'tl_thinking_1',
              kind: 'thinking',
              label: 'Thought',
              detail: 'sealed pre-ask',
              itemStatus: 'done',
              turn: 1,
              durationMs: 1200
            },
            {
              id: 'tl_ask_q1',
              kind: 'asking',
              label: 'ask_question',
              toolName: 'ask_question',
              detail: 'Phase 2 scope?',
              askQid: 'q1',
              itemStatus: 'running',
              turn: 1
            }
          ]
        })
      ]
    };
    const ctx = baseCtx(store);
    ctx.turnNumberRef.current.bump('sess');
    // Comment: fresh stream session — thoughtSeg starts at 0 (would hit tl_thinking_1)
    const { onDelta } = createAssistantStreamSession(ctx);

    onDelta({ reasoning: 'should appear below ask card ' });

    const steps = store.msgs[0].steps || [];
    const opening = steps.find((s) => s.id === 'tl_thinking_1');
    const mid = steps.find((s) => s.id === 'tl_thinking_1_s1');
    expect(opening?.detail).toBe('sealed pre-ask');
    expect(opening?.itemStatus).toBe('done');
    expect(mid?.detail).toContain('should appear below');
    expect(mid?.itemStatus).toBe('running');

    const askIdx = steps.findIndex((s) => s.id === 'tl_ask_q1');
    expect(steps.indexOf(mid!)).toBeGreaterThan(askIdx);

    const ids = phaseActionIds(steps);
    expect(ids.indexOf('tl_ask_q1')).toBeLessThan(
      ids.indexOf('tl_thinking_1_s1')
    );
  });

  it('tool.start asking also rotates Thought below the card', () => {
    const store = { msgs: [assistant()] };
    const ctx = baseCtx(store);
    ctx.turnNumberRef.current.bump('sess');
    const { onDelta } = createAssistantStreamSession(ctx);

    onDelta({ reasoning: 'pre ' });
    onDelta({
      clearContent: true,
      sealTurn: 1,
      timeline: {
        kind: 'asking',
        turn: 1,
        label: 'ask_question',
        toolName: 'ask_question',
        detail: 'Scope?',
        itemStatus: 'running',
        id: 'tl_ask_scope'
      }
    });
    onDelta({
      askQuestion: {
        id: 'scope',
        question: 'Scope?',
        options: ['A', 'B']
      }
    });
    onDelta({ reasoning: 'after ask card ' });

    const steps = store.msgs[0].steps || [];
    const askIdx = steps.findIndex(
      (s) => s.kind === 'asking' || s.toolName === 'ask_question'
    );
    const thoughts = steps.filter((s) => s.kind === 'thinking');
    expect(thoughts.length).toBeGreaterThanOrEqual(2);
    expect(steps.indexOf(thoughts[thoughts.length - 1]!)).toBeGreaterThan(
      askIdx
    );
  });
});
