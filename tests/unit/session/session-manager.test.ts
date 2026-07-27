/**
 * ADDON-T06: SessionManager (host workspaceState persistence) unit tests
 */
import * as assert from 'assert';
import { SessionManager, type HostMemento } from '../../../src/session/SessionManager';

/** In-memory stand-in for vscode.Memento (workspaceState) */
function makeFakeMemento(): HostMemento & { store: Map<string, any> } {
  const store = new Map<string, any>();
  return {
    store,
    get: (key: string) => store.get(key),
    update: (key: string, value: any) => {
      store.set(key, value);
    }
  };
}

suite('ADDON-T06 SessionManager', () => {
  test('works in-memory without a memento (unit-test friendly)', () => {
    const mgr = new SessionManager();
    const s = mgr.createSession('Hello', 'agent');
    assert.strictEqual(mgr.getCurrentSession()?.id, s.id);
    assert.strictEqual(mgr.getSessionCount(), 1);
  });

  test('create/list/update/delete round-trip', () => {
    const mgr = new SessionManager();
    const a = mgr.createSession('A', 'agent');
    const b = mgr.createSession('B', 'plan');
    assert.strictEqual(mgr.getAllSessions().length, 2);
    assert.strictEqual(mgr.list().length, 2);

    mgr.updateSession(a.id, { label: 'A renamed' });
    assert.strictEqual(mgr.getAllSessions().find((s) => s.id === a.id)?.label, 'A renamed');

    assert.strictEqual(mgr.deleteSession(b.id), true);
    assert.strictEqual(mgr.getAllSessions().length, 1);
    assert.strictEqual(mgr.deleteSession('nope'), false);
  });

  test('persists to memento under agent-k.host.sessions and restores on new instance', () => {
    const memento = makeFakeMemento();
    const mgr1 = new SessionManager(memento);
    const s = mgr1.createSession('Persisted', 'agent');
    mgr1.setCurrentSession(s.id);

    assert.ok(memento.store.has('agent-k.host.sessions'));
    const raw = memento.store.get('agent-k.host.sessions');
    assert.ok(Array.isArray(raw.sessions));
    assert.strictEqual(raw.sessions.length, 1);

    // Fresh instance sharing the same memento restores prior state
    const mgr2 = new SessionManager(memento);
    assert.strictEqual(mgr2.getSessionCount(), 1);
    assert.strictEqual(mgr2.getCurrentSession()?.id, s.id);
  });

  test('tolerates a corrupt/missing memento value', () => {
    const memento: HostMemento = {
      get: () => {
        throw new Error('boom');
      },
      update: () => undefined
    };
    const mgr = new SessionManager(memento);
    assert.strictEqual(mgr.getSessionCount(), 0);
  });

  test('trims to 50 sessions max', () => {
    const mgr = new SessionManager();
    for (let i = 0; i < 60; i++) {
      mgr.createSession(`s${i}`, 'agent');
    }
    assert.strictEqual(mgr.getSessionCount(), 50);
  });

  test('upsertFromChatMeta creates then updates a host record from ChatSessionStore meta', () => {
    const memento = makeFakeMemento();
    const mgr = new SessionManager(memento);
    const meta = {
      id: 'sess-abc',
      title: 'Webview chat',
      mode: 'agent',
      messageCount: 3,
      createdAt: 1000,
      updatedAt: 2000
    };
    const created = mgr.upsertFromChatMeta(meta);
    assert.strictEqual(created.label, 'Webview chat');
    assert.strictEqual(created.messageCount, 3);

    const updated = mgr.upsertFromChatMeta({
      ...meta,
      title: 'Renamed chat',
      messageCount: 5,
      updatedAt: 3000
    });
    assert.strictEqual(updated.label, 'Renamed chat');
    assert.strictEqual(updated.messageCount, 5);
    assert.strictEqual(updated.createdAt, 1000, 'createdAt preserved across upserts');
    assert.strictEqual(mgr.getSessionCount(), 1, 'same id upserts in place, no duplicate');
  });

  test('setChangeListener fires on create/update/delete', () => {
    const mgr = new SessionManager();
    let calls = 0;
    mgr.setChangeListener(() => {
      calls += 1;
    });
    const s = mgr.createSession('x');
    mgr.updateSession(s.id, { label: 'y' });
    mgr.deleteSession(s.id);
    assert.strictEqual(calls, 3);
  });
});
