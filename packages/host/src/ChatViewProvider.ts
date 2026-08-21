/**
 * EXT-001 / EXT-002 / EXT-003 / EXT-004 — Chat WebviewViewProvider.
 * Loads chat-ui shell from extension media/; hello via SHARED protocol.
 * Command surface stubs (EXT-003) until HOST-* feature bodies land.
 */

import * as vscode from 'vscode';
import { getNonce } from './nonce';
import { replyToWebviewMessage } from './replyToWebviewMessage';
import { getWebviewHtml } from './webviewHtml';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  /** Must match contributes.views id in extensions/agent-k/package.json. */
  public static readonly viewType = 'agent-k.chat';

  private view?: vscode.WebviewView;

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
      const reply = replyToWebviewMessage(message, this.extensionVersion);
      if (reply) {
        void webviewView.webview.postMessage(reply);
      }
    });
  }

  /** Post a host→webview message when the view is alive (HOST-* later). */
  public postMessage(message: unknown): Thenable<boolean> | undefined {
    return this.view?.webview.postMessage(message);
  }

  // ─── EXT-003 command stubs (HOST-*/PLAN-*/MCP-* fill behavior later) ───

  /** Focus chat view and request a new session (HOST-007). */
  public newSession(): void {
    void this.focusChatView();
    void vscode.window.showInformationMessage('[Agent K] New Chat (HOST-007 pending)');
  }

  /** Open settings panel in webview (HOST-004). */
  public openSettings(_tab?: string): void {
    void this.focusChatView();
    void vscode.window.showInformationMessage('[Agent K] Open Settings (HOST-004 pending)');
  }

  /** Open project config (HOST-005). */
  public openProjectConfig(): void {
    void this.focusChatView();
    void vscode.window.showInformationMessage(
      '[Agent K] Open Project Config (HOST-005 pending)',
    );
  }

  /** Switch agent mode (MODE-* / HOST later). */
  public switchMode(): void {
    void this.focusChatView();
    void vscode.window.showInformationMessage('[Agent K] Switch Mode (MODE-* pending)');
  }

  /** Focus composer input in webview. */
  public focusInput(): void {
    void this.focusChatView();
  }

  /** Attach active editor selection to chat (HOST-002). */
  public attachEditorSelection(): void {
    void this.focusChatView();
    void vscode.window.showInformationMessage(
      '[Agent K] Attach Selection (HOST-002 pending)',
    );
  }

  /** Inline edit entry (INLINE-*). */
  public requestInlineEdit(): void {
    void vscode.window.showInformationMessage('[Agent K] Inline Edit (INLINE-* pending)');
  }

  /** Plan create (PLAN-*). */
  public openPlanCreate(): void {
    void this.focusChatView();
    void vscode.window.showInformationMessage('[Agent K] Plan Create (PLAN-* pending)');
  }

  /** Build plan from editor / CodeLens (PLAN-*). */
  public buildPlanFromEditor(_uri?: vscode.Uri): void {
    void vscode.window.showInformationMessage('[Agent K] Build Plan (PLAN-* pending)');
  }

  /** Open plan review (PLAN-*). */
  public openPlanReviewFromEditor(_uri?: vscode.Uri): void {
    void vscode.window.showInformationMessage('[Agent K] Plan Review (PLAN-* pending)');
  }

  /** Debug mode start (DEBUG-*). */
  public openDebug(): void {
    void this.focusChatView();
    void vscode.window.showInformationMessage('[Agent K] Debug Start (DEBUG-* pending)');
  }

  /** Code review session. */
  public openReview(): void {
    void this.focusChatView();
    void vscode.window.showInformationMessage('[Agent K] Code Review (pending)');
  }

  /** Browser session (BROWSER-*). */
  public openBrowserSession(): void {
    void this.focusChatView();
    void vscode.window.showInformationMessage('[Agent K] Browser Session (BROWSER-* pending)');
  }

  /** Artifacts gallery (ART-*). */
  public openArtifacts(): void {
    void this.focusChatView();
    void vscode.window.showInformationMessage('[Agent K] Artifacts Gallery (ART-* pending)');
  }

  /** MCP reload (MCP-*). */
  public mcpReload(): void {
    void vscode.window.showInformationMessage('[Agent K] MCP Reload (MCP-* pending)');
  }

  /** MCP connect (MCP-*). */
  public mcpConnect(): void {
    void vscode.window.showInformationMessage('[Agent K] MCP Connect (MCP-* pending)');
  }

  /** MCP disconnect (MCP-*). */
  public mcpDisconnect(): void {
    void vscode.window.showInformationMessage('[Agent K] MCP Disconnect (MCP-* pending)');
  }

  /** Best-of-N (BON-*). */
  public runBestOfN(): void {
    void vscode.window.showInformationMessage('[Agent K] Best-of-N (BON-* pending)');
  }

  /** Reveal the Agent-K Activity Bar container + chat webview. */
  private async focusChatView(): Promise<void> {
    // workbench.view.extension.<containerId> opens the Activity Bar view.
    await vscode.commands.executeCommand('workbench.view.extension.agent-k');
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
