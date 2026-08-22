/**
 * STREAM-001 — Assistant stream session (webview): owner-tab routing + settle.
 * Package: chat-ui only (표시). core STREAM runtime is separate (REL / loop).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createAssistantStreamSession,
  dedupeAssistantBody,
  type AssistantStreamCtx
} from './assistantStreamSession';
import { SessionStepStartMap, SessionTurnMap } from './sendEpoch';
import type { ChatMessage } from './types';

function assistant(
  content: string,
  status: ChatMessage['status'] = 'streaming',
  extra?: Partial<ChatMessage>
): ChatMessage {
  return {
    id: 'a1',
    role: 'assistant',
    content,
    timestamp: 1,
    status,
    ...extra
  };
}

function baseCtx(overrides: Partial<AssistantStreamCtx> = {}): AssistantStreamCtx {
  const messagesByOwner = new Map<string, ChatMessage[]>();
  messagesByOwner.set('sess-owner', [assistant('')]);
  messagesByOwner.set('sess-active', [assistant('other-tab')]);

  const ctx: AssistantStreamCtx = {
    mode: 'agent',
    stepStartRef: { current: new SessionStepStartMap() },
    turnNumberRef: { current: new SessionTurnMap() },
    sessionIdRef: { current: 'sess-active' },
    loopSessionIdRef: { current: 'sess-owner' },
    parkedAwaitingRef: { current: null },
    messagesRef: { current: [] },
    planStageRef: { current: 'idle' },
    pendingQuestionsRef: { current: [] },
    promotePlanOnCompleteRef: { current: false },
    planController: {
      enterQuestionsStage: () => undefined,
      addQuestion: () => undefined,
      getQuestions: () => []
    },
    debugController: {
      getStage: () => 'idle',
      getHypotheses: () => [],
      addHypothesis: () => undefined,
      syncStageFromHost: () => undefined
    },
    planSessionHasPlan: () => false,
    setMessages: vi.fn(),
    updateSessionMessages: (sessionId, updater) => {
      const prev = messagesByOwner.get(sessionId) || [];
      messagesByOwner.set(sessionId, updater(prev));
    },
    getSessionMessages: (sessionId) => messagesByOwner.get(sessionId) || [],
    ownerSessionId: 'sess-owner',
    setPendingQuestions: vi.fn(),
    setShowClarifying: vi.fn(),
    setAwaitingUser: vi.fn(),
    setDebugTick: vi.fn(),
    setError: vi.fn(),
    promotePlanToReview: vi.fn(),
    ...overrides
  };
  return ctx;
}

describe('STREAM-001 dedupeAssistantBody', () => {
  it('drops turnProse that duplicates final body', () => {
    const msg = assistant('Hello world answer', 'complete', {
      turnProse: [{ id: 'p1', content: 'Hello world answer', turn: 1 }]
    });
    const out = dedupeAssistantBody(msg);
    expect(out.turnProse).toEqual([]);
  });

  it('keeps unrelated turnProse', () => {
    const msg = assistant('Final body', 'complete', {
      turnProse: [{ id: 'p1', content: 'Earlier sealed lead about something else', turn: 1 }]
    });
    const out = dedupeAssistantBody(msg);
    expect(out.turnProse?.length).toBe(1);
  });
});

describe('STREAM-001 createAssistantStreamSession owner routing', () => {
  it('routes content deltas to ownerSessionId, not the active tab', () => {
    const ctx = baseCtx();
    const { onDelta } = createAssistantStreamSession(ctx);
    onDelta({ content: 'hello' });
    expect(ctx.getSessionMessages('sess-owner')[0].content).toBe('hello');
    expect(ctx.getSessionMessages('sess-active')[0].content).toBe('other-tab');
  });

  it('ignores deltas when isStale (superseded turn)', () => {
    const ctx = baseCtx({ isStale: () => true });
    const { onDelta } = createAssistantStreamSession(ctx);
    onDelta({ content: 'should-not-apply' });
    expect(ctx.getSessionMessages('sess-owner')[0].content).toBe('');
  });

  it('onComplete settles owner streaming even when isStale (tab switch)', () => {
    const ctx = baseCtx({ isStale: () => true });
    ctx.updateSessionMessages('sess-owner', () => [assistant('partial')]);
    const { onComplete } = createAssistantStreamSession(ctx);
    onComplete();
    const settled = ctx.getSessionMessages('sess-owner')[0];
    expect(settled.status).toBe('complete');
    expect(settled.content).toBe('partial');
    // Clarifying chrome only for active owner
    expect(ctx.setAwaitingUser).not.toHaveBeenCalled();
  });

  it('onError paints owner error even when isStale', () => {
    const ctx = baseCtx({ isStale: () => true });
    const { onError } = createAssistantStreamSession(ctx);
    onError('boom');
    const msg = ctx.getSessionMessages('sess-owner')[0];
    expect(msg.status).toBe('error');
    expect(msg.content).toContain('boom');
  });

  it('replaceContent never shrinks a longer UI body (out-of-order catch-up)', () => {
    const ctx = baseCtx();
    ctx.updateSessionMessages('sess-owner', () => [assistant('already longer text')]);
    const { onDelta } = createAssistantStreamSession(ctx);
    onDelta({ replaceContent: 'already' });
    expect(ctx.getSessionMessages('sess-owner')[0].content).toBe('already longer text');
    onDelta({ replaceContent: 'already longer text plus' });
    expect(ctx.getSessionMessages('sess-owner')[0].content).toBe(
      'already longer text plus'
    );
  });
});
