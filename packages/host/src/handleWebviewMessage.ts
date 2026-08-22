/**
 * HOST-001 — Webview message router (typed discriminants; no NLP guessing).
 */

import {
  isWebviewToHostMessage,
  type ChatSendPayload,
  type HostSessionsPersistPayload,
  type RequestId,
  type WebviewToHostMessage,
} from '@agent-k/shared';
import type { ChatSendContext } from './chatSend';
import { runHostChatSend, stopHostChatSend } from './chatSend';
import {
  handleComposerSearch,
  openWorkspaceFile,
  pickAttachmentUris,
  resolveAttachmentUris,
} from './composerHost';
import {
  handleConfigUpdate,
  handleConfigUpdateBatch,
  handleProjectConfigCreateExample,
  handleProjectConfigGet,
  handleProjectConfigOpen,
  handleProjectConfigSave,
  sendConfigHydrate,
} from './configProject';
import { runHostPlanExecute } from './planExecute';
import {
  abortPlanV2Generate,
  runPlanV2Generate,
  type PlanGenerateContext,
} from './planGenerate';
import { refreshModelContext, runProviderConnectionTest } from './providerProbe';
import { replyToWebviewMessage } from './replyToWebviewMessage';
import {
  persistSessionsToHost,
  restoreCheckpoint,
  sendCheckpointList,
  sendSessionHydration,
} from './sessionHost';
import {
  handleWorktreeApplyMessage,
  handleWorktreeRejectMessage,
  handleWorktreeReviewMessage,
} from './subagentWorktreeBridge';
import type * as vscode from 'vscode';

export type HostMessageRouterContext = {
  webview: vscode.Webview | undefined;
  extensionVersion: string;
  chatSend: ChatSendContext;
  planGenerate: PlanGenerateContext;
};

/**
 * Route one inbound webview message. Returns a sync host→webview reply when applicable
 * (hello only); async handlers post via webview themselves.
 */
export function handleWebviewMessage(
  ctx: HostMessageRouterContext,
  raw: unknown,
): void {
  // Hello handshake stays on the EXT-001 pure helper.
  const hello = replyToWebviewMessage(raw, ctx.extensionVersion);
  if (hello) {
    void ctx.webview?.postMessage(hello);
    // Also hydrate config + sessions after first ready.
    sendConfigHydrate(ctx.webview);
    sendSessionHydration(ctx.webview);
    return;
  }

  if (!isWebviewToHostMessage(raw)) {
    return;
  }

  void dispatch(ctx, raw);
}

async function dispatch(
  ctx: HostMessageRouterContext,
  msg: WebviewToHostMessage,
): Promise<void> {
  const webview = ctx.webview;

  switch (msg.type) {
    case 'ui.ready':
      // Handled above via replyToWebviewMessage.
      return;

    case 'chat.send':
      await runHostChatSend(ctx.chatSend, msg.payload as ChatSendPayload);
      return;

    case 'chat.stop':
      stopHostChatSend(ctx.chatSend, msg.payload);
      return;

    case 'host.sessions.ready':
      sendSessionHydration(webview);
      return;

    case 'host.sessions.persist':
      persistSessionsToHost(msg.payload as HostSessionsPersistPayload);
      return;

    case 'config.update': {
      const batch = (msg as { values?: Record<string, unknown> }).values;
      if (batch && typeof batch === 'object') {
        await handleConfigUpdateBatch(batch);
      } else if (typeof msg.key === 'string') {
        await handleConfigUpdate(msg.key, msg.value);
      }
      sendConfigHydrate(webview);
      return;
    }

    case 'config.project.get':
      await handleProjectConfigGet(webview);
      return;

    case 'config.project.save':
      await handleProjectConfigSave(webview, msg.text);
      return;

    case 'config.project.open':
      await handleProjectConfigOpen();
      return;

    case 'config.project.createExample':
      await handleProjectConfigCreateExample(webview);
      return;

    case 'attachments.pick':
      await pickAttachmentUris(webview, String(msg.requestId));
      return;

    case 'attachments.resolve':
      await resolveAttachmentUris(webview, String(msg.requestId), msg.uris);
      return;

    case 'composer.search':
      await handleComposerSearch(
        webview,
        String(msg.requestId),
        msg.query,
        msg.kind,
      );
      return;

    case 'file.open':
      await openWorkspaceFile(msg.path);
      return;

    case 'provider.test':
      await runProviderConnectionTest(
        webview,
        String(msg.requestId),
        msg.baseUrl,
        msg.apiKey,
        msg.model,
        msg.extraHeaders,
      );
      return;

    case 'model.context.refresh':
      await refreshModelContext(webview, msg);
      return;

    case 'plan.v2.generate':
      await runPlanV2Generate(ctx.planGenerate, {
        requestId: msg.requestId as RequestId,
        sessionId: msg.sessionId,
      });
      return;

    case 'plan.v2.cancel':
      abortPlanV2Generate(ctx.planGenerate, msg.requestId);
      return;

    case 'plan.execute':
      await runHostPlanExecute({ webview }, { requestId: msg.requestId as RequestId });
      return;

    case 'worktree.review':
      await handleWorktreeReviewMessage(webview, msg as unknown as Record<string, unknown>);
      return;

    case 'worktree.apply':
      await handleWorktreeApplyMessage(webview, msg as unknown as Record<string, unknown>);
      return;

    case 'worktree.reject':
      await handleWorktreeRejectMessage(webview, msg as unknown as Record<string, unknown>);
      return;

    case 'checkpoint.list':
      sendCheckpointList(webview);
      return;

    case 'checkpoint.restore':
      await restoreCheckpoint(msg.id, msg.reason);
      return;
  }
}
