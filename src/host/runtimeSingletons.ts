import * as vscode from 'vscode';
import { DebugLogServer } from '../debug/DebugLogServer';
import { MCPClient } from '../mcp/MCPClient';
import { SessionUsageTracker } from '../telemetry/StatusBarCost';

export const debugLogServer = new DebugLogServer();
export const mcpClient = new MCPClient();
export const sessionUsageTracker = new SessionUsageTracker();

export let usageStatusBarItem: vscode.StatusBarItem | undefined;

export function setUsageStatusBarItem(item: vscode.StatusBarItem | undefined): void {
  usageStatusBarItem = item;
}

/** ADDON-T11: Status Bar 텍스트/표시 여부 갱신. 실패해도 activate/turn을 막지 않는다. */
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
    /* status bar is best-effort — never break the agent loop */
  }
}
