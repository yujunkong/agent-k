/**
 * EXT-004 — CSP nonce helper (pure; no vscode dependency).
 * Canonical name `getNonce` matches v2.1; `createNonce` kept as alias.
 */

const NONCE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a cryptographically-weak but CSP-suitable random nonce.
 * Webview CSP only needs unpredictability within the document lifetime.
 */
export function getNonce(size = 32): string {
  let out = '';
  for (let i = 0; i < size; i += 1) {
    out += NONCE_ALPHABET.charAt(Math.floor(Math.random() * NONCE_ALPHABET.length));
  }
  return out;
}

/** @deprecated Prefer getNonce — alias kept for EXT-001 call sites. */
export const createNonce = getNonce;
