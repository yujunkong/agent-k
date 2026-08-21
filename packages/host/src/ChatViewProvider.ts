/**
 * EXT-001 — minimal Chat WebviewViewProvider (hello handshake only).
 * Full chat runtime / send bridge lands in HOST-001 / HOST-002.
 */

import * as vscode from 'vscode';
import { buildHelloHtml } from './helloHtml';
import { createNonce } from './nonce';
import { replyToWebviewMessage } from './replyToWebviewMessage';

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
      localResourceRoots: [this.extensionUri],
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
    return buildHelloHtml({
      nonce: createNonce(),
      cspSource: webview.cspSource,
    });
  }
}
