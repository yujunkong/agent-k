/**
 * EXT-001 / EXT-002 — host unit tests (no vscode).
 */

import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@agent-k/shared';
import { replyToWebviewMessage } from './replyToWebviewMessage';
import { buildShellHtml } from './shellHtml';

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

describe('EXT-002 shellHtml', () => {
  it('loads chat-ui bundle with CSP nonce and #chat-root', () => {
    const html = buildShellHtml({
      nonce: 'testnonce',
      cspSource: 'https://csp.test',
      scriptUri: 'https://webview/media/chat.js',
      styleUri: 'https://webview/media/chat.css',
    });
    expect(html).toContain('id="chat-root"');
    expect(html).toContain('nonce-testnonce');
    expect(html).toContain('https://webview/media/chat.js');
    expect(html).toContain('https://webview/media/chat.css');
    expect(html).toContain('script nonce="testnonce"');
  });
});
