/**
 * @agent-k/chat-ui — Webview React UI.
 *
 * Feature IDs:
 * - EXT-002 Chat View shell (entry)
 *
 * No vscode / fs / agent loop / provider HTTP.
 */

export { Shell } from './Shell';
export { getVsCodeApi, setVsCodeApiForTests, type VsCodeApi } from './vscodeApi';
