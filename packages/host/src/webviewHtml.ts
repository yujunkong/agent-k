/**
 * EXT-004 — webview HTML document (CSP + nonce + chat-ui media assets).
 * Replaces EXT-002 shellHtml as the canonical HTML builder.
 */

import { buildWebviewCsp } from './webviewCsp';

export interface WebviewHtmlOptions {
  nonce: string;
  cspSource: string;
  /** webview.asWebviewUri(.../media/chat.js) — may include cache-bust query */
  scriptUri: string;
  /** webview.asWebviewUri(.../media/chat.css) */
  styleUri: string;
}

/**
 * Build the Chat View document: #chat-root + strict CSP + chat-ui assets.
 */
export function getWebviewHtml(options: WebviewHtmlOptions): string {
  const { nonce, cspSource, scriptUri, styleUri } = options;
  const csp = buildWebviewCsp({ nonce, cspSource });

  // Boot loader surfaces a friendly failure if React never mounts (CSP/404).
  // v2.1 ChatApp mounts `.chat-container` / `.chat-shell` (legacy: .ak-shell / .ak-app).
  const boot = `
    (function(){
      var el = document.getElementById('chat-root');
      if (!el) return;
      var MOUNTED = '.chat-shell, .chat-container, .ak-shell, .ak-app, [data-testid="chat-app"]';
      el.innerHTML = '<p style="padding:12px;opacity:.7;font-family:var(--vscode-font-family)">Loading Agent K UI…</p>';
      window.__akShowUiFail = function(detail){
        if (!el || el.querySelector(MOUNTED) || el.querySelector('[data-ak-error]')) return;
        el.innerHTML = '<div data-ak-error style="padding:12px;color:var(--vscode-errorForeground)">' +
          '<p><b>Chat UI failed to load.</b></p>' +
          '<p style="opacity:.85">' + (detail || '') + '</p>' +
          '<p>Run <code>npm run build:webview</code> then reload the window.</p></div>';
      };
      setTimeout(function(){
        if (el && !el.querySelector(MOUNTED) && !el.querySelector('[data-ak-error]')) {
          window.__akShowUiFail('Timed out waiting for React mount (check Webview Developer Tools console).');
        }
      }, 15000);
    })();
  `;

  return `<!DOCTYPE html>
<html lang="en" style="height:100%;width:100%;overflow:hidden;">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent K Chat</title>
  <link rel="stylesheet" href="${styleUri}" nonce="${nonce}" />
  <style nonce="${nonce}">
    html, body { position: fixed; inset: 0; margin: 0; overflow: hidden; height: 100%; width: 100%; }
    #chat-root { position: absolute; inset: 0; overflow: hidden; display: flex; flex-direction: column; }
  </style>
</head>
<body style="height:100%;width:100%;overflow:hidden;margin:0;">
  <div id="chat-root"></div>
  <script nonce="${nonce}">
    (function(){
      try {
        window.__vscodeApi = acquireVsCodeApi();
      } catch (e) {
        window.__vscodeApi = { postMessage: function(m){ window.parent.postMessage(m,'*'); } };
      }
    })();
  </script>
  <script nonce="${nonce}">${boot}</script>
  <script nonce="${nonce}" src="${scriptUri}" onerror="window.__akShowUiFail && window.__akShowUiFail('media/chat.js failed to load (404 or CSP).')"></script>
</body>
</html>`;
}

/** @deprecated Prefer getWebviewHtml — EXT-002 name kept for tests/call sites. */
export function buildShellHtml(options: WebviewHtmlOptions): string {
  return getWebviewHtml(options);
}
