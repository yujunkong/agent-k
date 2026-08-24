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
  matchPasteAttachment,
  openWorkspaceFile,
  pickAttachmentUris,
  readClipboardImage,
  resolveAttachmentUris,
  saveClipboardImage,
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
  abortPlanGenerate,
  runPlanGenerate,
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
import { hostLog, hostLogError } from './hostLog';
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
  try {
    // Hello handshake stays on the EXT-001 pure helper.
    const hello = replyToWebviewMessage(raw, ctx.extensionVersion);
    if (hello) {
      hostLog('HOST handshake', '← ui.ready → host.hello + hydrate');
      void ctx.webview?.postMessage(hello);
      // Also hydrate config + sessions after first ready.
      sendConfigHydrate(ctx.webview);
      sendSessionHydration(ctx.webview);
      return;
    }

    if (!isWebviewToHostMessage(raw)) {
      const t =
        raw && typeof raw === 'object' && 'type' in raw
          ? String((raw as { type?: unknown }).type)
          : typeof raw;
      hostLog('HOST protocol', `← ignored (not protocol): ${t}`);
      return;
    }

    void dispatch(ctx, raw).catch((err) => {
      hostLogError('HOST dispatch', `dispatch(${raw.type}) rejected`, err);
    });
  } catch (err) {
    hostLogError('HOST dispatch', 'handleWebviewMessage crashed', err);
  }
}

