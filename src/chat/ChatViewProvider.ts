import * as vscode from 'vscode';
import { getNonce } from './utils/getNonce';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'agent-k.chat';

  private view?: vscode.WebviewView;
  private getNonce: () => string;

  constructor(
    private readonly extensionUri: vscode.Uri,
    getNonce: () => string
  ) {
    this.getNonce = getNonce;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      undefined,
      []
    );
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'chat.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'chat.css')
    );
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="${styleUri}" nonce="${nonce}">
        <title>Agent K Chat</title>
      </head>
      <body>
        <div id="chat-root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'chat.send':
        this.handleSendMessage(message.payload);
        break;
      case 'chat.stop':
        this.handleStop();
        break;
      case 'chat.regenerate':
        this.handleRegenerate();
        break;
      case 'chat.edit':
        this.handleEditMessage(message.payload);
        break;
      case 'chat.delete':
        this.handleDeleteMessage(message.payload);
        break;
      case 'chat.pin':
        this.handlePinMessage(message.payload);
        break;
      case 'mode.switch':
        this.handleModeSwitch(message.payload);
        break;
      case 'mention.request':
        this.handleMentionRequest(message.payload);
        break;
      case 'settings.open':
        vscode.commands.executeCommand('workbench.action.openSettings', 'agent-k');
        break;
      case 'provider.add':
        this.openProviderSettings();
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  private handleSendMessage(payload: any) {
    this.view?.webview.postMessage({
      type: 'stream.start',
      payload: { messageId: payload.messageId }
    });
  }

  private handleStop() {
    this.view?.webview.postMessage({ type: 'stream.stop' });
  }

  private handleRegenerate() {
    this.view?.webview.postMessage({ type: 'stream.regenerate' });
  }

  private handleEditMessage(payload: any) {
    this.view?.webview.postMessage({ type: 'message.edit', payload });
  }

  private handleDeleteMessage(payload: any) {
    this.view?.webview.postMessage({ type: 'message.delete', payload });
  }

  private handlePinMessage(payload: any) {
    this.view?.webview.postMessage({ type: 'message.pin', payload });
  }

  private handleModeSwitch(payload: any) {
    this.view?.webview.postMessage({ type: 'mode.changed', payload });
  }

  private handleMentionRequest(payload: any) {
    this.view?.webview.postMessage({ type: 'mention.results', payload });
  }

  public newSession() {
    this.view?.webview.postMessage({ type: 'session.new' });
  }

  public openProviderSettings() {
    this.view?.webview.postMessage({ type: 'settings.open', tab: 'providers' });
  }

  public switchMode() {
    this.view?.webview.postMessage({ type: 'mode.switch' });
  }
}