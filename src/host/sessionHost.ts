import * as vscode from 'vscode';
import { RuntimeServices } from '../core/RuntimeServices';
import { fromHostSnapshot, toHostSnapshot } from '../session/HostSessionBridge';

/** ADDON-T07: summarize checkpoints (id/label/timestamp/turn/mode) → webview */
export function sendCheckpointList(webview: vscode.Webview | undefined): void {
  if (!webview) return;
  const mgr = RuntimeServices.getCheckpointManager();
  const checkpoints = mgr ? mgr.list() : [];
  void webview.postMessage({
    type: 'checkpoint.listResult',
    checkpoints: [...checkpoints]
      .reverse()
      .map((c) => ({
        id: c.id,
        label: c.label,
        timestamp: c.timestamp,
        turnNumber: c.metadata.turnNumber,
        mode: c.metadata.mode,
        trigger: c.metadata.trigger,
        fileCount: c.fileSnapshots.length
      }))
  });
}

/** ADDON-T06: SessionManager (workspaceState) → webview ChatSessionStore metas */
export function sendSessionHydration(webview: vscode.Webview | undefined): void {
  if (!webview) return;
  const mgr = RuntimeServices.getSessionManager();
  if (!mgr) return;
  const current = mgr.getCurrentSession();
  const { metas, currentId } = fromHostSnapshot({
    sessions: mgr.getAllSessions(),
    currentId: current?.id ?? null
  });
  void webview.postMessage({
    type: 'host.sessions.hydrate',
    sessions: metas,
    currentId
  });
}

/** ADDON-T06: webview ChatSessionStore metas → SessionManager (workspaceState) */
export function persistSessionsToHost(sessions: unknown[], currentId?: unknown): void {
  const mgr = RuntimeServices.getSessionManager();
  if (!mgr) return;
  const webviewMetas = sessions
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
    .map((s) => ({
      id: String(s.id ?? ''),
      title: String(s.title ?? 'Session'),
      mode: String(s.mode ?? 'agent'),
      messageCount: Number(s.messageCount) || 0,
      createdAt: Number(s.createdAt) || Date.now(),
      updatedAt: Number(s.updatedAt) || Date.now(),
      summary: s.summary != null ? String(s.summary) : undefined
    }))
    .filter((s) => s.id);
  const snapshot = toHostSnapshot(webviewMetas, currentId != null ? String(currentId) : null);
  for (const record of snapshot.sessions) {
    mgr.upsertFromChatMeta({
      id: record.id,
      title: record.label,
      mode: record.mode,
      messageCount: record.messageCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      summary: record.summary
    });
  }
  if (snapshot.currentId) mgr.setCurrentSession(snapshot.currentId);
}

export async function restoreCheckpoint(id: string, reason?: string): Promise<void> {
  try {
    const mgr = RuntimeServices.getCheckpointManager();
    if (!mgr) {
      void vscode.window.showWarningMessage(
        'Agent K: no checkpoint manager available to undo edits.'
      );
      return;
    }
    await mgr.restore(id);
    const ok =
      reason === 'inline-edit-reject'
        ? 'Agent K: Inline Edit rejected (checkpoint restored).'
        : 'Agent K: edits undone (checkpoint restored).';
    void vscode.window.showInformationMessage(ok);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Agent K: undo failed — ${msg}`);
  }
}
