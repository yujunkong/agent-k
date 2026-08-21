/**
 * @agent-k/host — Extension Host bridge (vscode API).
 *
 * Feature IDs:
 * - EXT-001 Extension activation
 * - EXT-002 Chat View shell loader (media/chat.js)
 *
 * No React UI / agent loop / tool executor body.
 */

export { activateAgentK, deactivateAgentK } from './activate';
export { ChatViewProvider } from './ChatViewProvider';
export { createNonce } from './nonce';
export { replyToWebviewMessage } from './replyToWebviewMessage';
export { buildShellHtml } from './shellHtml';
