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

  it('accepts HOST bridge discriminants', () => {
    expect(isWebviewToHostMessage({ type: 'provider.test', requestId: 'r1', baseUrl: 'http://x' })).toBe(
      true,
    );
    expect(
      isHostToWebviewMessage({
        type: 'provider.test.result',
        requestId: 'r1',
        ok: false,
        health: 'offline',
      }),
    ).toBe(true);
  });

  it('keeps discriminant catalogs closed and aligned', () => {
    expect(WEBVIEW_TO_HOST_TYPES).toContain('ui.ready');
    expect(WEBVIEW_TO_HOST_TYPES).toContain('chat.send');
    expect(WEBVIEW_TO_HOST_TYPES).toContain('provider.test');
    expect(WEBVIEW_TO_HOST_TYPES).toContain('plan.v2.generate');
    expect(WEBVIEW_TO_HOST_TYPES).toContain('worktree.apply');
    expect(HOST_TO_WEBVIEW_TYPES).toContain('host.hello');
    expect(HOST_TO_WEBVIEW_TYPES).toContain('chat.stream');
    expect(HOST_TO_WEBVIEW_TYPES).toContain('config.hydrate');
    expect(HOST_TO_WEBVIEW_TYPES).toContain('checkpoint.listResult');
    // Catalogs stay unique.
    expect(new Set(WEBVIEW_TO_HOST_TYPES).size).toBe(WEBVIEW_TO_HOST_TYPES.length);
    expect(new Set(HOST_TO_WEBVIEW_TYPES).size).toBe(HOST_TO_WEBVIEW_TYPES.length);
  });
});
