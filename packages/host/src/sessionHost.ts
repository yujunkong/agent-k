/**
 * HOST-007 — Session host (in-memory until SessionManager / SAFE-* land).
 */

import type {
  HostSessionMeta,
  HostSessionsHydratePayload,
  HostSessionsPersistPayload,
} from '@agent-k/shared';
import * as vscode from 'vscode';
import { hostLog } from './hostLog';

/** In-memory session bag (workspaceState persistence deferred to SessionManager). */
class HostSessionStore {
  private sessions = new Map<string, HostSessionMeta>();
  private currentId: string | null = null;

  hydrateFrom(
    sessions: HostSessionMeta[],
    currentId: string | null,
  ): void {
    this.sessions.clear();
    for (const s of sessions) {
      if (s.id) this.sessions.set(s.id, s);
    }
    this.currentId = currentId;
  }

  snapshot(): HostSessionsHydratePayload {
    return {
      sessions: [...this.sessions.values()].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
      currentId: this.currentId,
    };
  }
}

const sessionStore = new HostSessionStore();

/** Checkpoint list is empty until SAFE-006 CheckpointManager exists. */
export function sendCheckpointList(webview: vscode.Webview | undefined): void {
  if (!webview) return;
  void webview.postMessage({
    type: 'checkpoint.listResult',
    checkpoints: [],
  });
}

/** Push session metas to webview. */
export function sendSessionHydration(webview: vscode.Webview | undefined): void {
  if (!webview) return;
  const payload = sessionStore.snapshot();
  void webview.postMessage({
    type: 'host.sessions.hydrate',
    payload,
  });
}

/** Persist webview session metas into host store. */
export function persistSessionsToHost(
  payload: HostSessionsPersistPayload | undefined | null,
): void {
  // Tolerate flat legacy messages and missing payload — never throw into the router
  // (that aborted the whole webview message pump → chat.send looked dead).
  if (!payload || !Array.isArray(payload.sessions)) {
    hostLog(
      'sessions.persist crash guard',
      `skipped bad payload hasPayload=${Boolean(payload)} sessionsType=${payload ? typeof (payload as { sessions?: unknown }).sessions : 'n/a'}`,
      true,
    );
    return;
  }
  sessionStore.hydrateFrom(payload.sessions, payload.currentId);
}

/** Checkpoint restore stub (SAFE-006). */
export async function restoreCheckpoint(id: string, reason?: string): Promise<void> {
  void id;
  void reason;
  void vscode.window.showWarningMessage(
    'Agent K: checkpoint restore pending (SAFE-006).',
  );
}
