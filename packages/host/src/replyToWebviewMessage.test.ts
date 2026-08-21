/**
 * EXT-001 — unit tests for ui.ready → host.hello (no vscode).
 */

import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@agent-k/shared';
import { buildHelloHtml } from './helloHtml';
import { replyToWebviewMessage } from './replyToWebviewMessage';

describe('EXT-001 replyToWebviewMessage', () => {
  it('replies host.hello to ui.ready', () => {
    const reply = replyToWebviewMessage(
      { type: 'ui.ready', protocolVersion: PROTOCOL_VERSION },
      '3.0.0-test',
    );
    expect(reply).toEqual({
      type: 'host.hello',
      protocolVersion: PROTOCOL_VERSION,
      extensionVersion: '3.0.0-test',
    });
  });

  it('ignores unknown or non-hello messages', () => {
    expect(replyToWebviewMessage({ type: 'not.real' }, '1.0.0')).toBeUndefined();
    expect(
      replyToWebviewMessage({ type: 'chat.stop', payload: {} }, '1.0.0'),
    ).toBeUndefined();
    expect(
      replyToWebviewMessage(
        { type: 'ui.ready', protocolVersion: 999 },
        '1.0.0',
      ),
    ).toBeUndefined();
  });
});

describe('EXT-001 helloHtml', () => {
  it('embeds ui.ready handshake and CSP nonce', () => {
    const html = buildHelloHtml({ nonce: 'testnonce', cspSource: 'https://csp.test' });
    expect(html).toContain("type: 'ui.ready'");
    expect(html).toContain(`const PROTOCOL_VERSION = ${PROTOCOL_VERSION}`);
    expect(html).toContain('protocolVersion: PROTOCOL_VERSION');
    expect(html).toContain('nonce-testnonce');
    expect(html).toContain('acquireVsCodeApi');
    expect(html).toContain('UI Hello OK');
  });
});
