/// <reference types="node" />
/// <reference types="mocha" />
import * as assert from 'assert';
import { ChatSessionStore } from '../../../src/chat/ChatSessionStore';

/** Minimal localStorage stub for Node unit tests. */
function installLocalStorage(): void {
  const map = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear()
  };
}

suite('ChatSessionStore empty-session history', () => {
  setup(() => {
    installLocalStorage();
    localStorage.clear();
  });

  test('listHistory excludes empty New chat drafts', () => {
    const store = new ChatSessionStore();
    const empty = store.createEmpty('ask');
    store.saveMessages(empty.id, [], 'ask');
    assert.strictEqual(store.list().some((s) => s.id === empty.id), true);
    assert.strictEqual(store.listHistory().length, 0);

    store.saveMessages(
      empty.id,
      [
        {
          id: 'm1',
          role: 'user',
          content: 'hello world',
          status: 'complete',
          timestamp: Date.now()
        }
      ],
      'ask'
    );
    assert.strictEqual(store.listHistory().length, 1);
    assert.ok(store.listHistory()[0].title.includes('hello'));
  });

  test('createEmpty prunes other abandoned empties', () => {
    const store = new ChatSessionStore();
    const a = store.createEmpty('ask');
    const b = store.createEmpty('plan');
    assert.strictEqual(store.get(a.id), null);
    assert.ok(store.get(b.id));
    assert.strictEqual(store.list().filter((s) => s.messageCount === 0).length, 1);
  });

  test('exportMetasForHost skips empty drafts', () => {
    const store = new ChatSessionStore();
    store.createEmpty('agent');
    assert.deepStrictEqual(store.exportMetasForHost(), []);
  });

  test('applyHostHydration skips empty metas', () => {
    const store = new ChatSessionStore();
    store.createEmpty('agent');
    store.applyHostHydration([
      {
        id: 'sess-empty',
        title: 'New chat',
        mode: 'ask',
        messageCount: 0,
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'sess-real',
        title: 'Real chat',
        mode: 'plan',
        messageCount: 3,
        createdAt: 2,
        updatedAt: 2
      }
    ]);
    assert.strictEqual(store.get('sess-empty'), null);
    assert.ok(store.get('sess-real'));
  });
});
