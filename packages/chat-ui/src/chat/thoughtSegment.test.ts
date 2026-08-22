/**
 * Thought segment rotation — mid-timeline Thinking must not append into the first row.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createAssistantStreamSession,
  type AssistantStreamCtx
} from './assistantStreamSession';
import type { ChatMessage } from './types';
import { SessionStepStartMap, SessionTurnMap } from './sendEpoch';

function assistant(
  content = '',
  extra?: Partial<ChatMessage>
): ChatMessage {
  return {
    id: 'a1',
    role: 'assistant',
    content,
    timestamp: 1,
    status: 'streaming',
    ...extra
  };
}

function baseCtx(
  store: { msgs: ChatMessage[] },
  overrides: Partial<AssistantStreamCtx> = {}
): AssistantStreamCtx {
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
    promotePlanToReview: vi.fn(),
    ...overrides
  };
}

describe('thought segment rotation', () => {
  it('opens a new Thought id after tools (clearContent) instead of appending', () => {
    const store = { msgs: [assistant()] };
    const ctx = baseCtx(store);
    ctx.turnNumberRef.current.bump('sess');
    const { onDelta } = createAssistantStreamSession(ctx);

    onDelta({ reasoning: 'first dig ' });
    onDelta({ reasoning: 'more first' });
    let steps = store.msgs[0].steps || [];
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe('tl_thinking_1');
    expect(steps[0].detail).toBe('first dig more first');
    expect(steps[0].itemStatus).toBe('running');

    onDelta({
      clearContent: true,
      workEvent: {
        id: 'tl_tool_read_1',
        type: 'read',
        status: 'running',
        label: 'Reading',
        toolName: 'read_file'
      }
    });
    steps = store.msgs[0].steps || [];
    const thought1 = steps.find((s) => s.id === 'tl_thinking_1');
    expect(thought1?.itemStatus).toBe('done');

    onDelta({ reasoning: 'second dig after tools' });
    steps = store.msgs[0].steps || [];
    const thought2 = steps.find((s) => s.id === 'tl_thinking_1_s1');
    expect(thought2).toBeTruthy();
    expect(thought2?.detail).toBe('second dig after tools');
    expect(thought2?.itemStatus).toBe('running');
    expect(thought1?.detail).toBe('first dig more first');
  });

  it('tool.start clearContent+timeline upserts Grepped/Read detail (not bare verb)', () => {
    const store = { msgs: [assistant('will seal')] };
    const ctx = baseCtx(store);
    ctx.turnNumberRef.current.bump('sess');
    const { onDelta } = createAssistantStreamSession(ctx);

    onDelta({
      clearContent: true,
      sealTurn: 1,
      workEvent: {
        id: 'tl_grep_1',
        type: 'search',
        status: 'running',
        label: 'Grepping',
        toolName: 'grep',
        detail: 'liveProse|isStreaming in WorkTimeline.tsx'
      },
      timeline: {
        kind: 'searching',
        turn: 1,
        label: 'grep',
        toolName: 'grep',
        detail: 'liveProse|isStreaming in WorkTimeline.tsx',
        openPath: 'packages/chat-ui/src/chat/components/WorkTimeline.tsx',
        itemStatus: 'running',
        id: 'tl_grep_1'
      }
    });

    const steps = store.msgs[0].steps || [];
    const grep = steps.find((s) => s.id === 'tl_grep_1');
    expect(grep).toBeTruthy();
    expect(grep?.detail).toContain('liveProse|isStreaming');
    expect(grep?.openPath).toContain('WorkTimeline.tsx');
    expect(store.msgs[0].content).toBe('');
  });
});
