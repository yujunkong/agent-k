/**
 * HOST-006 — Runtime singleton holders (domain services wire later).
 * DebugLogServer / MCPClient / SessionUsageTracker land with DEBUG/MCP/TEL Features.
 */

import * as vscode from 'vscode';

/** Placeholder until DEBUG-* DebugLogServer exists. */
export const debugLogServer = {
  start: async (): Promise<void> => undefined,
  stop: (): void => undefined,
};

/** MCP-* client — prefer mcpHost.getMcpClient(); kept for legacy imports. */
export { getMcpClient as mcpClientSingleton } from './mcpHost';

/** @deprecated use getMcpToolBridge / getMcpClient from mcpHost */
export const mcpClient = {
  disconnectAll: async (): Promise<void> => {
    const { shutdownMcp } = await import('./mcpHost');
    await shutdownMcp();
  },
};

/** Placeholder until TEL-* usage tracker exists. */
export const sessionUsageTracker = {
  getTotals: (): { totalTokens: number } => ({ totalTokens: 0 }),
  formatStatusBar: (): string => 'Agent K',
  formatTooltip: (): string => 'Agent K usage (pending)',
};

export let usageStatusBarItem: vscode.StatusBarItem | undefined;

export function setUsageStatusBarItem(item: vscode.StatusBarItem | undefined): void {
  usageStatusBarItem = item;
}

/** Best-effort status bar refresh; never throws into activate. */
export function updateUsageStatusBar(): void {
  try {
    if (!usageStatusBarItem) return;
    const enabled = vscode.workspace
      .getConfiguration('agent-k')
      .get('telemetry.statusBarEnabled', true);
    const totals = sessionUsageTracker.getTotals();
    if (!enabled || totals.totalTokens <= 0) {
      usageStatusBarItem.hide();
      return;
    }
    usageStatusBarItem.text = sessionUsageTracker.formatStatusBar();
    usageStatusBarItem.tooltip = sessionUsageTracker.formatTooltip();
    usageStatusBarItem.show();
  } catch {
    /* status bar is best-effort */
  }
}
