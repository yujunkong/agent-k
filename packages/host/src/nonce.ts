/**
 * EXT-001 — CSP nonce helper (minimal subset of EXT-004).
 * Pure: no vscode dependency so unit tests stay node-friendly.
 */

/** Generate a short random nonce for webview CSP + script tags. */
export function createNonce(size = 32): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < size; i += 1) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}
