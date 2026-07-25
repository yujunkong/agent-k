/**
 * DebugSessionStore - 디버그 세션 저장/불러오기 (C6-T27)
 */
import type { DebugState } from './DebugModeController';

export interface DebugSession {
  id: string;
  state: DebugState;
  logs: string[];
  reproduceScript?: string;
  patchSummary?: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'agent-k.debugSessions';
const MAX_SESSIONS = 10;

export class DebugSessionStore {
  private sessions: DebugSession[] = [];

  constructor() {
    this.load();
  }

  /**
   * Save current debug session
   */
  save(state: DebugState, logs: string[], reproduceScript?: string, patchSummary?: string): DebugSession {
    const session: DebugSession = {
      id: `debug-${Date.now()}`,
      state,
      logs,
      reproduceScript,
      patchSummary,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.sessions.unshift(session);
    if (this.sessions.length > MAX_SESSIONS) {
      this.sessions = this.sessions.slice(0, MAX_SESSIONS);
    }

    this.persist();
    return session;
  }

  /**
   * Load a session by ID
   */
  loadSession(id: string): DebugSession | undefined {
    return this.sessions.find(s => s.id === id);
  }

  /**
   * Get all saved sessions
   */
  getAllSessions(): DebugSession[] {
    return [...this.sessions];
  }

  /**
   * Delete a session
   */
  delete(id: string): void {
    this.sessions = this.sessions.filter(s => s.id !== id);
    this.persist();
  }

  /**
   * Export session as markdown
   */
  exportSession(id: string): string {
    const session = this.loadSession(id);
    if (!session) return '';

    const activeHyp = session.state.hypotheses.find(h => h.id === session.state.activeHypothesisId);
    
    return [
      '# Debug Session Report',
      '',
      `**Session**: ${session.id}`,
      `**Created**: ${new Date(session.createdAt).toISOString()}`,
      `**Stage**: ${session.state.stage}`,
      '',
      `### Hypotheses (${session.state.hypotheses.length})`,
      ...session.state.hypotheses.map(h =>
        `- **${h.title}**: ${h.status}${h.id === session.state.activeHypothesisId ? ' (active)' : ''}`
      ),
      '',
      `### Logs (${session.logs.length})`,
      ...session.logs.slice(-20).map(l => `- ${l}`),
      ...(session.logs.length > 20 ? [`- ... and ${session.logs.length - 20} more`] : []),
      '',
      ...(session.patchSummary ? [`### Patch\n\n${session.patchSummary}`] : []),
      '',
      '---',
      'Exported from Agent-K Debug Mode'
    ].join('\n');
  }

  private load(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) this.sessions = JSON.parse(stored);
    } catch { /* ignore */ }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.sessions));
    } catch { /* ignore */ }
  }
}
