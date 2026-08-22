/**
 * CHAT-007 — pure helpers for session-owned message updates (no React).
 * Mirrors useChatSessions.updateSessionMessages owner-guard rules.
 */
import { describe, expect, it } from 'vitest';
import { ChatSessionStore } from '../ChatSessionStore';
import { sanitizeLoadedMessages } from '../chatAppHelpers';
import type { ChatMessage } from '../types';

function user(content: string, id = `u_${content}`): ChatMessage {
  return {
    id,
    role: 'user',
    content,
    timestamp: Date.now(),
    status: 'complete'
  };
}

function assistant(content: string, id = `a_${content}`): ChatMessage {
  return {
    id,
    role: 'assistant',
    content,
    timestamp: Date.now(),
    status: 'streaming'
  };
}

/** Same routing as updateSessionMessages after the CHAT-007 owner-guard patch. */
function applyUpdate(opts: {
  store: ChatSessionStore;
  activeId: string;
  targetId: string;
  activeMessages: ChatMessage[];
  updater: (prev: ChatMessage[]) => ChatMessage[];
}): { activeMessages: ChatMessage[]; flushedToStore: boolean } {
  const { store, activeId, targetId, updater } = opts;
  let activeMessages = opts.activeMessages;
  if (targetId === activeId) {
    // Simulate deferred flush after a tab switch: activeId may have changed.
    // Caller passes the *flush-time* activeId.
    activeMessages = updater(activeMessages);
    return { activeMessages, flushedToStore: false };
  }
  const loaded = store.get(targetId);
  if (!loaded) return { activeMessages, flushedToStore: false };
  const base = sanitizeLoadedMessages(loaded.messages || []);
  store.saveMessages(targetId, updater(base), loaded.mode, { setCurrent: false });
  return { activeMessages, flushedToStore: true };
}

describe('CHAT-007 send/recv isolation routing', () => {
  it('background stream delta writes owner store without stealing currentId', () => {
    const store = new ChatSessionStore();
    const a = store.createEmpty('agent');
    const b = store.createEmpty('agent');
    store.saveMessages(a.id, [user('from-a')], 'agent', { setCurrent: false });
    store.switchTo(b.id);

    const result = applyUpdate({
      store,
      activeId: b.id,
      targetId: a.id,
      activeMessages: [user('on-b')],
      updater: (prev) => [...prev, assistant('delta-a')]
    });

    expect(result.flushedToStore).toBe(true);
    expect(store.getCurrentId()).toBe(b.id);
    expect(result.activeMessages.map((m) => m.content)).toEqual(['on-b']);
    expect(store.get(a.id)?.messages.map((m) => m.content)).toEqual([
      'from-a',
      'delta-a'
    ]);
  });

  it('deferred updater after tab switch must not paint owner-A onto active-B', () => {
    const store = new ChatSessionStore();
    const a = store.createEmpty('agent');
    const b = store.createEmpty('agent');
    store.saveMessages(a.id, [user('a0')], 'agent', { setCurrent: false });
    store.saveMessages(b.id, [user('b0')], 'agent', { setCurrent: false });
    store.switchTo(b.id);

    // Scheduled while A was active, flushed after switch to B:
    const scheduledTarget = a.id;
    const flushActive = b.id;
    let bMessages = [user('b0')];

    if (scheduledTarget !== flushActive) {
      const loaded = store.get(scheduledTarget)!;
      const next = [...sanitizeLoadedMessages(loaded.messages || []), assistant('late-a')];
      store.saveMessages(scheduledTarget, next, loaded.mode, { setCurrent: false });
    } else {
      bMessages = [...bMessages, assistant('late-a')];
    }

    expect(bMessages.map((m) => m.content)).toEqual(['b0']);
    expect(store.get(a.id)?.messages.map((m) => m.content)).toEqual(['a0', 'late-a']);
    expect(store.getCurrentId()).toBe(b.id);
  });

  it('active path chains two deltas without dropping the first', () => {
    let msgs: ChatMessage[] = [user('hi'), assistant('')];
    const append = (token: string) => {
      msgs = msgs.map((m, i) =>
        i === msgs.length - 1 && m.role === 'assistant'
          ? { ...m, content: m.content + token }
          : m
      );
    };
    append('Hel');
    append('lo');
    expect(msgs[1].content).toBe('Hello');
  });

  it('post-await send seed stays on owner when active tab differs', () => {
    const store = new ChatSessionStore();
    const a = store.createEmpty('agent');
    const b = store.createEmpty('agent');
    store.switchTo(b.id);
    const ownerId = a.id;
    const activeId = b.id;
    const nextMessages = [user('send-a'), assistant('')];

    if (activeId === ownerId) {
      throw new Error('should not paint');
    }
    store.saveMessages(ownerId, nextMessages, 'agent', { setCurrent: false });

    expect(store.getCurrentId()).toBe(b.id);
    expect(store.get(a.id)?.messages.map((m) => m.content)).toEqual(['send-a', '']);
    expect(store.get(b.id)?.messages ?? []).toEqual([]);
  });
});
