/**
 * CHAT-007 — mode / modeAuto / provider park helpers.
 */
import { describe, expect, it } from 'vitest';
import { ChatSessionStore } from './ChatSessionStore';

describe('CHAT-007 composer chrome isolation', () => {
  it('setMode persists mode + modeAuto without stealing currentId', () => {
    const store = new ChatSessionStore();
    const a = store.createEmpty('agent');
    const b = store.createEmpty('ask');
    store.switchTo(b.id);
    store.setMode(a.id, 'plan', { modeAuto: false });
    expect(store.getCurrentId()).toBe(b.id);
    expect(store.get(a.id)?.mode).toBe('plan');
    expect(store.get(a.id)?.modeAuto).toBe(false);
    expect(store.get(b.id)?.mode).toBe('ask');
  });

  it('createEmpty defaults modeAuto true', () => {
    const store = new ChatSessionStore();
    const s = store.createEmpty('agent');
    expect(s.modeAuto).toBe(true);
  });

  it('setProvider keeps other tab model intact', () => {
    const store = new ChatSessionStore();
    const a = store.createEmpty('agent');
    const b = store.createEmpty('agent');
    store.setProvider(a.id, { model: 'model-a', thinkingEffort: 'high' });
    store.setProvider(b.id, { model: 'model-b', thinkingEffort: 'low' });
    store.switchTo(b.id);
    expect(store.get(a.id)?.provider?.model).toBe('model-a');
    expect(store.get(b.id)?.provider?.model).toBe('model-b');
  });
});
