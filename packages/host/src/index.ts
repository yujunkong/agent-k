/**
 * @agent-k/host — Extension Host bridge (vscode API).
 *
 * Feature IDs:
 * - EXT-001 Extension activation + minimal chat webview hello
 *
 * No React UI / agent loop / tool executor body.
 */

export { activateAgentK, deactivateAgentK } from './activate';
export { ChatViewProvider } from './ChatViewProvider';
export { buildHelloHtml } from './helloHtml';
export { createNonce } from './nonce';
export { replyToWebviewMessage } from './replyToWebviewMessage';
