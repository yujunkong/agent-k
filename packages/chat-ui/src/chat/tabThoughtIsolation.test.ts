/**
 * Parallel tab streams must not share Thought segment / step clocks.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createAssistantStreamSession,
  type AssistantStreamCtx
} from './assistantStreamSession';
import type { ChatMessage } from './types';
import { SessionStepStartMap, SessionTurnMap } from './sendEpoch';

function assistant(id: string): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: '',
    timestamp: 1,
    status: 'streaming'
  };
}

describe('tab-isolated thought segments', () => {
  it('keeps Thought ids independent across two owner sessions sharing refs', () => {
    const stepStartRef = { current: new SessionStepStartMap() };
    const turnNumberRef = { current: new SessionTurnMap() };
    turnNumberRef.current.bump('tab-a');
    turnNumberRef.current.bump('tab-b');

    const storeA = { msgs: [assistant('a')] };
    const storeB = { msgs: [assistant('b')] };

    const makeCtx = (
      owner: string,
      store: { msgs: ChatMessage[] }
    ): AssistantStreamCtx => ({
      mode: 'agent',
      ownerSessionId: owner,
      stepStartRef,
      turnNumberRef,
      sessionIdRef: { current: 'active-other' },
      loopSessionIdRef: { current: owner },
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
      updateSessionMessages: (id, updater) => {
        if (id === 'tab-a') storeA.msgs = updater(storeA.msgs);
        if (id === 'tab-b') storeB.msgs = updater(storeB.msgs);
      },
      getSessionMessages: (id) =>
        id === 'tab-a' ? storeA.msgs : id === 'tab-b' ? storeB.msgs : [],
      setPendingQuestions: vi.fn(),
      setShowClarifying: vi.fn(),
      setAwaitingUser: vi.fn(),
      setDebugTick: vi.fn(),
      setError: vi.fn(),
      promotePlanToReview: vi.fn()
    });

    const streamA = createAssistantStreamSession(makeCtx('tab-a', storeA));
    const streamB = createAssistantStreamSession(makeCtx('tab-b', storeB));

    streamA.onDelta({ reasoning: 'A1' });
    streamB.onDelta({ reasoning: 'B1' });
    streamA.onDelta({ clearContent: true });
    streamA.onDelta({ reasoning: 'A2 after tools' });
    // B still on first Thought — must not jump to s1 because A sealed
    streamB.onDelta({ reasoning: ' B1b' });

    const aSteps = storeA.msgs[0].steps || [];
    const bSteps = storeB.msgs[0].steps || [];
    // Soft-pause: A resumes same Thought id; B untouched
    expect(aSteps.filter((s) => s.kind === 'thinking').map((s) => s.id)).toEqual([
      'tl_thinking_1'
    ]);
    expect(aSteps.find((s) => s.id === 'tl_thinking_1')?.detail).toContain('A2 after tools');
    expect(bSteps).toHaveLength(1);
    expect(bSteps[0].id).toBe('tl_thinking_1');
    expect(bSteps[0].detail).toBe('B1 B1b');
  });

  it('content interleave does not rotate Thought or cross-contaminate tabs', () => {
    const stepStartRef = { current: new SessionStepStartMap() };
    const turnNumberRef = { current: new SessionTurnMap() };
    turnNumberRef.current.bump('tab-a');
    turnNumberRef.current.bump('tab-b');

    const storeA = { msgs: [assistant('a')] };
    const storeB = { msgs: [assistant('b')] };

    const makeCtx = (
      owner: string,
      store: { msgs: ChatMessage[] }
    ): AssistantStreamCtx => ({
      mode: 'agent',
      ownerSessionId: owner,
      stepStartRef,
      turnNumberRef,
      sessionIdRef: { current: 'active-other' },
      loopSessionIdRef: { current: owner },
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
      updateSessionMessages: (id, updater) => {
        if (id === 'tab-a') storeA.msgs = updater(storeA.msgs);
        if (id === 'tab-b') storeB.msgs = updater(storeB.msgs);
      },
      getSessionMessages: (id) =>
        id === 'tab-a' ? storeA.msgs : id === 'tab-b' ? storeB.msgs : [],
      setPendingQuestions: vi.fn(),
      setShowClarifying: vi.fn(),
      setAwaitingUser: vi.fn(),
      setDebugTick: vi.fn(),
      setError: vi.fn(),
      promotePlanToReview: vi.fn()
    });

    const streamA = createAssistantStreamSession(makeCtx('tab-a', storeA));
    const streamB = createAssistantStreamSession(makeCtx('tab-b', storeB));

    // Comment: A interleaves content+reasoning — must stay one Thought, not s1/s2…
    streamA.onDelta({ reasoning: 'A think ' });
    streamA.onDelta({ content: 'A prose. ' });
    streamA.onDelta({ reasoning: 'A more ' });
    streamA.onDelta({ content: 'A more prose. ' });
    streamA.onDelta({ reasoning: 'A end' });

    streamB.onDelta({ reasoning: 'B only' });
    streamB.onDelta({ content: 'B prose must not seal B into multiple rows' });
    streamB.onDelta({ reasoning: ' B cont' });

    const aThoughts = (storeA.msgs[0].steps || []).filter(
      (s) => s.kind === 'thinking'
    );
    const bThoughts = (storeB.msgs[0].steps || []).filter(
      (s) => s.kind === 'thinking'
    );
    expect(aThoughts).toHaveLength(1);
    expect(aThoughts[0].id).toBe('tl_thinking_1');
    expect(aThoughts[0].detail).toBe('A think A more A end');
    expect(aThoughts[0].itemStatus).toBe('running');
    expect(storeA.msgs[0].content).toContain('A prose');

    expect(bThoughts).toHaveLength(1);
    expect(bThoughts[0].id).toBe('tl_thinking_1');
    expect(bThoughts[0].detail).toBe('B only B cont');
    // A must not have mutated B's detail / segment
    expect(storeB.msgs[0].content).toContain('B prose');
  });
});
