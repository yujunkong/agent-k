/**
 * SHARED-001 — host session meta used by ready/persist/hydrate (HOST-007 later).
 * Included here so protocol unions stay typed without depending on host.
 */

/** Lightweight session row for host ↔ webview sync. */
export interface HostSessionMeta {
  id: string;
  title: string;
  mode: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  summary?: string;
}

export interface HostSessionsPersistPayload {
  sessions: HostSessionMeta[];
  currentId: string | null;
}

export interface HostSessionsHydratePayload {
  sessions: HostSessionMeta[];
  currentId: string | null;
}
