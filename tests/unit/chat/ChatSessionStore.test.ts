/**
 * Tab-scoped provider persistence on ChatSessionStore.
 */
import * as assert from 'assert';
import { ChatSessionStore } from '../../../src/chat/ChatSessionStore';
import type { ChatMessage } from '../../../src/chat/types';

/** Minimal localStorage for Node mocha (webview store uses window.localStorage). */
function installMemoryLocalStorage(): void {
  const map = new Map<string, string>();
  const storage = {
    get length() {
      return map.size;
    },
    key(i: number) {
      return [...map.keys()][i] ?? null;
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    }
  };
  (globalThis as { localStorage?: typeof storage }).localStorage = storage;
}

function msg(role: 'user' | 'assistant', content: string): ChatMessage {
  return {
    id: `m-${role}-${content}`,
    role,
    content,
    timestamp: Date.now(),
    status: 'complete'
  };
}

suite('ChatSessionStore provider', () => {
  let store: ChatSessionStore;

  setup(() => {
    installMemoryLocalStorage();
    store = new ChatSessionStore();
  });

  test('setProvider merges without wiping messages', () => {
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
    assert.ok(loaded);
    assert.strictEqual(loaded!.messages.length, 1);
    assert.strictEqual(loaded!.provider?.model, 'model-b');
    assert.strictEqual(loaded!.provider?.thinkingEffort, 'high');
    assert.strictEqual(loaded!.provider?.baseUrl, 'http://127.0.0.1:9');
  });

  test('saveMessages preserves provider from prev', () => {
    const session = store.createEmpty('agent');
    store.setProvider(session.id, {
      model: 'keep-me',
      thinkingEffort: 'low'
    });
    store.saveMessages(session.id, [msg('user', 'next'), msg('assistant', 'ok')], 'agent');

    const loaded = store.get(session.id);
    assert.ok(loaded);
    assert.strictEqual(loaded!.messages.length, 2);
    assert.strictEqual(loaded!.provider?.model, 'keep-me');
    assert.strictEqual(loaded!.provider?.thinkingEffort, 'low');
  });

  test('createEmpty / fork leave provider optional', () => {
    const empty = store.createEmpty('agent');
    assert.strictEqual(empty.provider, undefined);

    const forked = store.forkFromMessages([msg('user', 'fork')], 'agent');
    assert.strictEqual(forked.provider, undefined);
  });
});
