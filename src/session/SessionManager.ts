/**
 * SessionManager - 세션 저장/복원/리스트/삭제 (C4-T29)
 * 
 * workspaceState 기반 세션 관리
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

const MAX_SESSIONS = 50;
const STORAGE_PREFIX = 'agent-k.session.';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private currentSessionId: string | null = null;
  private onChange: ((sessions: Session[]) => void) | null = null;

  constructor() {
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
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}index`);
      if (stored) {
        const ids: string[] = JSON.parse(stored);
        for (const id of ids) {
          const data = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
          if (data) {
            this.sessions.set(id, JSON.parse(data));
          }
        }
      }
    } catch { /* storage not available */ }
  }

  private saveToStorage(): void {
    try {
      const ids = Array.from(this.sessions.keys());
      localStorage.setItem(`${STORAGE_PREFIX}index`, JSON.stringify(ids));
      for (const [id, session] of this.sessions) {
        localStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify(session));
      }
    } catch { /* storage not available */ }
  }

  private notify(): void {
    this.onChange?.(this.getAllSessions());
  }
}
