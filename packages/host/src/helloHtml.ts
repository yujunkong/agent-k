/**
 * EXT-001 — inline Phase 0 hello HTML (no React / chat-ui).
 * Posts ui.ready on load; displays host.hello when received.
 */

import { PROTOCOL_VERSION } from '@agent-k/shared';

export interface HelloHtmlOptions {
  /** CSP nonce for inline script/style. */
  nonce: string;
  /** webview.cspSource for img/font if needed later. */
  cspSource: string;
}

/**
 * Build a minimal webview document that completes the SHARED hello handshake.
 */
export function buildHelloHtml(options: HelloHtmlOptions): string {
  const { nonce, cspSource } = options;
  const protocolVersion = PROTOCOL_VERSION;

  // Keep script inline (nonce-protected) so Phase 0 needs no chat-ui bundle.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src ${cspSource} data:;" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent K</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --fg: var(--vscode-foreground, #ccc);
      --muted: var(--vscode-descriptionForeground, #888);
      --accent: var(--vscode-button-background, #0e639c);
      --bg: var(--vscode-sideBar-background, transparent);
      --font: var(--vscode-font-family, system-ui, sans-serif);
    }
    html, body {
      margin: 0;
      height: 100%;
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font);
    }
    main {
      box-sizing: border-box;
      min-height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 0.5rem;
      padding: 1.25rem;
    }
    h1 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    p {
      margin: 0;
      color: var(--muted);
      font-size: 0.85rem;
      line-height: 1.4;
    }
    #status {
      margin-top: 0.75rem;
      padding: 0.65rem 0.75rem;
      border-left: 3px solid var(--accent);
      font-size: 0.9rem;
      color: var(--fg);
    }
    #status[data-state="ok"] {
      border-left-color: var(--vscode-testing-iconPassed, #3fb950);
    }
    #status[data-state="error"] {
      border-left-color: var(--vscode-testing-iconFailed, #f85149);
    }
  </style>
</head>
<body>
  <main>
    <h1>Agent K</h1>
    <p>Phase 0 host ↔ webview protocol handshake</p>
    <div id="status" data-state="pending">Waiting for host.hello…</div>
  </main>
  <script nonce="${nonce}">
    (function () {
      const statusEl = document.getElementById('status');
      const vscode = acquireVsCodeApi();
      const PROTOCOL_VERSION = ${protocolVersion};

      window.addEventListener('message', function (event) {
        const msg = event.data;
        if (!msg || msg.type !== 'host.hello') return;
        if (msg.protocolVersion !== PROTOCOL_VERSION) {
          statusEl.dataset.state = 'error';
          statusEl.textContent = 'Protocol mismatch (got v' + msg.protocolVersion + ')';
          return;
        }
        statusEl.dataset.state = 'ok';
        statusEl.textContent = 'UI Hello OK — extension ' + msg.extensionVersion +
          ' (protocol v' + msg.protocolVersion + ')';
      });

      vscode.postMessage({ type: 'ui.ready', protocolVersion: PROTOCOL_VERSION });
    })();
  </script>
</body>
</html>`;
}
