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
  it('opens a new mid Thought id after tools (clearContent) instead of appending', () => {
    const store = { msgs: [assistant()] };
    const ctx = baseCtx(store);
    ctx.turnNumberRef.current.bump('sess');
    const { onDelta } = createAssistantStreamSession(ctx);

    onDelta({ reasoning: 'first dig ' });
    onDelta({ reasoning: 'more first' });
    let steps = store.msgs[0].steps || [];
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe('tl_thinking_1');
    expect(steps[0].thoughtRole).toBe('opening');
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
    expect(thought1?.detail).toBe('first dig more first');

    onDelta({ reasoning: 'second dig after tools' });
    steps = store.msgs[0].steps || [];
    // Comment: post-tool reasoning → mid id (nests under Exploring), opening stays sealed
    const thoughts = steps.filter((s) => s.kind === 'thinking');
    expect(thoughts).toHaveLength(2);
    expect(thoughts[0].id).toBe('tl_thinking_1');
    expect(thoughts[0].detail).toBe('first dig more first');
    expect(thoughts[0].itemStatus).toBe('done');
    expect(thoughts[1].id).toBe('tl_thinking_1_s1');
    expect(thoughts[1].thoughtRole).toBe('mid');
    expect(thoughts[1].detail).toBe('second dig after tools');
    expect(thoughts[1].itemStatus).toBe('running');
  });

  it('explore Read then Think → mid Thought under Exploring (not top append)', () => {
    const store = { msgs: [assistant()] };
    const ctx = baseCtx(store);
    ctx.turnNumberRef.current.bump('sess');
    const { onDelta } = createAssistantStreamSession(ctx);

    onDelta({ reasoning: 'before read ' });
    onDelta({
      clearContent: true,
      sealTurn: 1,
      workEvent: {
        id: 'tl_read_1',
        type: 'read',
        status: 'running',
        label: 'Reading',
        toolName: 'read_file',
        detail: 'src/lib.rs L1-250'
      },
      timeline: {
        kind: 'reading',
        turn: 1,
        label: 'read_file',
        toolName: 'read_file',
        detail: 'src/lib.rs L1-250',
        itemStatus: 'running',
        id: 'tl_read_1'
      }
    });
    let steps = store.msgs[0].steps || [];
    expect(steps.find((s) => s.id === 'tl_thinking_1')?.itemStatus).toBe('done');

    onDelta({ reasoning: 'after read still thinking ' });
    onDelta({ reasoning: 'more after' });
    steps = store.msgs[0].steps || [];
    const thoughts = steps.filter((s) => s.kind === 'thinking');
    expect(thoughts).toHaveLength(2);
    expect(thoughts[0].id).toBe('tl_thinking_1');
    expect(thoughts[0].detail).toContain('before read');
    expect(thoughts[0].detail).not.toContain('after read');
    expect(thoughts[1].id).toBe('tl_thinking_1_s1');
    expect(thoughts[1].thoughtRole).toBe('mid');
    expect(thoughts[1].itemStatus).toBe('running');
    expect(thoughts[1].detail).toContain('after read still thinking');
    expect(thoughts[1].detail).toContain('more after');
  });

  it('edit/terminal also rotate mid Thought (no opening append spam)', () => {
    const store = { msgs: [assistant()] };
    const ctx = baseCtx(store);
    ctx.turnNumberRef.current.bump('sess');
    const { onDelta } = createAssistantStreamSession(ctx);

    onDelta({ reasoning: 'plan edit' });
    onDelta({
      clearContent: true,
      sealTurn: 1,
      timeline: {
        kind: 'editing',
        turn: 1,
        label: 'edit_file',
        toolName: 'edit_file',
        itemStatus: 'running',
        id: 'tl_edit_1'
      }
    });
    onDelta({ reasoning: 'after edit' });
    onDelta({
      clearContent: true,
      sealTurn: 1,
      timeline: {
        kind: 'running',
        turn: 1,
        label: 'run_terminal_cmd',
        toolName: 'run_terminal_cmd',
        itemStatus: 'running',
        id: 'tl_term_1'
      }
    });
    onDelta({ reasoning: 'after cargo' });
    const thoughts = (store.msgs[0].steps || []).filter(
      (s) => s.kind === 'thinking'
    );
    expect(thoughts).toHaveLength(3);
    expect(thoughts[0].id).toBe('tl_thinking_1');
    expect(thoughts[0].detail).toBe('plan edit');
    expect(thoughts[1].id).toBe('tl_thinking_1_s1');
    expect(thoughts[1].thoughtRole).toBe('mid');
    expect(thoughts[1].detail).toBe('after edit');
    expect(thoughts[2].id).toBe('tl_thinking_1_s2');
    expect(thoughts[2].thoughtRole).toBe('mid');
    expect(thoughts[2].detail).toBe('after cargo');
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

  it('keeps one live Thought across interleaved content+reasoning (no tools)', () => {
    const store = { msgs: [assistant()] };
    const ctx = baseCtx(store);
    ctx.turnNumberRef.current.bump('sess');
    const { onDelta, onComplete } = createAssistantStreamSession(ctx);

    onDelta({ reasoning: 'plan A ' });
    onDelta({ content: 'Let me check.\n' });
    onDelta({ reasoning: 'still planning ' });
    onDelta({ content: 'One more note. ' });
    onDelta({ reasoning: 'done thinking' });

    let steps = store.msgs[0].steps || [];
    const thoughts = steps.filter((s) => s.kind === 'thinking');
    expect(thoughts).toHaveLength(1);
    expect(thoughts[0].id).toBe('tl_thinking_1');
    expect(thoughts[0].itemStatus).toBe('running');
    expect(thoughts[0].durationMs).toBeUndefined();
    expect(thoughts[0].detail).toBe('plan A still planning done thinking');
    expect(store.msgs[0].content).toContain('Let me check');

    onComplete();
    steps = store.msgs[0].steps || [];
    const sealed = steps.find((s) => s.id === 'tl_thinking_1');
    expect(sealed?.itemStatus).toBe('done');
    expect(typeof sealed?.durationMs).toBe('number');
  });

  it('does not stamp durationMs on every reasoning chunk (stays Thinking)', () => {
    const store = { msgs: [assistant()] };
    const ctx = baseCtx(store);
    ctx.turnNumberRef.current.bump('sess');
    const { onDelta } = createAssistantStreamSession(ctx);

    onDelta({ reasoning: 'chunk1 ' });
    onDelta({ reasoning: 'chunk2 ' });
    onDelta({ reasoning: 'chunk3' });
    const step = (store.msgs[0].steps || [])[0];
    expect(step.itemStatus).toBe('running');
    expect(step.durationMs).toBeUndefined();
    expect(step.detail).toBe('chunk1 chunk2 chunk3');
  });
});
