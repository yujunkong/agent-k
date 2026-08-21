/**
 * HOST-002 — Chat send bridge (stub until AGENT-001 AgentLoopController).
 * Keeps abort maps + ChatSendContext shape so the full loop can drop in later.
 */

import type { ChatSendPayload, ChatStopPayload, RequestId } from '@agent-k/shared';
import * as vscode from 'vscode';

/** Deferred AgentLoopController slot (AGENT-001). */
export type HostLoopRuntime = {
  /** Opaque until core exports AgentLoopController. */
  loop: unknown;
  abort: AbortController;
};

export type ChatSendContext = {
  webview: vscode.Webview | undefined;
  hostLoops: Map<string, HostLoopRuntime>;
  getHostLoopRequestId: () => string | undefined;
  setHostLoopRequestId: (id: string | undefined) => void;
};

/**
 * Accept chat.send, track abort, and report that the agent loop is not wired yet.
 */
export async function runHostChatSend(
  ctx: ChatSendContext,
  payload: ChatSendPayload,
): Promise<void> {
  const webview = ctx.webview;
  if (!webview) return;

  const requestId = String(payload.requestId) as RequestId;
  const abort = new AbortController();
  ctx.setHostLoopRequestId(requestId);
  ctx.hostLoops.set(requestId, { loop: null, abort });

  const postStream = (event: Record<string, unknown>) => {
    if (!ctx.hostLoops.has(requestId)) return;
    void webview.postMessage({
      type: 'chat.stream',
      payload: { requestId, ...event },
    });
  };

  try {
    postStream({ event: 'status', status: 'pending' });
    // AGENT-001 / PROVIDER-* / TOOL-* required for a real loop.
    postStream({
      event: 'error',
      error: 'Agent loop not wired yet (AGENT-001 pending).',
    });
  } finally {
    ctx.hostLoops.delete(requestId);
    if (ctx.getHostLoopRequestId() === requestId) {
      ctx.setHostLoopRequestId(undefined);
    }
  }
}

/** Abort in-flight chat.send for a request (or the current host loop). */
export function stopHostChatSend(
  ctx: ChatSendContext,
  payload?: ChatStopPayload,
): void {
  const target =
    (payload?.requestId != null ? String(payload.requestId) : undefined) ||
    ctx.getHostLoopRequestId();
  if (!target) return;
  const runtime = ctx.hostLoops.get(target);
  if (!runtime) return;
  runtime.abort.abort();
  ctx.hostLoops.delete(target);
  if (ctx.getHostLoopRequestId() === target) {
    ctx.setHostLoopRequestId(undefined);
  }
  if (ctx.webview) {
    void ctx.webview.postMessage({
      type: 'chat.stream',
      payload: { requestId: target, event: 'stopped' },
    });
  }
}
