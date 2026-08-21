/**
 * SHARED-001 — Extension ↔ Webview protocol message unions.
 *
 * Phase 0 focus: `ui.ready` / `host.hello` for “UI Hello OK”.
 * Additional types are stubs so HOST-* / CHAT-* can grow without reshaping shared.
 *
 * Design notes vs v2.1:
 * - First-class hello (not only sessions.ready/hydrate).
 * - chat.stream uses ChatStreamEnvelope (discriminated events).
 * - Dual legacy stream.delta / timeline.update catalogs are deferred; prefer chat.stream.
 */

import type { ChatSendPayload, ChatStopPayload } from './chat-send';
import type { ChatStreamEnvelope } from './chat-stream';
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
  | { type: 'host.sessions.persist'; payload: HostSessionsPersistPayload };

/** Host → Webview messages (webview.postMessage from extension host). */
export type HostToWebviewMessage =
  /** Phase 0 hello: host acknowledges and reports extension version. */
  | {
      type: 'host.hello';
      protocolVersion: ProtocolVersion;
      extensionVersion: string;
    }
  | { type: 'chat.stream'; payload: ChatStreamEnvelope }
  | { type: 'host.sessions.hydrate'; payload: HostSessionsHydratePayload };

/** Any protocol message on the wire. */
export type ProtocolMessage = WebviewToHostMessage | HostToWebviewMessage;

/** Closed list of webview→host `type` discriminants (for guards / docs). */
export const WEBVIEW_TO_HOST_TYPES = [
  'ui.ready',
  'chat.send',
  'chat.stop',
  'host.sessions.ready',
  'host.sessions.persist',
] as const satisfies ReadonlyArray<WebviewToHostMessage['type']>;

/** Closed list of host→webview `type` discriminants. */
export const HOST_TO_WEBVIEW_TYPES = [
  'host.hello',
  'chat.stream',
  'host.sessions.hydrate',
] as const satisfies ReadonlyArray<HostToWebviewMessage['type']>;
