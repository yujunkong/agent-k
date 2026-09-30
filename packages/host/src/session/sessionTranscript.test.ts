/**
 * V31-CTX-01 — SessionTranscriptStore + workspaceState round-trip.
 * Verifies tool results / tool-call pairing survive between sends.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import type { Memento } from 'vscode';
import type { AgentMessage } from '@agent-k/core';
import { SessionTranscriptStore, sessionTranscriptStore } from './SessionTranscriptStore';
import {
  bindTranscriptPersistence,
  persistSessionTranscript,
} from './transcriptPersistence';

function memoryMemento(initial?: Record<string, AgentMessage[]>): Memento {
  const bag = new Map<string, unknown>();
  if (initial) bag.set('agent-k.sessionTranscripts', initial);
  return {
    keys: () => [...bag.keys()],
    get: <T>(key: string, defaultValue?: T) =>
      (bag.has(key) ? bag.get(key) : defaultValue) as T,
    update: async (key: string, value: unknown) => {
      bag.set(key, value);
    },
  };
}

const sample: AgentMessage[] = [
  { role: 'user', content: 'read the file' },
  {
    role: 'assistant',
    content: '',
    toolCalls: [{ id: 'c1', name: 'read_file', arguments: { path: 'a.ts' } }],
  },
  {
    role: 'tool',
    content: 'export const x = 1;',
    toolCallId: 'c1',
    name: 'read_file',
    metadata: { toolName: 'read_file', type: 'tool_result' },
  },
];

describe('V31-CTX-01 SessionTranscriptStore', () => {
  it('keeps tool results and tool-call pairing', () => {
    const store = new SessionTranscriptStore();
    store.replace('s1', sample);
    const got = store.get('s1');
    expect(got).toHaveLength(3);
    expect(got[2]?.role).toBe('tool');
    expect(got[2]?.toolCallId).toBe('c1');
    expect(got[1]?.toolCalls?.[0]?.id).toBe('c1');
  });

  it('append trims oldest messages past the cap', () => {
    const store = new SessionTranscriptStore();
    const many = Array.from({ length: 250 }, (_, i) => ({
      role: 'user' as const,
      content: `m${i}`,
    }));
    store.append('s2', many);
    const got = store.get('s2');
    expect(got).toHaveLength(200);
    expect(got[got.length - 1]?.content).toBe('m249');
    expect(got[0]?.content).toBe('m50');
  });

  it('get returns a copy (mutation does not leak)', () => {
    const store = new SessionTranscriptStore();
    store.replace('s3', sample);
    const got = store.get('s3');
    got.push({ role: 'user', content: 'extra' });
    expect(store.get('s3')).toHaveLength(3);
  });

  it('has() distinguishes unknown vs empty session', () => {
    const store = new SessionTranscriptStore();
    expect(store.has('nope')).toBe(false);
    store.replace('empty', []);
    expect(store.has('empty')).toBe(true);
  });
});

describe('V31-CTX-01 transcriptPersistence', () => {
  const sessionId = 'transcript-test-session';

  beforeEach(() => {
    sessionTranscriptStore.clear(sessionId);
  });

  it('hydrates saved transcript into the store on bind', () => {
    bindTranscriptPersistence(memoryMemento({ [sessionId]: sample }));
    expect(sessionTranscriptStore.get(sessionId)).toEqual(sample);
  });

  it('writes the live transcript back on persist', async () => {
    const state = memoryMemento();
    bindTranscriptPersistence(state);
    sessionTranscriptStore.replace(sessionId, sample);
    persistSessionTranscript(sessionId);
    await Promise.resolve();
    const stored = state.get<Record<string, AgentMessage[]>>(
      'agent-k.sessionTranscripts',
    );
    expect(stored?.[sessionId]).toEqual(sample);
  });
});
