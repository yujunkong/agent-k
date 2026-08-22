/**
 * SHARED-001 — Extension ↔ Webview protocol message unions.
 *
 * Phase 0 focus: `ui.ready` / `host.hello` for “UI Hello OK”.
 * HOST-* bridge types live in host-bridge.ts and are merged here.
 */

import type { ChatSendPayload, ChatStopPayload } from './chat-send';
import type { ChatStreamEnvelope } from './chat-stream';
import type {
  HostBridgeHostMessage,
  HostBridgeWebviewMessage,
} from './host-bridge';
import type {
  HostSessionsHydratePayload,
  HostSessionsPersistPayload,
} from './sessions';

/** Wire protocol version for hello handshake. Bump when breaking message shapes. */
export const PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

/** Webview → Host messages (postMessage from webview). */
export type WebviewToHostMessage =
  /** Phase 0 hello: webview announces it can speak this protocol. */
  | { type: 'ui.ready'; protocolVersion: ProtocolVersion }
  | { type: 'chat.send'; payload: ChatSendPayload }
  | { type: 'chat.stop'; payload?: ChatStopPayload }
  | { type: 'host.sessions.ready' }
  | { type: 'host.sessions.persist'; payload: HostSessionsPersistPayload }
  | HostBridgeWebviewMessage;

/** Host → Webview messages (webview.postMessage from extension host). */
export type HostToWebviewMessage =
  /** Phase 0 hello: host acknowledges and reports extension version. */
  | {
      type: 'host.hello';
      protocolVersion: ProtocolVersion;
      extensionVersion: string;
    }
  | { type: 'chat.stream'; payload: ChatStreamEnvelope }
  | { type: 'host.sessions.hydrate'; payload: HostSessionsHydratePayload }
  | HostBridgeHostMessage;

/** Any protocol message on the wire. */
export type ProtocolMessage = WebviewToHostMessage | HostToWebviewMessage;

/** Closed list of webview→host `type` discriminants (for guards / docs). */
export const WEBVIEW_TO_HOST_TYPES = [
  'ui.ready',
  'chat.send',
  'chat.stop',
  'host.sessions.ready',
  'host.sessions.persist',
  'config.update',
  'config.project.get',
  'config.project.save',
  'config.project.open',
  'config.project.createExample',
  'attachments.pick',
  'attachments.resolve',
  'composer.search',
  'file.open',
  'provider.test',
  'model.context.refresh',
  'plan.v2.generate',
  'plan.v2.cancel',
  'plan.execute',
  'worktree.review',
  'worktree.apply',
  'worktree.reject',
  'checkpoint.list',
  'checkpoint.restore',
] as const satisfies ReadonlyArray<WebviewToHostMessage['type']>;

/** Closed list of host→webview `type` discriminants. */
export const HOST_TO_WEBVIEW_TYPES = [
  'host.hello',
  'chat.stream',
  'host.sessions.hydrate',
  'config.hydrate',
  'settings.open',
  'config.project.result',
  'config.project.saved',
  'attachments.resolve.result',
  'composer.search.result',
  'provider.test.result',
  'model.context',
  'plan.v2.generate.result',
  'plan.execution.error',
  'worktree.review.result',
  'worktree.apply.result',
  'worktree.reject.result',
  'checkpoint.listResult',
] as const satisfies ReadonlyArray<HostToWebviewMessage['type']>;
