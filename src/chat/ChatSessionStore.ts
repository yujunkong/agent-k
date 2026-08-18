/**
 * Multi-session chat persistence (webview localStorage).
 * Migrates legacy single-key `agent-k.chat.history` on first load.
 *
 * ADDON-T06: webview localStorage does not survive an Extension Host
 * restart. Host-side sync (meta + summary + messageCount only, not full
 * message bodies) is wired through `ChatViewProvider`, not here — this
 * class stays a pure webview-local store. See `applyHostHydration` /
 * `exportMetasForHost` and `src/session/HostSessionBridge.ts`.
 */
import type { ChatMessage, Mode } from './types';

export interface ChatSessionMeta {
  id: string;
  title: string;
  mode: Mode;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChatSession extends ChatSessionMeta {
  messages: ChatMessage[];
  /**
   * Cursor-style "active assistant variant" selection.
   * groupId -> active sibling index.
   *
   * Persisted per-session (not global) so tab switch / reload keeps UX.
   */
  activeVariants?: Record<string, number>;
}

const INDEX_KEY = 'agent-k.chat.sessions.index';
const CURRENT_KEY = 'agent-k.chat.sessions.current';
const OPEN_TABS_KEY = 'agent-k.chat.sessions.openTabs';
const LEGACY_KEY = 'agent-k.chat.history';
const PREFIX = 'agent-k.chat.sessions.';
const MAX_SESSIONS = 50;

function sessionKey(id: string): string {
  return `${PREFIX}${id}`;
}

function makeId(): string {
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function titleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user' && m.content?.trim());
  if (!firstUser) return 'New chat';
  const line = firstUser.content.trim().split(/\n/)[0].replace(/\s+/g, ' ');
  return line.length > 48 ? `${line.slice(0, 46)}…` : line;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export class ChatSessionStore {
  private index: string[] = [];
  private currentId: string | null = null;

  constructor() {
    this.index = readJson<string[]>(INDEX_KEY, []);
    this.currentId = localStorage.getItem(CURRENT_KEY);
    this.migrateLegacy();
    if (!this.currentId || !this.index.includes(this.currentId)) {
      if (this.index.length > 0) {
        this.currentId = this.index[0];
        this.persistCurrent();
      }
    }
  }

  getCurrentId(): string | null {
    return this.currentId;
  }

  /**
   * Tabs the user left open (not the full history list).
   * Does not force-include current — closing a tab must stick.
   */
  getOpenTabIds(): string[] {
    const stored = readJson<string[]>(OPEN_TABS_KEY, []);
    const valid = stored.filter((id) => this.index.includes(id));
    if (valid.length === 0 && this.currentId && this.index.includes(this.currentId)) {
      return [this.currentId];
    }
    return valid;
  }

  setOpenTabIds(ids: string[]): void {
    // Persist exactly what the UI closed/opened — never re-add currentId
    const valid = ids.filter((id) => this.index.includes(id));
    writeJson(OPEN_TABS_KEY, valid);
  }

  list(): ChatSessionMeta[] {
    const out: ChatSessionMeta[] = [];
    for (const id of this.index) {
      const s = this.readSession(id);
      if (!s) continue;
      out.push({
        id: s.id,
        title: s.title,
        mode: s.mode,
        messageCount: s.messageCount,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): ChatSession | null {
    return this.readSession(id);
  }

  /** Load current session or create an empty one. */
  loadActive(): ChatSession {
    if (this.currentId) {
      const existing = this.readSession(this.currentId);
      if (existing) return existing;
    }
    return this.createEmpty('agent');
  }

  createEmpty(mode: Mode = 'agent'): ChatSession {
    const now = Date.now();
    const session: ChatSession = {
      id: makeId(),
      title: 'New chat',
      mode,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
      messages: [],
      activeVariants: {}
    };
    this.writeSession(session);
    this.index = [session.id, ...this.index.filter((id) => id !== session.id)];
    this.trimExcess();
    this.persistIndex();
    this.currentId = session.id;
    this.persistCurrent();
    return session;
  }

  /**
   * Fork: new session with a copy of messages up to a point (Cursor-style).
   * Does not mutate the source session.
   */
  forkFromMessages(messages: ChatMessage[], mode: Mode = 'agent'): ChatSession {
    const now = Date.now();
    const cloned = messages.map((m) => ({
      ...m,
      status:
        m.status === 'streaming'
          ? ('complete' as const)
          : m.status
    }));
    const session: ChatSession = {
      id: makeId(),
      title: titleFromMessages(cloned) || 'Forked chat',
      mode,
      messageCount: cloned.length,
      createdAt: now,
      updatedAt: now,
      messages: cloned,
      // New session starts with a fresh active variant selection.
      activeVariants: {}
    };
    this.writeSession(session);
    this.index = [session.id, ...this.index.filter((id) => id !== session.id)];
    this.trimExcess();
    this.persistIndex();
    this.currentId = session.id;
    this.persistCurrent();
    return session;
  }

  /** Persist messages for a session. Default keeps it current (legacy behavior). */
  saveMessages(
    id: string,
    messages: ChatMessage[],
    mode?: Mode,
    opts?: { setCurrent?: boolean }
  ): void {
    const prev = this.readSession(id);
    const now = Date.now();
    const session: ChatSession = {
      id,
      title: titleFromMessages(messages) || prev?.title || 'New chat',
      mode: mode || prev?.mode || 'agent',
      messageCount: messages.length,
      createdAt: prev?.createdAt || now,
      updatedAt: now,
      messages,
      activeVariants: prev?.activeVariants ?? {}
    };
    this.writeSession(session);
    if (!this.index.includes(id)) {
      this.index = [id, ...this.index];
      this.trimExcess();
      this.persistIndex();
    } else {
      // bump to front of index for recency
      this.index = [id, ...this.index.filter((x) => x !== id)];
      this.persistIndex();
    }
    if (opts?.setCurrent !== false) {
      this.currentId = id;
      this.persistCurrent();
    }
  }

  switchTo(id: string): ChatSession | null {
    const session = this.readSession(id);
    if (!session) return null;
    this.currentId = id;
    this.persistCurrent();
    return session;
  }

  /**
   * Persist "active assistant variant" selection for the session.
   * Does not touch message history.
   */
  setActiveVariants(id: string, activeVariants: Record<string, number>): void {
    const prev = this.readSession(id);
    if (!prev) return;
    const now = Date.now();

    const session: ChatSession = {
      ...prev,
      activeVariants,
      updatedAt: now,
      messageCount: prev.messages.length
    };

    this.writeSession(session);

    // bump recency
    if (!this.index.includes(id)) {
      this.index = [id, ...this.index];
      this.trimExcess();
      this.persistIndex();
    } else {
      this.index = [id, ...this.index.filter((x) => x !== id)];
      this.persistIndex();
    }

    this.currentId = id;
    this.persistCurrent();
  }

  /** ADDON-T06: metas to send host-ward on `host.sessions.persist` */
  exportMetasForHost(): ChatSessionMeta[] {
    return this.list();
  }

  /**
   * ADDON-T06: merge host-restored metas (SessionManager/workspaceState)
   * that are unknown locally — e.g. localStorage was cleared by an
   * Extension Host restart. Never overwrites a session this webview
   * already has (host only carries meta, not full message bodies).
   */
  applyHostHydration(metas: ChatSessionMeta[]): void {
    if (!Array.isArray(metas) || metas.length === 0) return;
    let changed = false;
    for (const meta of metas) {
      if (!meta?.id || this.index.includes(meta.id)) continue;
      if (this.readSession(meta.id)) continue;
      const session: ChatSession = {
        id: meta.id,
        title: meta.title || 'Restored chat',
        mode: meta.mode,
        messageCount: meta.messageCount,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        messages: [],
        activeVariants: {}
      };
      this.writeSession(session);
      this.index.push(meta.id);
      changed = true;
    }
    if (!changed) return;
    this.index.sort((a, b) => {
      const sa = this.readSession(a)?.updatedAt || 0;
      const sb = this.readSession(b)?.updatedAt || 0;
      return sb - sa;
    });
    this.trimExcess();
    this.persistIndex();
  }

  delete(id: string): ChatSession | null {
    try {
      localStorage.removeItem(sessionKey(id));
    } catch {
      /* ignore */
    }
    this.index = this.index.filter((x) => x !== id);
    this.persistIndex();

    if (this.currentId === id) {
      const nextId = this.index[0];
      if (nextId) {
        this.currentId = nextId;
        this.persistCurrent();
        return this.readSession(nextId);
      }
      return this.createEmpty('agent');
    }
    return this.currentId ? this.readSession(this.currentId) : null;
  }

  private migrateLegacy(): void {
    try {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (!legacy) return;
      if (this.index.length > 0) {
        localStorage.removeItem(LEGACY_KEY);
        return;
      }
      const messages = JSON.parse(legacy) as ChatMessage[];
      if (!Array.isArray(messages) || messages.length === 0) {
        localStorage.removeItem(LEGACY_KEY);
        return;
      }
      const now = Date.now();
      const session: ChatSession = {
        id: makeId(),
        title: titleFromMessages(messages),
        mode: 'agent',
        messageCount: messages.length,
        createdAt: messages[0]?.timestamp || now,
        updatedAt: now,
        messages
      };
      this.writeSession(session);
      this.index = [session.id];
      this.currentId = session.id;
      this.persistIndex();
      this.persistCurrent();
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore corrupt legacy */
    }
  }

  private readSession(id: string): ChatSession | null {
    const data = readJson<ChatSession | null>(sessionKey(id), null);
    if (!data || !data.id) return null;
    if (!Array.isArray(data.messages)) data.messages = [];
    if (data.activeVariants == null || typeof data.activeVariants !== 'object') {
      data.activeVariants = {};
    }
    return data;
  }

  private writeSession(session: ChatSession): void {
    writeJson(sessionKey(session.id), session);
  }

  private persistIndex(): void {
    writeJson(INDEX_KEY, this.index);
  }

  private persistCurrent(): void {
    try {
      if (this.currentId) localStorage.setItem(CURRENT_KEY, this.currentId);
      else localStorage.removeItem(CURRENT_KEY);
    } catch {
      /* ignore */
    }
  }

  private trimExcess(): void {
    if (this.index.length <= MAX_SESSIONS) return;
    const drop = this.index.slice(MAX_SESSIONS);
    this.index = this.index.slice(0, MAX_SESSIONS);
    for (const id of drop) {
      try {
        localStorage.removeItem(sessionKey(id));
      } catch {
        /* ignore */
      }
    }
  }
}
