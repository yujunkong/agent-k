/**
 * EXT-001 / EXT-003 — Extension Host activation wiring.
 * Register webview provider first (v2.1 pattern) so the sidebar never deadlocks,
 * then register the EXT-003 command catalog.
 */

import * as vscode from 'vscode';
import { ChatViewProvider } from './ChatViewProvider';
import { registerCommands } from './registerCommands';

let provider: ChatViewProvider | undefined;

/**
 * Activate Agent-K host bridges for this ExtensionContext.
 * Called from extensions/agent-k thin assembler only.
 */
export function activateAgentK(context: vscode.ExtensionContext): ChatViewProvider {
  const extensionVersion =
    typeof context.extension.packageJSON?.version === 'string'
      ? context.extension.packageJSON.version
      : '0.0.0';

  provider = new ChatViewProvider(context.extensionUri, extensionVersion);

  // Register BEFORE any work that can throw — Activity Bar view must resolve.
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // EXT-003 — command catalog (stubs until HOST-*/PLAN-*/MCP-* land).
  context.subscriptions.push(...registerCommands(provider));

  return provider;
}

/** Clear host singletons on deactivate (EXT-001: provider reference only). */
export function deactivateAgentK(): void {
  provider = undefined;
}
