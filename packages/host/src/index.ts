/**
 * @agent-k/host — Extension Host bridge (vscode API).
 *
 * Feature IDs:
 * - EXT-001 Extension activation
 * - EXT-002 Chat View shell loader (media/chat.js)
 * - EXT-003 Command registration
 * - EXT-004 CSP / nonce / Webview security
 * - EXT-005 Workspace path abstraction
 *
 * No React UI / agent loop / tool executor body.
 */

export { activateAgentK, deactivateAgentK } from './activate';
export { ChatViewProvider } from './ChatViewProvider';
export { AGENT_K_COMMAND_IDS, type AgentKCommandId } from './commandIds';
export { createNonce, getNonce } from './nonce';
export { registerCommands } from './registerCommands';
export { replyToWebviewMessage } from './replyToWebviewMessage';
export { buildShellHtml, getWebviewHtml } from './webviewHtml';
export { buildWebviewCsp } from './webviewCsp';
export {
  resolveWorkspaceRelativeSegments,
  toWorkspaceRelativePath,
  type WorkspaceFolderLike,
} from './workspacePaths';
