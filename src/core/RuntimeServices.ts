/**
 * RuntimeServices — extension.activate에서 주입하는 싱글톤 브리지.
 * AgentLoop / PlanStorage가 fake extension.exports 없이 실 인스턴스에 접근.
 * Comment: RW-C5-06-R2 / RW-C6-04-R2 / RW-C7-03-R2 완료 착각 방지용 배선.
 */
import type * as vscode from 'vscode';
import type { DebugLogServer } from '../debug/DebugLogServer';
import type { MCPClient } from '../mcp/MCPClient';
import type { MemoryStore } from '../memories/MemoryStore';
import type { PermissionGate } from '../permission/PermissionGate';
import type { CheckpointManager } from '../checkpoint/CheckpointManager';
import type { SessionManager } from '../session/SessionManager';
import type { SessionUsageTracker } from '../telemetry/StatusBarCost';

let workspaceState: vscode.Memento | undefined;
let debugLogServer: DebugLogServer | undefined;
let mcpClient: MCPClient | undefined;
let memoryStore: MemoryStore | undefined;
let permissionGate: PermissionGate | undefined;
let checkpointManager: CheckpointManager | undefined;
let sessionManager: SessionManager | undefined;
/** ADDON-T11: session token/cost tracker shared by AgentLoop → status bar */
let sessionUsageTracker: SessionUsageTracker | undefined;

/** Reproduce wait bridge (RW-C6-05-R2) */
type ReproduceResolver = (confirmed: boolean) => void;
let reproduceResolver: ReproduceResolver | undefined;
let reproduceReject: ((err: Error) => void) | undefined;

/** ask_question wait bridge (host ↔ webview; RW-C5-02) */
export interface PendingAskQuestion {
  id: string;
  question: string;
  options?: string[];
  required: boolean;
  /** Checkbox multi-select when true */
  allowMultiple?: boolean;
}
type AskQuestionResolver = (answer: string) => void;
type AskWaiter = {
  resolve: AskQuestionResolver;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  pending: PendingAskQuestion;
};
const askWaiters = new Map<string, AskWaiter>();
let askQuestionNotifier: ((q: PendingAskQuestion) => void) | undefined;

