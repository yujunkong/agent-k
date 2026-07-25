import * as vscode from 'vscode';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'agent-k.chat';

  private _view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
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
    const nonce = getNonce();

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
    // Handle messages from webview
    console.log('Webview message:', message);
  }

  public newSession() {
    this._view?.webview.postMessage({ type: 'session.new' });
  }

  public clearHistory() {
    this._view?.webview.postMessage({ type: 'session.clear' });
  }

  public openProviderSettings() {
    vscode.commands.executeCommand('workbench.action.openSettings', 'agent-k.provider');
  }

  public switchMode() {
    this._view?.webview.postMessage({ type: 'mode.switch' });
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Agent K extension activated');

  const provider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),

    vscode.commands.registerCommand('agent-k.chat.new', () => {
      provider.newSession();
    }),

    vscode.commands.registerCommand('agent-k.chat.clear', () => {
      provider.clearHistory();
    }),

    vscode.commands.registerCommand('agent-k.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'agent-k');
    }),

    vscode.commands.registerCommand('agent-k.provider.add', () => {
      provider.openProviderSettings();
    }),

    vscode.commands.registerCommand('agent-k.mode.switch', () => {
      provider.switchMode();
    })
  );
}

export function deactivate() {}