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

let workspaceState: vscode.Memento | undefined;
let debugLogServer: DebugLogServer | undefined;
let mcpClient: MCPClient | undefined;
let memoryStore: MemoryStore | undefined;
let permissionGate: PermissionGate | undefined;
let checkpointManager: CheckpointManager | undefined;

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
}
type AskQuestionResolver = (answer: string) => void;
let askQuestionResolver: AskQuestionResolver | undefined;
let askQuestionReject: ((err: Error) => void) | undefined;
let askQuestionPending: PendingAskQuestion | undefined;
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
   */
  waitForQuestion(pending: PendingAskQuestion, timeoutMs = 600_000): Promise<string> {
    return new Promise((resolve, reject) => {
      if (askQuestionReject) {
        askQuestionReject(new Error('Superseded by new ask_question'));
      }
      askQuestionPending = pending;
      askQuestionReject = reject;
      const timer = setTimeout(() => {
        askQuestionResolver = undefined;
        askQuestionReject = undefined;
        askQuestionPending = undefined;
        reject(new Error(`ask_question timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      askQuestionResolver = (answer: string) => {
        clearTimeout(timer);
        askQuestionResolver = undefined;
        askQuestionReject = undefined;
        askQuestionPending = undefined;
        resolve(answer);
      };
      // Notify webview (extension posts chat.stream ask_question)
      try {
        askQuestionNotifier?.(pending);
      } catch {
        /* ignore notifier errors — waiter still blocks */
      }
    });
  },

  resolveQuestion(qid: string, answer: string): void {
    if (!askQuestionPending || askQuestionPending.id !== qid) {
      // Still resolve if only one pending (id mismatch from stale UI)
      if (!askQuestionResolver) return;
    }
    if (askQuestionResolver) {
      askQuestionResolver(answer);
    }
  },

  cancelQuestion(reason = 'ask_question cancelled'): void {
    if (askQuestionReject) {
      askQuestionReject(new Error(reason));
      askQuestionResolver = undefined;
      askQuestionReject = undefined;
      askQuestionPending = undefined;
    }
  },

  getPendingQuestion(): PendingAskQuestion | undefined {
    return askQuestionPending;
  },

  isAskQuestionPending(): boolean {
    return typeof askQuestionResolver === 'function';
  }
};
