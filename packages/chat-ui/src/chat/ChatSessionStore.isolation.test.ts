/**
 * CHAT-007 — session tab isolation helpers (unit).
 */
import { describe, expect, it } from 'vitest';
import { ChatSessionStore, titleFromMessages } from './ChatSessionStore';
import type { ChatMessage } from './types';

function user(content: string): ChatMessage {
  return {
    id: `u_${content}`,
    role: 'user',
    content,
    timestamp: Date.now(),
    status: 'complete',
  };
}

describe('CHAT-007 session isolation', () => {
  it('switchTo updates getCurrentId synchronously before React paint', () => {
    const store = new ChatSessionStore();
    const a = store.createEmpty('agent');
    const b = store.createEmpty('agent');
    store.saveMessages(a.id, [user('hi')], 'agent', { setCurrent: false });
    store.saveMessages(b.id, [user('other')], 'agent', { setCurrent: false });
    expect(store.getCurrentId()).toBe(b.id);
    const loaded = store.switchTo(a.id);
    expect(loaded?.id).toBe(a.id);
    expect(store.getCurrentId()).toBe(a.id);
  });

  it('background saveMessages with setCurrent:false does not steal active id', () => {
    const store = new ChatSessionStore();
    const a = store.createEmpty('agent');
    const b = store.createEmpty('agent');
    store.switchTo(b.id);
    store.saveMessages(a.id, [user('from-a')], 'agent', { setCurrent: false });
    expect(store.getCurrentId()).toBe(b.id);
    expect(store.get(a.id)?.messages[0]?.content).toBe('from-a');
  });

  it('duplicate first-user lines share title stem (UI adds clock)', () => {
    expect(titleFromMessages([user('hi')])).toBe('hi');
    expect(titleFromMessages([user('hi')])).toBe('hi');
  });
});
