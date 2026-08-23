/**
 * EXT-003 — command registration wiring (host side).
 * Handlers are stubs until HOST-* / PLAN-* / MCP-* feature bodies land.
 */

import * as vscode from 'vscode';
import { AGENT_K_COMMAND_IDS } from './commandIds';
import type { ChatViewProvider } from './ChatViewProvider';
import { clipboardCopyWithPath } from './clipboardCopyWithPath';

/**
 * Register all Agent-K commands against the ChatViewProvider surface.
 * Returns disposables for ExtensionContext.subscriptions.
 */
export function registerCommands(
  provider: ChatViewProvider,
): vscode.Disposable[] {
  // Map each contribute id to a provider method (stubs OK for Phase 0).
  const handlers: Record<string, (...args: unknown[]) => unknown> = {
    'agent-k.chat.new': () => provider.newSession(),
    'agent-k.openSettings': () => provider.openSettings('models'),
    'agent-k.openProjectConfig': () => provider.openProjectConfig(),
    'agent-k.provider.add': () => provider.openSettings('models'),
    'agent-k.mode.switch': () => provider.switchMode(),
    'agent-k.chat.focusInput': () => provider.focusInput(),
    'agent-k.chat.attachSelection': () => provider.attachEditorSelection(),
    // Comment: Cmd/Ctrl+C|X — stash path at copy time for Chat paste chips
    'agent-k.clipboardCopyWithPath': () => clipboardCopyWithPath({ cut: false }),
    'agent-k.clipboardCutWithPath': () => clipboardCopyWithPath({ cut: true }),
    'agent-k.inlineEdit': () => provider.requestInlineEdit(),
    'agent-k.plan.open': () => provider.openPlanCreate(),
    'agent-k.plan.build': (uri?: unknown) =>
      provider.buildPlanFromEditor(uri as vscode.Uri | undefined),
    'agent-k.plan.openReview': (uri?: unknown) =>
      provider.openPlanReviewFromEditor(uri as vscode.Uri | undefined),
    'agent-k.debug.open': () => provider.openDebug(),
    'agent-k.review.open': () => provider.openReview(),
    'agent-k.browser.open': () => provider.openBrowserSession(),
    'agent-k.artifacts.open': () => provider.openArtifacts(),
    'agent-k.mcp.reload': () => provider.mcpReload(),
    'agent-k.mcp.connect': () => provider.mcpConnect(),
    'agent-k.mcp.disconnect': () => provider.mcpDisconnect(),
    'agent-k.bestOfN.run': () => provider.runBestOfN(),
  };

  // Guard: every catalog id must have a handler (prevents silent drift).
  for (const id of AGENT_K_COMMAND_IDS) {
    if (!handlers[id]) {
      throw new Error(`EXT-003: missing handler for ${id}`);
    }
  }

  return AGENT_K_COMMAND_IDS.map((id) =>
    vscode.commands.registerCommand(id, (...args: unknown[]) => handlers[id](...args)),
  );
}
