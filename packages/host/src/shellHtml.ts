/**
 * EXT-002 — webview HTML that loads the chat-ui IIFE bundle from extension media/.
 * Replaces EXT-001 inline helloHtml; handshake still uses SHARED ui.ready/host.hello.
 */

export interface ShellHtmlOptions {
  nonce: string;
  cspSource: string;
  /** webview.asWebviewUri(.../media/chat.js) */
  scriptUri: string;
  /** webview.asWebviewUri(.../media/chat.css) */
  styleUri: string;
}

/**
 * Build the Chat View document: #chat-root + nonce CSP + chat-ui assets.
 */
export function buildShellHtml(options: ShellHtmlOptions): string {
  const { nonce, cspSource, scriptUri, styleUri } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}' ${cspSource}; img-src ${cspSource} data:; font-src ${cspSource};" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent K Chat</title>
  <link rel="stylesheet" href="${styleUri}" nonce="${nonce}" />
</head>
<body>
  <div id="chat-root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
