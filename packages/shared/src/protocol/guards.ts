/**
 * SHARED-001 — pure runtime type guards for protocol messages.
 * No vscode / console side effects — callers log unknown types.
 */

import {
  HOST_TO_WEBVIEW_TYPES,
  PROTOCOL_VERSION,
  WEBVIEW_TO_HOST_TYPES,
  type HostToWebviewMessage,
  type WebviewToHostMessage,
} from './messages';

const WEBVIEW_TYPE_SET: ReadonlySet<string> = new Set(WEBVIEW_TO_HOST_TYPES);
const HOST_TYPE_SET: ReadonlySet<string> = new Set(HOST_TO_WEBVIEW_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when value looks like a Webview→Host protocol message (discriminant only). */
export function isWebviewToHostMessage(value: unknown): value is WebviewToHostMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (!WEBVIEW_TYPE_SET.has(value.type)) return false;
  // Phase 0 hello must advertise a compatible protocolVersion.
  if (value.type === 'ui.ready') {
    return value.protocolVersion === PROTOCOL_VERSION;
  }
  return true;
}

/** True when value looks like a Host→Webview protocol message (discriminant only). */
export function isHostToWebviewMessage(value: unknown): value is HostToWebviewMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (!HOST_TYPE_SET.has(value.type)) return false;
  if (value.type === 'host.hello') {
    return (
      value.protocolVersion === PROTOCOL_VERSION &&
      typeof value.extensionVersion === 'string'
    );
  }
  return true;
}

/** True when `type` is a known protocol discriminant (either direction). */
export function isKnownProtocolType(type: string): boolean {
  return WEBVIEW_TYPE_SET.has(type) || HOST_TYPE_SET.has(type);
}
