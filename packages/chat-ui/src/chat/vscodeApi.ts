/**
 * EXT-002 — VS Code webview API accessor (no `vscode` module import).
 * Chat-ui talks to the host only via postMessage + shared protocol.
 *
 * IMPORTANT: acquireVsCodeApi() may be called only ONCE per webview.
 * Host HTML may already have called it and stored `window.__vscodeApi`.
 */

export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  // Provided by the VS Code webview runtime, not by npm.
  function acquireVsCodeApi(): VsCodeApi;

  interface Window {
    /** Set by webviewHtml boot script before chat.js loads. */
    __vscodeApi?: VsCodeApi;
  }
}

/** Cached API handle — never call acquireVsCodeApi more than once. */
let cached: VsCodeApi | undefined;

/**
 * Return the webview vscode API.
 * Prefers the host-injected `__vscodeApi` so we never double-acquire.
 * Tests can inject a mock via `setVsCodeApiForTests`.
 */
export function getVsCodeApi(): VsCodeApi {
  if (cached) return cached;

  // Host HTML boot already acquired — reuse it (avoids fatal double-acquire).
  if (typeof window !== 'undefined' && window.__vscodeApi) {
    cached = window.__vscodeApi;
    return cached;
  }

  cached = acquireVsCodeApi();
  if (typeof window !== 'undefined') {
    window.__vscodeApi = cached;
  }
  return cached;
}

/** Test-only: inject a fake API (clears previous cache). */
export function setVsCodeApiForTests(api: VsCodeApi | undefined): void {
  cached = api;
  if (typeof window !== 'undefined') {
    window.__vscodeApi = api;
  }
}
