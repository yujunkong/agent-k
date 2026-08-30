/**
 * EXT-001 / HOST-* — Extension Host activation wiring.
 * Register webview provider first, then commands + config bridges.
 */

import * as vscode from 'vscode';
import { ChatViewProvider } from './ChatViewProvider';
import {
  bindAgentKConfigBridge,
  bindProjectConfig,
  setProjectConfigPostToWebview,
} from './configBridge';
import { registerCommands } from './registerCommands';
import {
  setUsageStatusBarItem,
  updateUsageStatusBar,
} from './runtimeSingletons';
import { getHostLog, hostLog } from './hostLog';
import {
  bootstrapMcpOnActivate,
  shutdownMcp,
} from './mcpHost';

let provider: ChatViewProvider | undefined;

/**
 * Activate Agent-K host bridges for this ExtensionContext.
 * Called from extensions/agent-k thin assembler only.
 */
export function activateAgentK(context: vscode.ExtensionContext): ChatViewProvider {
  // Keep Output channel alive for the session
  context.subscriptions.push(getHostLog());
  hostLog('host activate', `version=${context.extension.packageJSON?.version ?? '?'}`);

  const extensionVersion =
    typeof context.extension.packageJSON?.version === 'string'
      ? context.extension.packageJSON.version
      : '0.0.0';

  provider = new ChatViewProvider(context.extensionUri, extensionVersion);
  provider.wireInlineEditBridge();
  context.subscriptions.push(
    provider.getInlineEditController().register(context),
  );

  // Register BEFORE any work that can throw — Activity Bar view must resolve.
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // EXT-003 — command catalog.
  context.subscriptions.push(...registerCommands(provider));

  // HOST-004 / HOST-005 — config bridges.
  setProjectConfigPostToWebview((msg) => {
    void provider?.postMessage(msg);
  });
  bindAgentKConfigBridge(context);
  bindProjectConfig(context);

  // Comment: MCP-001/002 — best-effort connect from agent-k.mcp.servers
  void bootstrapMcpOnActivate();
  context.subscriptions.push({
    dispose: () => {
      void shutdownMcp();
    },
  });

  // HOST-006 — usage status bar (best-effort).
  try {
    const item = vscode.window.createStatusBarItem(
      'agent-k.usage',
      vscode.StatusBarAlignment.Right,
      100,
    );
    setUsageStatusBarItem(item);
    context.subscriptions.push(item);
    updateUsageStatusBar();
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('agent-k.telemetry.statusBarEnabled')) {
          updateUsageStatusBar();
        }
      }),
    );
  } catch {
    /* non-fatal */
  }

  // EXT-001 — match v2.1: after layout settles, open Agent K Activity Bar container.
  // Only `workbench.view.extension.agent-k` (no extra .focus / view.show).
  const t = setTimeout(() => {
    void vscode.commands.executeCommand('workbench.view.extension.agent-k');
  }, 100);
  context.subscriptions.push({ dispose: () => clearTimeout(t) });

  return provider;
}

/** Clear host singletons on deactivate. */
export function deactivateAgentK(): void {
  setProjectConfigPostToWebview(undefined);
  setUsageStatusBarItem(undefined);
  void shutdownMcp();
  provider = undefined;
}
