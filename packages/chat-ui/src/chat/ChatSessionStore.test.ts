/**
 * CHAT-007 — ChatSessionStore provider + subagent tabs (ported from v2.1).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { ChatSessionStore } from './ChatSessionStore';
import type { ChatMessage } from './types';

function msg(role: 'user' | 'assistant', content: string): ChatMessage {
  return {
    id: `m-${role}-${content}`,
    role,
    content,
    timestamp: Date.now(),
    status: 'complete'
  };
}

describe('ChatSessionStore provider', () => {
  let store: ChatSessionStore;

  beforeEach(() => {
    localStorage.clear();
    store = new ChatSessionStore();
  });

  it('setProvider merges without wiping messages', () => {
    const session = store.createEmpty('agent');
    store.saveMessages(session.id, [msg('user', 'hello')], 'agent');
    store.setProvider(session.id, {
      model: 'model-a',
      thinkingEffort: 'high',
      type: 'litellm',
      baseUrl: 'http://127.0.0.1:9',
      apiKey: 'k'
    });
    store.setProvider(session.id, { model: 'model-b' });

    const loaded = store.get(session.id);
    expect(loaded).toBeTruthy();
    expect(loaded!.messages).toHaveLength(1);
    expect(loaded!.provider?.model).toBe('model-b');
    expect(loaded!.provider?.thinkingEffort).toBe('high');
    expect(loaded!.provider?.baseUrl).toBe('http://127.0.0.1:9');
  });

  it('saveMessages preserves provider from prev', () => {
    const session = store.createEmpty('agent');
    store.setProvider(session.id, {
      model: 'keep-me',
      thinkingEffort: 'low'
    });
    store.saveMessages(session.id, [msg('user', 'next'), msg('assistant', 'ok')], 'agent');

    const loaded = store.get(session.id);
    expect(loaded).toBeTruthy();
    expect(loaded!.messages).toHaveLength(2);
    expect(loaded!.provider?.model).toBe('keep-me');
    expect(loaded!.provider?.thinkingEffort).toBe('low');
  });

  it('createEmpty / fork leave provider optional', () => {
    const empty = store.createEmpty('agent');
    expect(empty.provider).toBeUndefined();

    const forked = store.forkFromMessages([msg('user', 'fork')], 'agent');
    expect(forked.provider).toBeUndefined();
  });
});

describe('ChatSessionStore subagent tabs', () => {
  let store: ChatSessionStore;

  beforeEach(() => {
    localStorage.clear();
    store = new ChatSessionStore();
  });

  it('setSubagentTabs persists and filters orphaned sessions', () => {
    const session = store.createEmpty('agent');
    store.setSubagentTabs([
      { id: 'sub-1', title: 'Explore', parentSessionId: session.id },
      { id: 'sub-2', title: 'Orphan', parentSessionId: 'sess-missing' }
    ]);

    const loaded = store.getSubagentTabs();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('sub-1');
    expect(loaded[0].title).toBe('Explore');
  });

  it('delete session drops subagent tabs on next read via filter', () => {
    const session = store.createEmpty('agent');
    store.setSubagentTabs([
      { id: 'sub-1', title: 'Agent', parentSessionId: session.id }
    ]);
    store.delete(session.id);

    const fresh = new ChatSessionStore();
    expect(fresh.getSubagentTabs()).toHaveLength(0);
  });
  it('createSubagentSession is hidden from list and cascades on parent delete', () => {
    const parent = store.createEmpty('agent');
    const child = store.createSubagentSession({
      id: 'sess-sub-task1',
      parentSessionId: parent.id,
      title: 'Explore'
    });
    expect(child.kind).toBe('subagent');
    expect(child.parentSessionId).toBe(parent.id);
    expect(store.list().some((s) => s.id === child.id)).toBe(false);
    expect(store.get(child.id)?.id).toBe(child.id);

    store.delete(parent.id);
    expect(store.get(child.id)).toBeFalsy();
  });
});

describe('ChatSessionStore open tabs + host hydration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('setOpenTabIds / getOpenTabIds round-trip valid ids only', () => {
    const store = new ChatSessionStore();
    const a = store.createEmpty('agent');
    const b = store.createEmpty('agent');
    store.setOpenTabIds([a.id, b.id, 'sess-ghost']);
    expect(store.getOpenTabIds().sort()).toEqual([a.id, b.id].sort());
  });

  it('applyHostHydration adds unknown metas without overwriting local', () => {
    const store = new ChatSessionStore();
    const local = store.createEmpty('agent');
    store.saveMessages(local.id, [msg('user', 'keep')], 'agent');

    store.applyHostHydration([
      {
        id: local.id,
        title: 'Should not overwrite',
        mode: 'ask',
        messageCount: 99,
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'sess-from-host',
        title: 'Restored',
        mode: 'agent',
        messageCount: 0,
        createdAt: 2,
        updatedAt: 2
      }
    ]);

    expect(store.get(local.id)?.messages[0]?.content).toBe('keep');
    expect(store.get(local.id)?.title).not.toBe('Should not overwrite');
    expect(store.get('sess-from-host')?.title).toBe('Restored');
    expect(store.get('sess-from-host')?.messages).toEqual([]);
  });
});
