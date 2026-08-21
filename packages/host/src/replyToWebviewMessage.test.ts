/**
 * EXT-001~005 — host unit tests (no vscode runtime).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@agent-k/shared';
import { AGENT_K_COMMAND_IDS } from './commandIds';
import { getNonce } from './nonce';
import { replyToWebviewMessage } from './replyToWebviewMessage';
import { buildWebviewCsp } from './webviewCsp';
import { getWebviewHtml } from './webviewHtml';
import {
  resolveWorkspaceRelativeSegments,
  toWorkspaceRelativePath,
} from './workspacePaths';

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

describe('EXT-003 command catalog', () => {
  it('lists the Feature Master command families (19 ids)', () => {
    expect(AGENT_K_COMMAND_IDS).toHaveLength(19);
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.chat.new');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.openSettings');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.openProjectConfig');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.provider.add');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.mode.switch');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.chat.focusInput');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.chat.attachSelection');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.inlineEdit');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.plan.open');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.plan.build');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.plan.openReview');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.debug.open');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.review.open');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.browser.open');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.artifacts.open');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.mcp.reload');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.mcp.connect');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.mcp.disconnect');
    expect(AGENT_K_COMMAND_IDS).toContain('agent-k.bestOfN.run');
  });

  it('has unique command ids', () => {
    expect(new Set(AGENT_K_COMMAND_IDS).size).toBe(AGENT_K_COMMAND_IDS.length);
  });

  it('stays in sync with extensions/agent-k package.json contributes.commands', () => {
    // Relative from packages/host → repo root assembler package.json.
    const pkgPath = path.resolve(__dirname, '../../../extensions/agent-k/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      contributes: { commands: Array<{ command: string }> };
    };
    const fromPkg = pkg.contributes.commands.map((c) => c.command).sort();
    const fromHost = [...AGENT_K_COMMAND_IDS].sort();
    expect(fromHost).toEqual(fromPkg);
  });
});

describe('EXT-004 CSP / nonce / webviewHtml', () => {
  it('getNonce returns alphanumeric of requested length', () => {
    const n = getNonce(24);
    expect(n).toHaveLength(24);
    expect(n).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('buildWebviewCsp gates scripts by nonce and allows remote connect', () => {
    const csp = buildWebviewCsp({
      nonce: 'abc123',
      cspSource: 'https://csp.test',
    });
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'nonce-abc123' https://csp.test");
    expect(csp).toContain('connect-src http: https: ws: wss:');
    expect(csp).toContain("style-src 'nonce-abc123' 'unsafe-inline' https://csp.test");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('buildWebviewCsp can deny remote connect', () => {
    const csp = buildWebviewCsp({
      nonce: 'n',
      cspSource: 'https://csp.test',
      allowRemoteConnect: false,
    });
    expect(csp).toContain("connect-src 'none'");
  });

  it('getWebviewHtml loads chat-ui bundle with CSP nonce and #chat-root', () => {
    const html = getWebviewHtml({
      nonce: 'testnonce',
      cspSource: 'https://csp.test',
      scriptUri: 'https://webview/media/chat.js?v=1',
      styleUri: 'https://webview/media/chat.css?v=1',
    });
    expect(html).toContain('id="chat-root"');
    expect(html).toContain('nonce-testnonce');
    expect(html).toContain('https://webview/media/chat.js?v=1');
    expect(html).toContain('https://webview/media/chat.css?v=1');
    expect(html).toContain('script nonce="testnonce"');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('connect-src');
    expect(html).toContain('acquireVsCodeApi');
  });
});

describe('EXT-005 workspacePaths', () => {
  const folder = { fsPath: '/home/user/project' };

  it('resolves relative paths to segments', () => {
    expect(resolveWorkspaceRelativeSegments('src/a.ts', folder, 'posix')).toEqual([
      'src',
      'a.ts',
    ]);
    expect(toWorkspaceRelativePath('src/a.ts', folder, 'posix')).toBe('src/a.ts');
  });

  it('strips workspace root from absolute paths', () => {
    expect(
      resolveWorkspaceRelativeSegments('/home/user/project/pkg/x.ts', folder, 'posix'),
    ).toEqual(['pkg', 'x.ts']);
  });

  it('rejects path traversal and outside-root absolutes', () => {
    expect(resolveWorkspaceRelativeSegments('../secret', folder, 'posix')).toBeNull();
    expect(
      resolveWorkspaceRelativeSegments('/etc/passwd', folder, 'posix'),
    ).toBeNull();
    expect(resolveWorkspaceRelativeSegments('', folder, 'posix')).toBeNull();
    expect(resolveWorkspaceRelativeSegments('a\0b', folder, 'posix')).toBeNull();
  });

  it('handles win32 drive paths under the folder root', () => {
    const winFolder = { fsPath: 'C:\\Users\\me\\repo' };
    expect(
      resolveWorkspaceRelativeSegments('C:\\Users\\me\\repo\\src\\f.ts', winFolder, 'win32'),
    ).toEqual(['src', 'f.ts']);
    expect(
      resolveWorkspaceRelativeSegments('D:\\other\\f.ts', winFolder, 'win32'),
    ).toBeNull();
  });
});
