/**
 * @agent-k/chat-ui — Webview React UI.
 *
 * Feature IDs:
 * - EXT-002 Chat View entry
 * - CHAT-001 Chat application shell
 * - CHAT-002 Composer (mode + send)
 * - SET-001…SET-013 Settings hub tabs
 * - UI-001…UI-024 / CURSOR-* presentation chrome
 */

export { ChatApp, Shell } from './Shell';
export { Composer } from './Composer';
export { MessageList } from './MessageList';
export {
  getVsCodeApi,
  setVsCodeApiForTests,
  type VsCodeApi,
} from './vscodeApi';
export { SettingsPanel, modelSettingsFromConfig } from './SettingsPanel';
export type { ModelSettings } from './SettingsPanel';
export * from './components';
