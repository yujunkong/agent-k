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
    expect(aSteps.map((s) => s.id)).toEqual(['tl_thinking_1', 'tl_thinking_1_s1']);
    expect(aSteps[1].detail).toBe('A2 after tools');
    expect(bSteps).toHaveLength(1);
    expect(bSteps[0].id).toBe('tl_thinking_1');
    expect(bSteps[0].detail).toBe('B1 B1b');
  });
});
