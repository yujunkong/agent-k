import * as vscode from 'vscode';
import { getNonce } from './nonce';

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  // Cache-bust so Extension Host never serves a stale chat.js/css after rebuild
  const bust = String(Date.now());
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'chat.js')
  ).with({ query: `v=${bust}` });
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'chat.css')
  ).with({ query: `v=${bust}` });
  const nonce = getNonce();
  // Fail only on real script errors — large chat.js can exceed a short timeout while parsing
  const boot = `
    (function(){
      var el = document.getElementById('chat-root');
      if (!el) return;
      el.innerHTML = '<p style="padding:12px;opacity:.7;font-family:var(--vscode-font-family)">Loading Agent K UI…</p>';
      window.__akShowUiFail = function(detail){
        if (!el || el.querySelector('.chat-container') || el.querySelector('[data-ak-error]')) return;
        el.innerHTML = '<div data-ak-error style="padding:12px;color:var(--vscode-errorForeground)">' +
          '<p><b>Chat UI failed to load.</b></p>' +
          '<p style="opacity:.85">' + (detail || '') + '</p>' +
          '<p>1) In agent-k folder run: <code>npm run build:webview</code></p>' +
          '<p>2) Close this window and press <b>F5</b> again (Extension Development Host).</p></div>';
      };
      setTimeout(function(){
        if (el && !el.querySelector('.chat-container') && !el.querySelector('[data-ak-error]')) {
          window.__akShowUiFail('Timed out waiting for React mount (check Webview Developer Tools console).');
        }
      }, 15000);
    })();
  `;

  return `<!DOCTYPE html>
    <html lang="en" style="height:100%;width:100%;overflow:hidden;">
    <head>
      <meta charset="UTF-8">
      <!-- connect-src: webview fetch (Models tab test, chat API calls) -->
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src http: https: ws: wss:; script-src 'nonce-${nonce}' ${webview.cspSource}; style-src 'nonce-${nonce}' 'unsafe-inline' ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="${styleUri}" nonce="${nonce}">
      <title>Agent K Chat</title>
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
      <script nonce="${nonce}" src="${scriptUri}" onerror="window.__akShowUiFail && window.__akShowUiFail('dist/chat.js failed to load (404 or CSP).')"></script>
    </body>
    </html>`;
}
