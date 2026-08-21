/**
 * EXT-001 / EXT-002 — Chat WebviewViewProvider.
 * Loads chat-ui shell from extension media/; hello via SHARED protocol.
 */

import * as vscode from 'vscode';
import { createNonce } from './nonce';
import { replyToWebviewMessage } from './replyToWebviewMessage';
import { buildShellHtml } from './shellHtml';

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

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.css'),
    );

    return buildShellHtml({
      nonce: createNonce(),
      cspSource: webview.cspSource,
      scriptUri: scriptUri.toString(),
      styleUri: styleUri.toString(),
    });
  }
}
