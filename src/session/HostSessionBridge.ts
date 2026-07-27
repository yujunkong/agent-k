/**
 * HostSessionBridge (ADDON-T06) — pure mapping helpers between
 * ChatSessionStore (webview, localStorage) session metadata and
 * SessionManager (extension host, vscode.Memento) session records.
 *
 * No side effects, no `vscode` import — safe for unit tests and for
 * bundling into the webview.
 */

/** SessionManager.Session shape, duck-typed to avoid a circular import */
export interface HostSessionRecord {
  id: string;
  label: string;
  mode: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  modelId?: string;
  tokenCount?: number;
  summary?: string;
}

/** ChatSessionStore.ChatSessionMeta shape, duck-typed to avoid a circular import */
export interface WebviewSessionMeta {
  id: string;
  title: string;
  mode: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  summary?: string;
}

export interface HostSessionSnapshot {
  sessions: HostSessionRecord[];
  currentId: string | null;
}

/**
 * Webview → Host: `host.sessions.persist` wire payload.
 * `title` maps to `label` (SessionManager's field name).
 */
export function toHostSnapshot(
  sessions: WebviewSessionMeta[],
  currentId: string | null
): HostSessionSnapshot {
  return {
    sessions: (sessions || []).map((s) => ({
      id: s.id,
      label: s.title,
      mode: s.mode,
      messageCount: s.messageCount,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      summary: s.summary
    })),
    currentId: currentId ?? null
  };
}

/**
 * Host → Webview: `host.sessions.hydrate` wire payload → ChatSessionMeta[].
 * `label` maps back to `title`.
 */
export function fromHostSnapshot(
  snapshot: HostSessionSnapshot | null | undefined
): { metas: WebviewSessionMeta[]; currentId: string | null } {
  if (!snapshot || !Array.isArray(snapshot.sessions)) {
    return { metas: [], currentId: null };
  }
  return {
    metas: snapshot.sessions.map((s) => ({
      id: s.id,
      title: s.label,
      mode: s.mode,
      messageCount: s.messageCount,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      summary: s.summary
    })),
    currentId: snapshot.currentId ?? null
  };
}
