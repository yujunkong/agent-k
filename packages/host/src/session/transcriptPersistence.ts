/**
 * V31-CTX-01 — Reload survival for the session transcript.
 * The in-memory store stays the runtime source; this memento is the copy that
 * outlives an extension host restart. Shares the workspaceState memento used
 * by session todos.
 */
import type { Memento } from 'vscode';
import type { AgentMessage } from '@agent-k/core';
import { sessionTranscriptStore } from './SessionTranscriptStore';

const KEY = 'agent-k.sessionTranscripts';

let memento: Memento | undefined;

/** Load every saved transcript into the store. Safe to call once at activate. */
export function bindTranscriptPersistence(state: Memento): void {
  memento = state;
  const saved = state.get<Record<string, AgentMessage[]>>(KEY);
  if (!saved) return;
  for (const [id, messages] of Object.entries(saved)) {
    if (Array.isArray(messages)) sessionTranscriptStore.replace(id, messages);
  }
}

/** Write the current session transcript back. No-op until bind. */
export function persistSessionTranscript(sessionId: string): void {
  if (!memento || !sessionId) return;
  const saved = { ...(memento.get<Record<string, AgentMessage[]>>(KEY) ?? {}) };
  saved[sessionId] = sessionTranscriptStore.get(sessionId);
  void memento.update(KEY, saved);
}
