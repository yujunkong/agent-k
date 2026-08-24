/**
 * SHARED-001 — Host bridge protocol messages (HOST-002~015).
 * Keep payloads minimal; domain packages fill behavior later.
 */

import type { RequestId } from '../common/ids';
import type {
  PlanCancelMessage,
  PlanCardPatchMessage,
  PlanExecuteMessage,
  PlanExecutionErrorMessage,
  PlanGenerateMessage,
  PlanGenerateResultMessage,
} from '../plan/protocol';
import type { ChatSendPayload, ChatStopPayload } from './chat-send';
import type {
  HostSessionsHydratePayload,
  HostSessionsPersistPayload,
} from './sessions';

/** Provider health from HOST-010 probe. */
export type ProviderProbeHealth = 'healthy' | 'degraded' | 'offline' | 'unknown';

/** Composer search hit (HOST-003). */
export interface ComposerSearchHit {
  kind: 'file' | 'folder';
  path: string;
  label: string;
  description: string;
}

/** Attachment resolve row (HOST-003). */
export interface AttachmentResolveRow {
  path: string;
  type: 'file' | 'folder';
  uri?: string;
}

/** Checkpoint summary row (HOST-007 / SAFE-*). */
export interface CheckpointListItem {
  id: string;
  label: string;
  timestamp: number;
  turnNumber?: number;
  mode?: string;
  trigger?: string;
  fileCount?: number;
}

/** Webview → Host messages beyond Phase 0 hello/chat/session core. */
export type HostBridgeWebviewMessage =
  | { type: 'config.update'; key: string; value: unknown }
  | { type: 'config.update'; values: Record<string, unknown> }
  | { type: 'config.project.get' }
  | { type: 'config.project.save'; text: string }
  | { type: 'config.project.open' }
  | { type: 'config.project.createExample' }
  | { type: 'attachments.pick'; requestId: RequestId }
  | { type: 'attachments.resolve'; requestId: RequestId; uris: string[] }
  /** CHAT-005 — resolve multi-line paste via copy-time path stash (Cmd/Ctrl+C). */
  | { type: 'attachments.matchPaste'; requestId: RequestId; content: string }
  /** CHAT-012 — save clipboard/drop image bytes to temp path. */
  | {
      type: 'attachments.saveImage';
      requestId: RequestId;
      mimeType: string;
      dataBase64: string;
      fileName?: string;
    }
  /** CHAT-012 — read screenshot from OS clipboard in extension host (Electron). */
  | { type: 'attachments.readClipboardImage'; requestId: RequestId }
  | {
      type: 'composer.search';
      requestId: RequestId;
      query: string;
      kind: 'file' | 'folder';
    }
  | { type: 'file.open'; path: string; startLine?: number; endLine?: number }
  | {
      type: 'provider.test';
      requestId: RequestId;
      baseUrl: string;
      apiKey?: string;
      model?: string;
      extraHeaders?: Record<string, string>;
    }
  | {
      type: 'model.context.refresh';
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      providerType?: string;
    }
  | PlanGenerateMessage
  | PlanCancelMessage
  | PlanExecuteMessage
  | { type: 'worktree.review'; requestId?: RequestId; subagentId: string }
  | { type: 'worktree.apply'; requestId?: RequestId; subagentId: string }
  | { type: 'worktree.reject'; requestId?: RequestId; subagentId: string }
  | { type: 'checkpoint.list' }
  | { type: 'checkpoint.restore'; id: string; reason?: string }
  /** TOOL-007 — user Confirm on AskQuestionCard */
  | {
      type: 'chat.answer';
      qid: string;
      answer: string;
      question?: string;
    }
  /** TOOL-007 — user Skip / idle auto-skip */
  | { type: 'chat.question.cancel'; qid: string; reason?: string };

/** Host → Webview messages for HOST bridge features. */
export type HostBridgeHostMessage =
  | { type: 'config.hydrate'; values: Record<string, unknown> }
  | { type: 'settings.open'; tab?: string }
  /** CHAT-012 / CHAT-005 — focus Composer textarea after webview claims workbench focus. */
  | { type: 'focus.input' }
  | {
      type: 'config.project.result';
      exists: boolean;
      path: string | null;
      text?: string;
      error?: string;
    }
  | { type: 'config.project.saved'; path: string }
  | {
      type: 'attachments.resolve.result';
      requestId: RequestId;
      results: AttachmentResolveRow[];
    }
  /** CHAT-005 — host pushes editor selection / files into Composer chips. */
  | {
      type: 'attachments.add';
      items: Array<{
        id?: string;
        type?: string;
        path?: string;
        label?: string;
        content?: string;
        startLine?: number;
        endLine?: number;
      }>;
    }
  /** Reply to attachments.matchPaste — item set when editor file matched. */
  | {
      type: 'attachments.matchPaste.result';
      requestId: RequestId;
      item?: {
        id?: string;
        type?: string;
        path?: string;
        label?: string;
        content?: string;
        startLine?: number;
        endLine?: number;
      };
    }
  /** CHAT-012 — saved capture path for Composer chip. */
  | {
      type: 'attachments.saveImage.result';
      requestId: RequestId;
      item?: {
        path: string;
        mimeType: string;
        type: 'image';
        label?: string;
      };
      error?: string;
    }
  | {
      type: 'composer.search.result';
      requestId: RequestId;
      query: string;
      results: ComposerSearchHit[];
      error?: string;
    }
  | {
      type: 'provider.test.result';
      requestId: RequestId;
      ok: boolean;
      status?: number;
      detail?: string;
      modelIds?: string[];
      health: ProviderProbeHealth;
    }
  | {
      type: 'model.context';
      model: string;
      providerType: string;
      maxInputTokens: number;
      maxOutputTokens?: number;
      source: string;
      error?: string;
    }
  | PlanGenerateResultMessage
  | PlanExecutionErrorMessage
  | PlanCardPatchMessage
  | {
      type: 'worktree.review.result';
      requestId: string;
      subagentId?: string;
      success: boolean;
      error?: string;
      [key: string]: unknown;
    }
  | {
      type: 'worktree.apply.result';
      requestId: string;
      subagentId?: string;
      success: boolean;
      applied?: boolean;
      removed?: boolean;
      filesChanged?: number;
      error?: string;
    }
  | {
      type: 'worktree.reject.result';
      requestId: string;
      subagentId?: string;
      success: boolean;
      error?: string;
    }
  | { type: 'checkpoint.listResult'; checkpoints: CheckpointListItem[] };

/** Re-export chat/session core for host router convenience. */
export type CoreWebviewMessage =
  | { type: 'ui.ready'; protocolVersion: number }
  | { type: 'chat.send'; payload: ChatSendPayload }
  | { type: 'chat.stop'; payload?: ChatStopPayload }
  | { type: 'host.sessions.ready' }
  | { type: 'host.sessions.persist'; payload: HostSessionsPersistPayload };

export type CoreHostMessage =
  | {
      type: 'host.hello';
      protocolVersion: number;
      extensionVersion: string;
    }
  | { type: 'chat.stream'; payload: import('./chat-stream').ChatStreamEnvelope }
  | { type: 'host.sessions.hydrate'; payload: HostSessionsHydratePayload };
