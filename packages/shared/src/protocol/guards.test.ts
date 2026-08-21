/**
 * SHARED-001 — protocol guard unit tests.
 */

import { describe, expect, it } from 'vitest';
import {
  HOST_TO_WEBVIEW_TYPES,
  PROTOCOL_VERSION,
  WEBVIEW_TO_HOST_TYPES,
  isHostToWebviewMessage,
  isKnownProtocolType,
  isWebviewToHostMessage,
} from './index';

describe('SHARED-001 protocol guards', () => {
  it('accepts ui.ready with matching protocolVersion', () => {
    expect(
      isWebviewToHostMessage({ type: 'ui.ready', protocolVersion: PROTOCOL_VERSION }),
    ).toBe(true);
  });

  it('rejects ui.ready with wrong protocolVersion', () => {
    expect(isWebviewToHostMessage({ type: 'ui.ready', protocolVersion: 999 })).toBe(
      false,
    );
  });

  it('accepts host.hello handshake', () => {
    expect(
      isHostToWebviewMessage({
        type: 'host.hello',
        protocolVersion: PROTOCOL_VERSION,
        extensionVersion: '3.0.0-skeleton',
      }),
    ).toBe(true);
  });

  it('rejects unknown message types', () => {
    expect(isWebviewToHostMessage({ type: 'not.a.real.type' })).toBe(false);
    expect(isHostToWebviewMessage({ type: 'stream.delta', payload: {} })).toBe(false);
    expect(isKnownProtocolType('chat.send')).toBe(true);
    expect(isKnownProtocolType('stream.delta')).toBe(false);
  });

  it('keeps discriminant catalogs closed and aligned', () => {
    expect([...WEBVIEW_TO_HOST_TYPES]).toEqual([
      'ui.ready',
      'chat.send',
      'chat.stop',
      'host.sessions.ready',
      'host.sessions.persist',
    ]);
    expect([...HOST_TO_WEBVIEW_TYPES]).toEqual([
      'host.hello',
      'chat.stream',
      'host.sessions.hydrate',
    ]);
  });
});