async function dispatch(
  ctx: HostMessageRouterContext,
  msg: WebviewToHostMessage,
): Promise<void> {
  const webview = ctx.webview;

  try {
  switch (msg.type) {
    case 'ui.ready':
      // Handled above via replyToWebviewMessage.
      return;

    case 'chat.send': {
      // Accept nested SHARED-001 payload; tolerate legacy flat body during migrate.
      const sendBody = (msg.payload ?? msg) as ChatSendPayload;
      const req = String(sendBody?.requestId || '');
      const model = String(sendBody?.model || '');
      const baseUrl = String(sendBody?.baseUrl || '');
      const n = Array.isArray(sendBody?.messages) ? sendBody.messages.length : 0;
      hostLog(
        'chat.send empty reply',
        `← chat.send requestId=${req} model=${model || '(empty)'} baseUrl=${baseUrl ? baseUrl.slice(0, 48) : '(empty)'} msgs=${n} session=${String((sendBody as { sessionId?: string })?.sessionId || '')}`,
      );
      if (!baseUrl || !model) {
        hostLog(
          'chat.send missing credentials',
          'baseUrl/model empty — will error to webview',
          true,
        );
      }
      await runHostChatSend(ctx.chatSend, sendBody);
      return;
    }

    case 'chat.stop': {
      const stopBody = (msg.payload ?? msg) as
        | { requestId?: string }
        | undefined;
      hostLog(
        'chat.send stop',
        `requestId=${String(stopBody?.requestId || '')}`,
      );
      try {
        const { cancelAskQuestionsForRequest } = await import(
          './askQuestionWaiters'
        );
        if (stopBody?.requestId) {
          cancelAskQuestionsForRequest(
            String(stopBody.requestId),
            'chat.stop',
          );
        }
      } catch {
        /* ignore */
      }
      stopHostChatSend(ctx.chatSend, stopBody);
      return;
    }

    case 'chat.answer': {
      const { resolveAskAnswer } = await import('./askQuestionWaiters');
      const qid = String(msg.qid || '');
      const answer = String(msg.answer || '');
      const question = msg.question != null ? String(msg.question) : '';
      // Comment: deliver Q+A text so the model sees both in the tool result
      const payload =
        question.trim()
          ? `Q: ${question.trim()}\nA: ${answer}`
          : answer;
      const ok = resolveAskAnswer(qid, payload);
      hostLog(
        'ask_question',
        `chat.answer qid=${qid} ok=${ok} answerLen=${answer.length}`,
      );
      return;
    }

    case 'chat.question.cancel': {
      const { cancelAskQuestion } = await import('./askQuestionWaiters');
      const qid = String(msg.qid || '');
      const reason = String(msg.reason || 'ask_question skipped');
      const ok = cancelAskQuestion(qid, reason);
      hostLog('ask_question', `chat.question.cancel qid=${qid} ok=${ok}`);
      return;
    }

    case 'host.sessions.ready':
      sendSessionHydration(webview);
      return;

    case 'host.sessions.persist': {
      // SHARED-001 nested payload; also accept flat { sessions, currentId } from older webviews.
      const body = (msg.payload ?? msg) as HostSessionsPersistPayload;
      const n = Array.isArray(body?.sessions) ? body.sessions.length : -1;
      // Only log bad shapes — success spam drowned real chat.send traces.
      if (n < 0 || !msg.payload) {
        hostLog(
          'sessions.persist crash guard',
          `nested=${Boolean(msg.payload)} sessions=${n} currentId=${String(body?.currentId || '')}`,
          true,
        );
      }
      persistSessionsToHost(body);
      return;
    }

    case 'config.update': {
      const batch = (msg as { values?: Record<string, unknown> }).values;
      if (batch && typeof batch === 'object') {
        await handleConfigUpdateBatch(batch);
      } else if ('key' in msg && typeof msg.key === 'string') {
        await handleConfigUpdate(msg.key, msg.value);
      }
      // Comment: echoOnly — avoid stale VS Code/project re-read flipping Composer model back
      sendConfigHydrate(webview, { echoOnly: true });
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

    case 'attachments.matchPaste':
      await matchPasteAttachment(
        webview,
        String(msg.requestId),
        String(msg.content || ''),
      );
      return;

    case 'attachments.saveImage':
      await saveClipboardImage(
        webview,
        String(msg.requestId),
        String(msg.mimeType || 'image/png'),
        String(msg.dataBase64 || ''),
        msg.fileName != null ? String(msg.fileName) : undefined,
      );
      return;

    case 'attachments.readClipboardImage':
      hostLog(
        'composer.attach',
        `← attachments.readClipboardImage requestId=${String(msg.requestId)}`,
      );
      await readClipboardImage(webview, String(msg.requestId));
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
      await openWorkspaceFile(String(msg.path || ''), {
        startLine:
          msg.startLine != null && Number.isFinite(Number(msg.startLine))
            ? Number(msg.startLine)
            : undefined,
        endLine:
          msg.endLine != null && Number.isFinite(Number(msg.endLine))
            ? Number(msg.endLine)
            : undefined,
      });
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

    case 'plan.generate':
      await runPlanGenerate(ctx.planGenerate, {
        requestId: msg.requestId as RequestId,
        sessionId: msg.sessionId,
        goal: typeof msg.goal === 'string' ? msg.goal : undefined,
        researchContext:
          typeof msg.researchContext === 'string' ? msg.researchContext : undefined,
        rejectionFeedback:
          typeof msg.rejectionFeedback === 'string'
            ? msg.rejectionFeedback
            : undefined,
        baseUrl: typeof msg.baseUrl === 'string' ? msg.baseUrl : undefined,
        apiKey: typeof msg.apiKey === 'string' ? msg.apiKey : undefined,
        model: typeof msg.model === 'string' ? msg.model : undefined,
      });
      return;

    case 'plan.cancel':
      abortPlanGenerate(ctx.planGenerate, msg.requestId);
      return;

    case 'plan.execute':
      await runHostPlanExecute(
        { webview },
        {
          requestId: msg.requestId as RequestId,
          sessionId: msg.sessionId,
          parentTurnId: msg.parentTurnId,
          executionPlan: msg.executionPlan as never,
          taskIds: msg.taskIds,
          repoRoot: msg.repoRoot,
        },
      );
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

    default:
      hostLog('HOST unhandled', `← type=${(msg as { type?: string }).type}`);
  }
  } catch (err) {
    hostLogError('HOST dispatch', `dispatch(${msg.type}) threw`, err);
  }
}
