/**
 * EXT-004 — Content-Security-Policy builder for Chat webview HTML.
 * Pure string helpers so unit tests stay node-friendly.
 */

export interface WebviewCspOptions {
  nonce: string;
  /** webview.cspSource (vscode-webview://… / https://*.vscode-cdn.net) */
  cspSource: string;
  /**
   * When true, allow http/https/ws/wss connect-src (Models tab / API later).
   * Default true to match v2.1 webviewHtml.
   */
  allowRemoteConnect?: boolean;
}

/**
 * Build the CSP meta content string for Agent-K Chat webview.
 * default-src 'none'; scripts/styles gated by nonce + cspSource.
 */
export function buildWebviewCsp(options: WebviewCspOptions): string {
  const { nonce, cspSource, allowRemoteConnect = true } = options;
  const connectSrc = allowRemoteConnect
    ? 'connect-src http: https: ws: wss:;'
    : "connect-src 'none';";

  // style-src keeps 'unsafe-inline' for VS Code theme vars injected by host;
  // script-src stays nonce-only (no unsafe-inline scripts).
  return [
    "default-src 'none'",
    connectSrc.replace(/;$/, ''),
    `script-src 'nonce-${nonce}' ${cspSource}`,
    `style-src 'nonce-${nonce}' 'unsafe-inline' ${cspSource}`,
    `font-src ${cspSource}`,
    `img-src ${cspSource} data:`,
  ].join('; ');
}
