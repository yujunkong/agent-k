/**
 * @agent-k/host — Extension Host bridge (vscode API).
 *
 * Feature IDs: EXT-001~005, HOST-001~015
 * No React UI / agent loop / tool executor body.
 *
 * Keep this barrel limited to symbols the extension entry actually needs
 * (plus a few host helpers). Broader re-exports can return as Features land;
 * a bloated barrel breaks esbuild when names drift.
 */

export { activateAgentK, deactivateAgentK } from './activate';
export { ChatViewProvider } from './ChatViewProvider';
export { registerCommands } from './registerCommands';
export { AGENT_K_COMMAND_IDS, type AgentKCommandId } from './commandIds';
export {
  bindAgentKConfigBridge,
  bindProjectConfig,
  setProjectConfigPostToWebview,
} from './configBridge';
export {
  setUsageStatusBarItem,
  updateUsageStatusBar,
} from './runtimeSingletons';
export { handleWebviewMessage } from './handleWebviewMessage';
export { getWebviewHtml } from './webviewHtml';
