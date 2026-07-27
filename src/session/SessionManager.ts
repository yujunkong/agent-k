/**
 * SessionManager - 세션 저장/복원/리스트/삭제 (C4-T29 / ADDON-T06)
 *
 * Extension host 영속: optional vscode.Memento (workspaceState)로 세션 메타를
 * 저장한다. Memento 없이도(단위 테스트) in-memory로 동작.
 */
export interface Session {
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

/**
 * Duck-typed subset of vscode.Memento — avoids importing the `vscode`
 * module so this class stays testable outside the extension host.
 */
export interface HostMemento {
  get: (key: string) => any;
  update: (key: string, value: any) => Thenable<void> | void;
}

/** Shape persisted under STORAGE_KEY in the host Memento */
interface PersistedState {
  sessions: Session[];
  currentId: string | null;
}

/** ChatSessionStore (webview) meta shape — kept loose to avoid a circular import */
export interface ChatMetaLike {
  id: string;
  title: string;
  mode: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  summary?: string;
}

const MAX_SESSIONS = 50;
const STORAGE_KEY = 'agent-k.host.sessions';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private currentSessionId: string | null = null;
  private onChange: ((sessions: Session[]) => void) | null = null;
  private readonly memento?: HostMemento;

  constructor(memento?: HostMemento) {
    this.memento = memento;
    this.loadFromStorage();
  }

  setChangeListener(listener: (sessions: Session[]) => void): void {
    this.onChange = listener;
  }

  createSession(label?: string, mode = 'agent'): Session {
    const session: Session = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: label || `Session ${new Date().toLocaleString()}`,
      mode,
      messageCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.sessions.set(session.id, session);
    this.currentSessionId = session.id;
    this.trimExcess();
    this.saveToStorage();
    this.notify();
    return session;
  }

  getCurrentSession(): Session | null {
    if (!this.currentSessionId) return null;
    return this.sessions.get(this.currentSessionId) || null;
  }

  setCurrentSession(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      this.currentSessionId = sessionId;
      this.saveToStorage();
    }
  }

  updateSession(sessionId: string, updates: Partial<Session>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    Object.assign(session, updates, { updatedAt: Date.now() });
    this.saveToStorage();
    this.notify();
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Alias for getAllSessions — matches ChatSessionStore.list() naming */
  list(): Session[] {
    return this.getAllSessions();
  }

  deleteSession(sessionId: string): boolean {
    const result = this.sessions.delete(sessionId);
    if (result) {
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
      }
      this.saveToStorage();
      this.notify();
    }
    return result;
  }

  clearAll(): void {
    this.sessions.clear();
    this.currentSessionId = null;
    this.saveToStorage();
    this.notify();
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * ADDON-T06: sync a ChatSessionStore (webview) meta into the host record.
   * Pragmatic — persists meta/summary/messageCount, not full message bodies.
   */
  upsertFromChatMeta(meta: ChatMetaLike): Session {
    const existing = this.sessions.get(meta.id);
    const session: Session = {
      id: meta.id,
      label: meta.title || existing?.label || 'Session',
      mode: meta.mode || existing?.mode || 'agent',
      messageCount: meta.messageCount,
      createdAt: existing?.createdAt ?? meta.createdAt,
      updatedAt: meta.updatedAt,
      modelId: existing?.modelId,
      tokenCount: existing?.tokenCount,
      summary: meta.summary ?? existing?.summary
    };
    this.sessions.set(session.id, session);
    this.trimExcess();
    this.saveToStorage();
    this.notify();
    return session;
  }

  private trimExcess(): void {
    if (this.sessions.size <= MAX_SESSIONS) return;

    const sorted = Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const toRemove = sorted.slice(MAX_SESSIONS);

    for (const session of toRemove) {
      this.sessions.delete(session.id);
    }
  }

  private loadFromStorage(): void {
    if (!this.memento) return;
    try {
      const stored = this.memento.get(STORAGE_KEY) as PersistedState | undefined;
      if (stored && Array.isArray(stored.sessions)) {
        for (const s of stored.sessions) {
          if (s && s.id) this.sessions.set(s.id, s);
        }
        this.currentSessionId = stored.currentId ?? null;
      }
    } catch {
      /* corrupt/unavailable storage — start empty */
    }
  }

  private saveToStorage(): void {
    if (!this.memento) return;
    try {
      const state: PersistedState = {
        sessions: Array.from(this.sessions.values()),
        currentId: this.currentSessionId
      };
      void this.memento.update(STORAGE_KEY, state);
    } catch {
      /* quota / readonly memento */
    }
  }

  private notify(): void {
    this.onChange?.(this.getAllSessions());
  }
}
