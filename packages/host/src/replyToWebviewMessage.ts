/**
 * EXT-001 — pure ui.ready → host.hello reply (testable without vscode).
 * Ignores all other protocol messages until HOST-002+.
 */

import {
  PROTOCOL_VERSION,
  isWebviewToHostMessage,
  type HostToWebviewMessage,
} from '@agent-k/shared';

/**
 * Map an inbound webview message to an optional host reply.
 * EXT-001 only answers `ui.ready` with `host.hello`.
 */
export function replyToWebviewMessage(
  raw: unknown,
  extensionVersion: string,
): HostToWebviewMessage | undefined {
  if (!isWebviewToHostMessage(raw)) {
    return undefined;
  }
  if (raw.type !== 'ui.ready') {
    return undefined;
  }
  return {
    type: 'host.hello',
    protocolVersion: PROTOCOL_VERSION,
    extensionVersion,
  };
}
