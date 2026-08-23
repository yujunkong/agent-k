/**
 * SHARED-001 — host session meta used by ready/persist/hydrate (HOST-007 later).
 * Included here so protocol unions stay typed without depending on host.
 */

/** Chat tab vs subagent progress session (SUB-010 independent child). */
export type SessionKind = 'chat' | 'subagent';

/** Lightweight session row for host ↔ webview sync. */
export interface HostSessionMeta {
  id: string;
  title: string;
  mode: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  summary?: string;
  /** SUB-010 — child subagent session points at parent chat session. */
  parentSessionId?: string;
  kind?: SessionKind;
}

export interface HostSessionsPersistPayload {
  sessions: HostSessionMeta[];
  currentId: string | null;
}

export interface HostSessionsHydratePayload {
  sessions: HostSessionMeta[];
  currentId: string | null;
}

/** Stable child session id for a subagent task (host + webview). */
export function subagentSessionId(taskId: string): string {
  const id = String(taskId || '').trim();
  return id ? `sess-sub-${id}` : `sess-sub-unknown`;
}
