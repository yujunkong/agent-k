/**
 * CHAT-009 — New Chat session fork helpers (mirrors handleNewChat open-tab rules).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { ChatSessionStore } from './ChatSessionStore';
import { SLASH_COMMANDS } from './composerPalette';

/** Same open-tab ordering as useChatSessions.handleNewChat (CHAT-009). */
function openTabsAfterNewChat(
  prev: string[],
  leavingId: string,
  nextId: string
): string[] {
  const withLeaving = prev.includes(leavingId) ? prev : [leavingId, ...prev];
  return [nextId, ...withLeaving.filter((id) => id !== nextId)];
}

describe('CHAT-009 New Chat', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('createEmpty forks a blank session without touching the previous transcript', () => {
    const store = new ChatSessionStore();
    const leaving = store.createEmpty('agent');
    store.saveMessages(
      leaving.id,
      [
        {
          id: 'u1',
          role: 'user',
          content: 'keep me',
          timestamp: 1,
          status: 'complete'
        }
      ],
      'agent',
      { setCurrent: false }
    );

    const next = store.createEmpty('agent');
    expect(next.id).not.toBe(leaving.id);
    expect(next.messages).toEqual([]);
    expect(next.title).toBe('New chat');
    expect(store.get(leaving.id)?.messages[0]?.content).toBe('keep me');
    expect(store.getCurrentId()).toBe(next.id);
  });

  it('always opens a new tab even when leaving session is empty', () => {
    const store = new ChatSessionStore();
    const empty = store.createEmpty('agent');
    // Persist empty leaving tab (v3 CHAT-009: no early-return on empty)
    store.saveMessages(empty.id, [], 'agent', { setCurrent: false });
    const next = store.createEmpty('agent');
    const tabs = openTabsAfterNewChat([], empty.id, next.id);
    expect(tabs[0]).toBe(next.id);
    expect(tabs).toContain(empty.id);
    expect(tabs).toHaveLength(2);
  });

  it('puts new tab first and keeps other open tabs', () => {
    const tabs = openTabsAfterNewChat(['a', 'b'], 'a', 'c');
    expect(tabs).toEqual(['c', 'a', 'b']);
  });

  it('composer palette exposes newChat command', () => {
    expect(SLASH_COMMANDS.some((c) => c.action === 'newChat')).toBe(true);
  });
});