export const RuntimeServices = {
  setWorkspaceState(state: vscode.Memento): void {
    workspaceState = state;
  },

  getWorkspaceState(): vscode.Memento | undefined {
    return workspaceState;
  },

  setDebugLogServer(server: DebugLogServer): void {
    debugLogServer = server;
  },

  getDebugLogServer(): DebugLogServer | undefined {
    return debugLogServer;
  },

  setMcpClient(client: MCPClient): void {
    mcpClient = client;
  },

  getMcpClient(): MCPClient | undefined {
    return mcpClient;
  },

  /** RW-C7-09: extension.activate에서 MemoryStore 주입 */
  setMemoryStore(store: MemoryStore): void {
    memoryStore = store;
  },

  getMemoryStore(): MemoryStore | undefined {
    return memoryStore;
  },

  /** C4-T01: AgentLoop 쓰기 도구 직전 PermissionGate */
  setPermissionGate(gate: PermissionGate): void {
    permissionGate = gate;
  },

  getPermissionGate(): PermissionGate | undefined {
    return permissionGate;
  },

  /** C4-T03: checkpoint_create / restore 공유 인스턴스 */
  setCheckpointManager(mgr: CheckpointManager): void {
    checkpointManager = mgr;
  },

  getCheckpointManager(): CheckpointManager | undefined {
    return checkpointManager;
  },

  /** ADDON-T06: extension.activate에서 workspaceState 기반 SessionManager 주입 */
  setSessionManager(mgr: SessionManager): void {
    sessionManager = mgr;
  },

  getSessionManager(): SessionManager | undefined {
    return sessionManager;
  },

  /** ADDON-T11: extension.activate에서 주입, status bar가 읽어감 */
  setSessionUsageTracker(tracker: SessionUsageTracker): void {
    sessionUsageTracker = tracker;
  },

  getSessionUsageTracker(): SessionUsageTracker | undefined {
    return sessionUsageTracker;
  },

  /**
   * AgentLoop waits here until UI calls resolveReproduce.
   */
  waitForReproduce(timeoutMs = 300_000): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Clear any stale waiter
      if (reproduceReject) {
        reproduceReject(new Error('Superseded by new reproduce request'));
      }
      reproduceResolver = resolve;
      reproduceReject = reject;
      const timer = setTimeout(() => {
        reproduceResolver = undefined;
        reproduceReject = undefined;
        reject(new Error(`Reproduce timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const origResolve = resolve;
      reproduceResolver = (confirmed: boolean) => {
        clearTimeout(timer);
        reproduceResolver = undefined;
        reproduceReject = undefined;
        origResolve(confirmed);
      };
    });
  },

  resolveReproduce(confirmed: boolean): void {
    if (reproduceResolver) {
      reproduceResolver(confirmed);
    }
  },

  cancelReproduce(): void {
    if (reproduceReject) {
      reproduceReject(new Error('Reproduce cancelled'));
      reproduceResolver = undefined;
      reproduceReject = undefined;
    }
  },

  isReproducePending(): boolean {
    return typeof reproduceResolver === 'function';
  },

  /**
   * Extension host sets this so AskQuestionTool can postMessage to the webview.
   */
  setAskQuestionNotifier(cb: ((q: PendingAskQuestion) => void) | undefined): void {
    askQuestionNotifier = cb;
  },

  /**
   * Host AgentLoop waits here until webview posts chat.answer / cancel.
   * Multiple qids may wait in parallel (batched ask_question).
   */
  waitForQuestion(pending: PendingAskQuestion, timeoutMs = 600_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const existing = askWaiters.get(pending.id);
      if (existing) {
        clearTimeout(existing.timer);
        existing.reject(new Error('Superseded by new ask_question'));
        askWaiters.delete(pending.id);
      }
      const timer = setTimeout(() => {
        askWaiters.delete(pending.id);
        reject(new Error(`ask_question timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      askWaiters.set(pending.id, {
        resolve: (answer: string) => {
          clearTimeout(timer);
          askWaiters.delete(pending.id);
          resolve(answer);
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          askWaiters.delete(pending.id);
          reject(err);
        },
        timer,
        pending
      });
      if (!askQuestionNotifier) {
        const w = askWaiters.get(pending.id);
        if (w) {
          clearTimeout(w.timer);
          askWaiters.delete(pending.id);
        }
        reject(
          new Error(
            'ask_question: no UI bridge (notifier unset). Re-open Agent K chat and retry.'
          )
        );
        return;
      }
      try {
        askQuestionNotifier(pending);
      } catch (e) {
        const w = askWaiters.get(pending.id);
        if (w) {
          clearTimeout(w.timer);
          askWaiters.delete(pending.id);
        }
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  },

  resolveQuestion(qid: string, answer: string): void {
    const w = askWaiters.get(qid);
    if (w) {
      w.resolve(answer);
      return;
    }
    // Legacy: single pending mismatch — resolve newest if only one waiter
    if (askWaiters.size === 1) {
      const only = askWaiters.values().next().value as AskWaiter | undefined;
      only?.resolve(answer);
    }
  },

  cancelQuestion(reason = 'ask_question cancelled'): void {
    const err = new Error(reason);
    for (const w of askWaiters.values()) {
      clearTimeout(w.timer);
      w.reject(err);
    }
    askWaiters.clear();
  },

  getPendingQuestion(): PendingAskQuestion | undefined {
    const first = askWaiters.values().next().value as AskWaiter | undefined;
    return first?.pending;
  },

  getPendingQuestions(): PendingAskQuestion[] {
    return [...askWaiters.values()].map((w) => w.pending);
  },

  isAskQuestionPending(): boolean {
    return askWaiters.size > 0;
  }
};
