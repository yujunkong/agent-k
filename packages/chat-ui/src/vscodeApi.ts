/**
 * EXT-002 — VS Code webview API accessor (no `vscode` module import).
 * Chat-ui talks to the host only via postMessage + shared protocol.
 */

export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  // Provided by the VS Code webview runtime, not by npm.
  function acquireVsCodeApi(): VsCodeApi;
}

/** Cached API handle — acquireVsCodeApi may only be called once per webview. */
let cached: VsCodeApi | undefined;

/**
 * Return the webview vscode API. Tests can inject a mock via `setVsCodeApiForTests`.
 */
export function getVsCodeApi(): VsCodeApi {
  if (!cached) {
    cached = acquireVsCodeApi();
  }
  return cached;
}

/** Test-only: inject a fake API (clears previous cache). */
export function setVsCodeApiForTests(api: VsCodeApi | undefined): void {
  cached = api;
}
