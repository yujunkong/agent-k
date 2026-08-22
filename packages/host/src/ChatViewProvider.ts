/**
 * HOST-001 / EXT-* — Chat WebviewViewProvider.
 * Webview lifecycle, message router, command surface stubs.
 */

import * as vscode from 'vscode';
import type { ChatSendContext, HostLoopRuntime } from './chatSend';
import { handleWebviewMessage } from './handleWebviewMessage';
import { getNonce } from './nonce';
import {
  abortPlanV2Generate,
  type PlanGenerateContext,
} from './planGenerate';
import { getWebviewHtml } from './webviewHtml';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  /** Must match contributes.views id in extensions/agent-k/package.json. */
  public static readonly viewType = 'agent-k.chat';

  private view?: vscode.WebviewView;

  /** HOST-002 — in-flight agent loops keyed by requestId. */
  private readonly hostLoops = new Map<string, HostLoopRuntime>();
  private hostLoopRequestId: string | undefined;

  /** HOST-008 — Plan V2 generate abort tracking. */
  private readonly planV2Aborts = new Map<
    string,
    { abort: AbortController; sessionId: string }
  >();
  private readonly planV2CancelledIds = new Set<string>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly extensionVersion: string,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      // media/ holds chat-ui IIFE built by @agent-k/chat-ui.
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      handleWebviewMessage(this.routerContext(), message);
    });
  }

  /** Post a host→webview message when the view is alive. */
  public postMessage(message: unknown): Thenable<boolean> | undefined {
    return this.view?.webview.postMessage(message);
  }

  /** Build router ctx bound to this provider instance. */
  private routerContext() {
    const chatSend: ChatSendContext = {
      webview: this.view?.webview,
      hostLoops: this.hostLoops,
      getHostLoopRequestId: () => this.hostLoopRequestId,
      setHostLoopRequestId: (id) => {
        this.hostLoopRequestId = id;
      },
    };
    const planGenerate: PlanGenerateContext = {
      webview: this.view?.webview,
      planV2Aborts: this.planV2Aborts,
      planV2CancelledIds: this.planV2CancelledIds,
      abortPlanV2Generate: (requestId) =>
        abortPlanV2Generate(planGenerate, requestId),
    };
    return {
      webview: this.view?.webview,
      extensionVersion: this.extensionVersion,
      chatSend,
      planGenerate,
    };
  }

  // ─── EXT-003 command stubs (HOST-*/PLAN-*/MCP-* fill behavior later) ───

  public newSession(): void {
    void this.focusChatView();
  }

  public openSettings(tab?: string): void {
    void this.focusChatView();
    // SET-001 — open Models panel in the chat webview.
    void this.view?.webview.postMessage({
      type: 'settings.open',
      tab: tab || 'models',
    });
  }

  public openProjectConfig(): void {
    void this.focusChatView();
    void import('./configProject').then((m) => m.handleProjectConfigOpen());
  }

  public switchMode(): void {
    void this.focusChatView();
  }

  public focusInput(): void {
    void this.focusChatView();
  }

  public attachEditorSelection(): void {
    void this.focusChatView();
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      void vscode.window.showInformationMessage(
        '[Agent K] Select text in the editor to attach.',
      );
      return;
    }
    // HOST-002 attachment payload wiring lands with composer UI (CHAT-*).
    void vscode.window.showInformationMessage(
      `[Agent K] Selection ready (${editor.selection.end.line - editor.selection.start.line + 1} line(s)).`,
    );
  }

  public requestInlineEdit(): void {
    void vscode.window.showInformationMessage('[Agent K] Inline Edit (INLINE-* pending)');
  }

  public openPlanCreate(): void {
    void this.focusChatView();
  }

  public buildPlanFromEditor(_uri?: vscode.Uri): void {
    void vscode.window.showInformationMessage('[Agent K] Build Plan (PLAN-* pending)');
  }

  public openPlanReviewFromEditor(_uri?: vscode.Uri): void {
    void vscode.window.showInformationMessage('[Agent K] Plan Review (PLAN-* pending)');
  }

  public openDebug(): void {
    void this.focusChatView();
  }

  public openReview(): void {
    void this.focusChatView();
  }

  public openBrowserSession(): void {
    void this.focusChatView();
  }

  public openArtifacts(): void {
    void this.focusChatView();
  }

  public mcpReload(): void {
    void vscode.window.showInformationMessage('[Agent K] MCP Reload (MCP-* pending)');
  }

  public mcpConnect(): void {
    void vscode.window.showInformationMessage('[Agent K] MCP Connect (MCP-* pending)');
  }

  public mcpDisconnect(): void {
    void vscode.window.showInformationMessage('[Agent K] MCP Disconnect (MCP-* pending)');
  }

  public runBestOfN(): void {
    void vscode.window.showInformationMessage('[Agent K] Best-of-N (BON-* pending)');
  }

  /**
   * Reveal Agent K Activity Bar (public helper for commands).
   * Matches v2.1 revealChat: container only — focus.input is separate.
   */
  public async revealChatView(): Promise<void> {
    await this.focusChatView();
  }

  /** Reveal the Agent-K Activity Bar container (v2.1: workbench.view.extension.agent-k). */
  private async focusChatView(): Promise<void> {
    try {
      await vscode.commands.executeCommand('workbench.view.extension.agent-k');
    } catch {
      /* container may already be visible */
    }
  }

  private getHtml(webview: vscode.Webview): string {
    // Cache-bust so Extension Host never serves stale chat.js/css after rebuild.
    const bust = String(Date.now());
    const scriptUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.js'))
      .with({ query: `v=${bust}` });
    const styleUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.css'))
      .with({ query: `v=${bust}` });

    return getWebviewHtml({
      nonce: getNonce(),
      cspSource: webview.cspSource,
      scriptUri: scriptUri.toString(),
      styleUri: styleUri.toString(),
    });
  }
}
