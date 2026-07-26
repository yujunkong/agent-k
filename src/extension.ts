import * as vscode from 'vscode';
import { registerReadTools } from './tools/readTools';
import { registerEditTools } from './tools/editTools';
import { registerC5C7Tools } from './tools/c5c7Tools';
import { DebugLogServer } from './debug/DebugLogServer';
import { MCPClient } from './mcp/MCPClient';
import { bootstrapMcpFromSettings, registerMcpToolsInRegistry } from './mcp/bootstrapMcp';
import { RuntimeServices } from './core/RuntimeServices';
import { PlanStorage } from './plan/PlanStorage';
import {
  PlanCodeLensProvider,
  readPlanFromEditor,
  updatePlanDocumentContext
} from './plan/PlanCodeLensProvider';
import { DebugStorage } from './debug/DebugStorage';
import { MemoryStore } from './memories/MemoryStore';
import { PermissionGate } from './permission/PermissionGate';
import { CheckpointManager } from './checkpoint/CheckpointManager';
import { getSkillRegistry } from './skills/SkillRegistry';
import * as path from 'path';
import { configManager, AGENT_K_VSCODE_CONFIG_KEYS } from './core/ConfigManager';

/** RW-P0-03: VS Code workspace config ↔ ConfigManager singleton bridge */
function agentKSubKey(fullKey: string): string {
  return fullKey.replace(/^agent-k\./, '');
}

function readAgentKFromVSCode(): Record<string, unknown> {
  const section = vscode.workspace.getConfiguration('agent-k');
  const values: Record<string, unknown> = {};
  for (const fullKey of AGENT_K_VSCODE_CONFIG_KEYS) {
    const v = section.get(agentKSubKey(fullKey));
    if (v !== undefined) {
      values[fullKey] = v;
    }
  }
  return values;
}

function bindAgentKConfigBridge(context: vscode.ExtensionContext): void {
  configManager.bindVSCodeUpdater(async (key, value) => {
    await vscode.workspace
      .getConfiguration('agent-k')
      .update(agentKSubKey(key), value, vscode.ConfigurationTarget.Global);
  });

  configManager.syncFromVSCode(readAgentKFromVSCode());

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('agent-k')) return;
      configManager.syncFromVSCode(readAgentKFromVSCode());
      const level = configManager.get('agent-k.permission.level') || 'accept_edits';
      RuntimeServices.getPermissionGate()?.setLevel(level);
    })
  );
}

// RW-C6-04: DebugLogServer 전역 인스턴스 (activate/deactivate 수명주기)
const debugLogServer = new DebugLogServer();
// RW-C7-03: MCPClient 전역 인스턴스
const mcpClient = new MCPClient();

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'agent-k.chat';

  private _view?: vscode.WebviewView;
  /** Active AgentLoopController for chat Agent/Plan/Debug (turn contract) */
  private _hostLoop?: import('./loop/AgentLoopController').AgentLoopController;
  private _hostLoopRequestId?: string;
  private _hostLoopAbort?: AbortController;

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
    // Cache-bust so Extension Host never serves a stale chat.js/css after rebuild
    const bust = String(Date.now());
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'chat.js')
    ).with({ query: `v=${bust}` });
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'chat.css')
    ).with({ query: `v=${bust}` });
    const nonce = getNonce();
    // Fail only on real script errors — large chat.js can exceed a short timeout while parsing
    const boot = `
      (function(){
        var el = document.getElementById('chat-root');
        if (!el) return;
        el.innerHTML = '<p style="padding:12px;opacity:.7;font-family:var(--vscode-font-family)">Loading Agent K UI…</p>';
        window.__akShowUiFail = function(detail){
          if (!el || el.querySelector('.chat-container') || el.querySelector('[data-ak-error]')) return;
          el.innerHTML = '<div data-ak-error style="padding:12px;color:var(--vscode-errorForeground)">' +
            '<p><b>Chat UI failed to load.</b></p>' +
            '<p style="opacity:.85">' + (detail || '') + '</p>' +
            '<p>1) In agent-k folder run: <code>npm run build:webview</code></p>' +
            '<p>2) Close this window and press <b>F5</b> again (Extension Development Host).</p></div>';
        };
        setTimeout(function(){
          if (el && !el.querySelector('.chat-container') && !el.querySelector('[data-ak-error]')) {
            window.__akShowUiFail('Timed out waiting for React mount (check Webview Developer Tools console).');
          }
        }, 15000);
      })();
    `;

    return `<!DOCTYPE html>
      <html lang="en" style="height:100%;width:100%;overflow:hidden;">
      <head>
        <meta charset="UTF-8">
        <!-- connect-src: webview fetch (Models tab test, chat API calls) -->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src http: https: ws: wss:; script-src 'nonce-${nonce}' ${webview.cspSource}; style-src 'nonce-${nonce}' 'unsafe-inline' ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="${styleUri}" nonce="${nonce}">
        <title>Agent K Chat</title>
        <style nonce="${nonce}">
          html, body { position: fixed; inset: 0; margin: 0; overflow: hidden; height: 100%; width: 100%; }
          #chat-root { position: absolute; inset: 0; overflow: hidden; display: flex; flex-direction: column; }
        </style>
      </head>
      <body style="height:100%;width:100%;overflow:hidden;margin:0;">
        <div id="chat-root"></div>
        <script nonce="${nonce}">
          (function(){
            try {
              window.__vscodeApi = acquireVsCodeApi();
            } catch (e) {
              window.__vscodeApi = { postMessage: function(m){ window.parent.postMessage(m,'*'); } };
            }
          })();
        </script>
        <script nonce="${nonce}">${boot}</script>
        <script nonce="${nonce}" src="${scriptUri}" onerror="window.__akShowUiFail && window.__akShowUiFail('dist/chat.js failed to load (404 or CSP).')"></script>
      </body>
      </html>`;
  }

  /** Extension Host에서 /v1/models 연결 테스트 (CSP·CORS 우회) */
  private async runProviderConnectionTest(
    requestId: string,
    baseUrl: string,
    apiKey?: string,
    model?: string
  ): Promise<void> {
    const webview = this._view?.webview;
    if (!webview) return;

    const post = (payload: Record<string, unknown>) => {
      void webview.postMessage({ type: 'provider.test.result', requestId, ...payload });
    };

    const root = String(baseUrl || '').replace(/\/$/, '');
    if (!root) {
      post({ ok: false, detail: 'Base URL is empty' });
      return;
    }

    try {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }
      const response = await fetch(`${root}/v1/models`, { headers });
      const status = response.status;

      if (!response.ok) {
        let detail = `HTTP ${status}`;
        if (status === 401) {
          detail +=
            ' — Unauthorized. LiteLLM (:4000) needs a valid master key in API Key. Or use direct MLX at http://127.0.0.1:52415 with full model id (e.g. mlx-community/Qwen3.6-35B-A3B-4bit).';
        }
        post({ ok: false, status, detail });
        return;
      }

      const data = (await response.json()) as { data?: Array<{ id?: string }> };
      const modelIds = (data?.data || []).map((m) => m.id).filter(Boolean) as string[];
      const found = model ? modelIds.includes(model) : false;
      const detail =
        model && found
          ? `OK — model "${model}" listed (${modelIds.length} models)`
          : modelIds.length > 0
            ? `OK — server reachable (${modelIds.length} models). Model may still work if loaded on demand.`
            : 'OK — server reachable (no models in list).';

      post({ ok: true, status, detail, modelIds });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      post({ ok: false, detail: msg || 'Connection failed' });
    }
  }

  /** Resolve context window for current/selected provider+model → webview */
  private async refreshModelContext(message: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    providerType?: string;
  }): Promise<void> {
    const webview = this._view?.webview;
    if (!webview) return;
    const cfg = vscode.workspace.getConfiguration('agent-k');
    const providerType = String(
      message.providerType || cfg.get('provider.type') || 'litellm'
    ) as 'litellm' | 'openai' | 'anthropic' | 'ollama' | 'lmstudio';
    const baseUrl = String(
      message.baseUrl || cfg.get('provider.baseUrl') || 'http://127.0.0.1:52415'
    ).replace(/\/$/, '');
    const model = String(
      message.model || cfg.get('provider.model') || 'mlx-community/Qwen3.6-35B-A3B-4bit'
    );
    const apiKey =
      message.apiKey != null
        ? String(message.apiKey)
        : cfg.get<string>('provider.apiKey') || undefined;
    const fallbackBudget = Number(cfg.get('context.budget')) || 100000;

    try {
      const { resolveModelContextInfo, clearModelContextCache } = await import(
        './providers/modelContextInfo'
      );
      clearModelContextCache();
      const info = await resolveModelContextInfo({
        providerType,
        baseUrl,
        apiKey,
        model,
        fallbackTokens: fallbackBudget
      });
      void webview.postMessage({
        type: 'model.context',
        model: info.model,
        providerType: info.providerType,
        maxInputTokens: info.maxInputTokens,
        maxOutputTokens: info.maxOutputTokens,
        source: info.source
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void webview.postMessage({
        type: 'model.context',
        model,
        providerType,
        maxInputTokens: fallbackBudget,
        source: 'fallback',
        error: msg
      });
    }
  }

  private handleMessage(message: any) {
    if (!message || typeof message !== 'object') return;
    // Models tab: 연결 테스트는 Host fetch로 수행
    if (message.type === 'provider.test' && message.requestId != null) {
      void this.runProviderConnectionTest(
        String(message.requestId),
        String(message.baseUrl ?? ''),
        message.apiKey ? String(message.apiKey) : undefined,
        message.model ? String(message.model) : undefined
      );
      return;
    }
    // Agent/Plan/Debug: host-mediated tool loop (webview cannot run fs tools)
    if (message.type === 'chat.send' && message.requestId != null) {
      void this.runHostChatSend(message);
      return;
    }
    if (message.type === 'model.context.refresh') {
      void this.refreshModelContext(message);
      return;
    }
    if (message.type === 'chat.stop') {
      this.abortHostChatLoop(message.requestId != null ? String(message.requestId) : undefined);
      return;
    }
    // ask_question answer from ClarifyingQuestions (host waits on RuntimeServices)
    if (message.type === 'chat.answer' && message.qid != null) {
      RuntimeServices.resolveQuestion(String(message.qid), String(message.answer ?? ''));
      return;
    }
    if (message.type === 'chat.question.cancel') {
      RuntimeServices.cancelQuestion(
        message.qid != null ? `ask_question cancelled: ${message.qid}` : 'ask_question cancelled'
      );
      return;
    }
    // Persist plan draft → <workspace>/.agentk/plans/tmp/plan_<hash>.md
    if (message.type === 'plan.save') {
      void (async () => {
        try {
          const content = String(message.content || '');
          const title = String(message.title || 'Plan');
          const existingSlug =
            message.slug != null ? String(message.slug) : undefined;
          const openInEditor = Boolean(message.openInEditor);
          const quiet = Boolean(message.quiet) || openInEditor;
          const stored = await PlanStorage.savePlan(title, content, existingSlug);
          this._view?.webview.postMessage({
            type: 'plan.saved',
            slug: stored.slug,
            title: stored.title,
            filePath: stored.filePath,
            requestId: message.requestId
          });
          const uri = vscode.Uri.file(stored.filePath);
          if (openInEditor) {
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, {
              preview: false,
              viewColumn: vscode.ViewColumn.One
            });
          } else if (!quiet) {
            const open = 'Open';
            const reveal = 'Reveal';
            void vscode.window
              .showInformationMessage(
                `Plan 저장됨: ${stored.filePath}`,
                open,
                reveal
              )
              .then(async (choice) => {
                if (choice === open) {
                  const doc = await vscode.workspace.openTextDocument(uri);
                  await vscode.window.showTextDocument(doc, { preview: true });
                } else if (choice === reveal) {
                  await vscode.commands.executeCommand('revealInExplorer', uri);
                }
              });
          }
        } catch (err: any) {
          const msg = err?.message || String(err);
          this._view?.webview.postMessage({
            type: 'plan.save.error',
            error: msg,
            requestId: message.requestId
          });
          void vscode.window.showErrorMessage(`Plan 저장 실패: ${msg}`);
        }
      })();
      return;
    }
    // Reload plan markdown from disk (after editing in VS Code editor)
    if (message.type === 'plan.load' && message.slug != null) {
      void (async () => {
        try {
          const loaded = await PlanStorage.loadPlan(String(message.slug));
          if (!loaded) {
            this._view?.webview.postMessage({
              type: 'plan.load.error',
              error: 'Plan file not found',
              requestId: message.requestId
            });
            return;
          }
          this._view?.webview.postMessage({
            type: 'plan.loaded',
            slug: loaded.plan.slug,
            title: loaded.plan.title,
            content: loaded.content,
            filePath: loaded.plan.filePath,
            requestId: message.requestId
          });
        } catch (err: any) {
          this._view?.webview.postMessage({
            type: 'plan.load.error',
            error: err?.message || String(err),
            requestId: message.requestId
          });
        }
      })();
      return;
    }
    // Persist debug session → <workspace>/.agentk/debug/tmp/debug_<hash>.md
    if (message.type === 'debug.save') {
      void (async () => {
        try {
          const content = String(message.content || '');
          const title = String(message.title || 'Debug Session');
          const existingSlug =
            message.slug != null ? String(message.slug) : undefined;
          const stage =
            message.stage != null ? String(message.stage) : undefined;
          const stored = await DebugStorage.saveSession(title, content, {
            existingSlug,
            stage
          });
          if (message.reproduce != null && String(message.reproduce).trim()) {
            await DebugStorage.saveSidecar(
              stored.slug,
              'reproduce',
              String(message.reproduce)
            );
          }
          if (message.logs != null && String(message.logs).trim()) {
            await DebugStorage.saveSidecar(
              stored.slug,
              'logs',
              String(message.logs)
            );
          }
          this._view?.webview.postMessage({
            type: 'debug.saved',
            slug: stored.slug,
            title: stored.title,
            filePath: stored.filePath,
            requestId: message.requestId
          });
          const open = 'Open';
          const reveal = 'Reveal';
          void vscode.window
            .showInformationMessage(
              `Debug 저장됨: ${stored.filePath}`,
              open,
              reveal
            )
            .then(async (choice) => {
              const uri = vscode.Uri.file(stored.filePath);
              if (choice === open) {
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, { preview: true });
              } else if (choice === reveal) {
                await vscode.commands.executeCommand('revealInExplorer', uri);
              }
            });
        } catch (err: any) {
          const msg = err?.message || String(err);
          this._view?.webview.postMessage({
            type: 'debug.save.error',
            error: msg,
            requestId: message.requestId
          });
          void vscode.window.showErrorMessage(`Debug 저장 실패: ${msg}`);
        }
      })();
      return;
    }
    // Cursor-like drag/drop: resolve file:// URIs → path + file|folder
    if (message.type === 'attachments.resolve' && message.requestId != null) {
      void this.resolveAttachmentUris(
        String(message.requestId),
        Array.isArray(message.uris) ? message.uris.map(String) : []
      );
      return;
    }
    // Paperclip attach — reliable without Shift+drop (webview DnD limitation)
    if (message.type === 'attachments.pick' && message.requestId != null) {
      void this.pickAttachmentUris(String(message.requestId));
      return;
    }
    // Webview → host: persist agent-k.* settings
    if (message.type === 'config.update' && message.values) {
      const section = vscode.workspace.getConfiguration('agent-k');
      for (const [fullKey, value] of Object.entries(message.values as Record<string, unknown>)) {
        const sub = String(fullKey).replace(/^agent-k\./, '');
        void section.update(sub, value, vscode.ConfigurationTarget.Global);
      }
      return;
    }
    if (message.type === 'vscode.command' && message.command) {
      void vscode.commands.executeCommand(message.command, ...(message.args || []));
      return;
    }
    // Webview FileEditCard header → open file in editor
    if (message.type === 'file.open' && message.path) {
      void this.openWorkspaceFile(String(message.path));
      return;
    }
    // Undo All — restore earliest checkpoint from session edits
    if (message.type === 'checkpoint.restore' && message.id) {
      void this.restoreCheckpoint(String(message.id));
      return;
    }
  }

  private async restoreCheckpoint(id: string): Promise<void> {
    try {
      const mgr = RuntimeServices.getCheckpointManager();
      if (!mgr) {
        void vscode.window.showWarningMessage(
          'Agent K: no checkpoint manager available to undo edits.'
        );
        return;
      }
      await mgr.restore(id);
      void vscode.window.showInformationMessage('Agent K: edits undone (checkpoint restored).');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`Agent K: undo failed — ${msg}`);
    }
  }

  private async openWorkspaceFile(filePath: string): Promise<void> {
    try {
      const fs = await import('fs');
      let uri = vscode.Uri.file(filePath);
      if (!fs.existsSync(filePath)) {
        const folders = vscode.workspace.workspaceFolders;
        if (folders?.[0]) {
          uri = vscode.Uri.joinPath(folders[0].uri, filePath);
        }
      }
      await vscode.window.showTextDocument(uri, { preview: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`Agent K: could not open file — ${msg}`);
    }
  }

  /**
   * Open dialog to pick files/folders (works without Shift+drop into webview).
   */
  private async pickAttachmentUris(requestId: string): Promise<void> {
    const webview = this._view?.webview;
    if (!webview) return;

    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      canSelectFiles: true,
      canSelectFolders: true,
      openLabel: 'Attach',
      title: 'Attach files or folders to Agent K'
    });

    if (!uris?.length) {
      void webview.postMessage({
        type: 'attachments.resolve.result',
        requestId,
        results: []
      });
      return;
    }

    await this.resolveAttachmentUris(
      requestId,
      uris.map((u) => u.toString())
    );
  }

  /**
   * Webview drag/drop: turn file:// (or absolute) URIs into workspace paths + type.
   */
  private async resolveAttachmentUris(requestId: string, uris: string[]): Promise<void> {
    const webview = this._view?.webview;
    if (!webview) return;

    const fs = await import('fs');
    const results: Array<{ path: string; type: 'file' | 'folder'; uri?: string }> = [];

    for (const raw of uris) {
      try {
        let fsPath = raw;
        if (raw.startsWith('file:') || raw.includes('://')) {
          fsPath = vscode.Uri.parse(raw).fsPath;
        }
        if (!fsPath) continue;
        let type: 'file' | 'folder' = 'file';
        try {
          const st = fs.statSync(fsPath);
          type = st.isDirectory() ? 'folder' : 'file';
        } catch {
          // Path may be outside workspace or missing — still attach as file chip
          if (/[\\/]$/.test(raw)) type = 'folder';
        }
        results.push({ path: fsPath, type, uri: raw });
      } catch {
        /* skip bad uri */
      }
    }

    void webview.postMessage({
      type: 'attachments.resolve.result',
      requestId,
      results
    });
  }

  private abortHostChatLoop(requestId?: string) {
    if (requestId && this._hostLoopRequestId && requestId !== this._hostLoopRequestId) {
      return;
    }
    this._hostLoop?.stop();
    this._hostLoopAbort?.abort();
    this._hostLoop = undefined;
    this._hostLoopAbort = undefined;
    this._hostLoopRequestId = undefined;
    // Unstick ask_question / reproduce waiters
    RuntimeServices.cancelQuestion('chat stopped');
    RuntimeServices.cancelReproduce();
  }

  /**
   * Ask/Agent/Plan/Debug chat.send → AgentLoopController (정의된 턴 계약).
   * Ask uses the same host path with a read-only tool whitelist.
   * Tier A: ≤4 tools/turn, ≤1 write, read-first, maxTurns from modeRegistry.
   * NOT the ad-hoc HostToolLoop miniprotocol.
   *
   * PRD-C0 §5.3 / PRD-Harness-13: post turn-by-turn timeline events
   * (Thought / Searching / Reading / Planning next moves / Done).
   */
  private async runHostChatSend(message: any): Promise<void> {
    const webview = this._view?.webview;
    if (!webview) return;

    const requestId = String(message.requestId);
    this.abortHostChatLoop();
    const abort = new AbortController();
    this._hostLoopAbort = abort;
    this._hostLoopRequestId = requestId;

    const post = (event: string, extra: Record<string, unknown> = {}) => {
      if (this._hostLoopRequestId !== requestId) return;
      void webview.postMessage({
        type: 'chat.stream',
        requestId,
        event,
        ...extra
      });
    };

    // Bridge ask_question → webview ClarifyingQuestions (host/webview split)
    RuntimeServices.setAskQuestionNotifier((q) => {
      post('ask_question', {
        qid: q.id,
        question: q.question,
        options: q.options,
        required: q.required,
      });
      post('status', { status: 'asking' });
    });

    // PRD-C0 §5.3: map tool name → timeline kind
    const toolKind = (name: string): string => {
      if (
        name === 'grep' ||
        name === 'glob' ||
        name === 'file_search' ||
        name === 'codebase_search' ||
        name === 'web_search' ||
        name === 'web_fetch' ||
        name.startsWith('mcp_searxng') ||
        name.includes('web_search')
      ) {
        return 'searching';
      }
      if (name === 'read_file' || name === 'read_files' || name === 'list_dir' || name === 'read_lints') {
        return 'reading';
      }
      if (
        name === 'edit_file' ||
        name === 'write_file' ||
        name === 'delete_file'
      ) {
        return 'editing';
      }
      if (name === 'run_terminal_cmd' || name === 'terminal_output') {
        return 'running';
      }
      if (name.startsWith('browser_')) return 'browsing';
      if (name === 'ask_question') return 'asking';
      // Other MCP tools still count as explore/search surface in MessageSteps
      if (name.startsWith('mcp_')) return 'searching';
      return 'running';
    };

    const kindVerb = (kind: string): string => {
      switch (kind) {
        case 'searching':
          return 'Searching';
        case 'reading':
          return 'Reading';
        case 'editing':
          return 'Editing';
        case 'running':
          return 'Running';
        case 'browsing':
          return 'Browsing';
        case 'asking':
          return 'Asking';
        default:
          return 'Working';
      }
    };

    // Short path/pattern only — never dump full tool JSON (PRD-C0 §5.3)
    const shortDetail = (args: Record<string, unknown> | undefined): string | undefined => {
      if (!args) return undefined;
      if (Array.isArray(args.paths) && args.paths.length) {
        const n = args.paths.length;
        const first = String(args.paths[0] ?? '');
        const base = first.replace(/\\/g, '/').split('/').pop() || first;
        return n === 1 ? base.slice(0, 80) : `${n} files · ${base.slice(0, 40)}`;
      }
      const pick =
        args.path ??
        args.target_file ??
        args.file_path ??
        args.filepath ??
        args.file ??
        args.target ??
        args.glob_pattern ??
        args.pattern ??
        args.query ??
        args.command ??
        args.url ??
        args.uri;
      if (pick == null) return undefined;
      const s = String(pick);
      return s.length > 80 ? `${s.slice(0, 77)}…` : s;
    };

    const resultDetail = (
      kind: string,
      result: { success: boolean; data?: unknown; error?: string },
      toolName?: string
    ): string | undefined => {
      if (!result.success) {
        const err = String(result.error || 'failed');
        // Prefer command stderr/stdout snippet for terminal failures in the timeline
        if (
          toolName === 'run_terminal_cmd' &&
          result.data &&
          typeof result.data === 'object'
        ) {
          const d = result.data as Record<string, unknown>;
          const snippet = String(d.stderr || d.stdout || err).trim();
          return snippet.length > 60 ? `${snippet.slice(0, 57)}…` : snippet || err;
        }
        return err.length > 60 ? `${err.slice(0, 57)}…` : err;
      }
      const data = result.data;
      if (Array.isArray(data)) return `${data.length} result(s)`;
      if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>;
        if (Array.isArray(obj.files)) return `${obj.files.length} file(s)`;
        if (typeof obj.count === 'number' && toolName === 'read_files') {
          return `${obj.count} file(s)`;
        }
        if (Array.isArray(obj.matches)) return `${obj.matches.length} match(es)`;
        if (typeof obj.path === 'string') return String(obj.path).slice(0, 80);
        if (typeof obj.command === 'string') {
          const cmd = String(obj.command);
          return cmd.length > 60 ? `${cmd.slice(0, 57)}…` : cmd;
        }
        if (typeof obj.count === 'number') return `${obj.count}`;
      }
      if (kind === 'reading') return 'ok';
      if (kind === 'searching') return 'done';
      return undefined;
    };

    const mode = (message.mode || 'agent') as 'ask' | 'agent' | 'plan' | 'debug';
    const incoming = Array.isArray(message.messages) ? message.messages : [];
    const cfg = vscode.workspace.getConfiguration('agent-k');
    const baseUrl = String(
      message.baseUrl || cfg.get('provider.baseUrl') || 'http://127.0.0.1:52415'
    ).replace(/\/$/, '');
    const model = String(
      message.model ||
        cfg.get('provider.model') ||
        'mlx-community/Qwen3.6-35B-A3B-4bit'
    );
    const apiKey =
      message.apiKey != null
        ? String(message.apiKey)
        : cfg.get<string>('provider.apiKey') || undefined;
    const providerType = String(cfg.get('provider.type') || 'litellm') as
      | 'litellm'
      | 'openai'
      | 'anthropic'
      | 'ollama'
      | 'lmstudio';
    const fallbackBudget = Number(cfg.get('context.budget')) || 100000;

    let deliveredFinal = false;
    /** Chars already pushed via onAssistantDelta — skip duplicate final dump */
    let streamedAnswerChars = 0;
    /** Only seal chat body once per agent turn (avoid N tools → N clearContent flickers) */
    let sealedContentTurn = -1;
    // PRD-C0 §5.3: track turn for timeline headers
    let currentTurn = 0;
    let timelineSeq = 0;
    /** Active tool timeline item id keyed by tool name (last call wins per name) */
    const activeToolItems = new Map<string, string>();

    const postTimeline = (payload: {
      kind: string;
      label: string;
      detail?: string;
      toolName?: string;
      status: 'running' | 'done' | 'error';
      id?: string;
      turn?: number;
    }) => {
      const id = payload.id || `tl_${payload.kind}_${currentTurn}_${++timelineSeq}`;
      post('timeline', {
        kind: payload.kind,
        turn: payload.turn ?? currentTurn,
        label: payload.label,
        detail: payload.detail,
        toolName: payload.toolName,
        status: payload.status,
        id
      });
      return id;
    };

    try {
      const { AgentLoopController } = await import('./loop/AgentLoopController');
      const { LiteLLMProvider } = await import('./providers/LiteLLMProvider');
      const { ContextAssembler } = await import('./agent/ContextAssembler');
      const { resolveModelContextInfo } = await import('./providers/modelContextInfo');

      const modelContext = await resolveModelContextInfo({
        providerType,
        baseUrl,
        apiKey,
        model,
        fallbackTokens: fallbackBudget
      });
      post('model.context', {
        model: modelContext.model,
        providerType: modelContext.providerType,
        maxInputTokens: modelContext.maxInputTokens,
        maxOutputTokens: modelContext.maxOutputTokens,
        source: modelContext.source
      });
      const { toolRegistry } = await import('./tools/registry');
      const { modeRegistry } = await import('./agent/modeRegistry');

      const modeConfig = modeRegistry.getModeConfig(mode);
      // Prefer VS Code setting; fall back to mode default. Small models need headroom.
      const configuredTurns = Number(configManager.get('agent-k.maxTurns'));
      const maxTurns =
        Number.isFinite(configuredTurns) && configuredTurns >= 5
          ? Math.min(100, Math.floor(configuredTurns))
          : modeConfig.maxTurns || 25;

      // Plan/Debug: append FSM stage prompt
      let customSystemPrompt: string | undefined;
      if (mode === 'plan') {
        const { PLAN_STAGE_PROMPTS } = await import('./plan/PlanModeController');
        const stage = (message.planStage || 'research') as keyof typeof PLAN_STAGE_PROMPTS;
        const stagePrompt = PLAN_STAGE_PROMPTS[stage] || PLAN_STAGE_PROMPTS.research;
        customSystemPrompt = `${modeConfig.systemPrompt}\n\n${stagePrompt}`;
      } else if (mode === 'debug') {
        const { DEBUG_STAGE_PROMPTS } = await import('./debug/DebugModeController');
        const stage = (message.debugStage || 'hypothesis') as keyof typeof DEBUG_STAGE_PROMPTS;
        const stagePrompt =
          DEBUG_STAGE_PROMPTS[stage] || DEBUG_STAGE_PROMPTS.hypothesis;
        customSystemPrompt = `${modeConfig.systemPrompt}\n\n${stagePrompt}`;
      }

      // ContextAssembler injects VerificationFirst + Slogans + TurnStructure + DontDo
      const assembler = new ContextAssembler();
      const assembly = assembler.assemble(
        mode,
        incoming.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: String(m.content || '')
        })),
        {
          tier: 'A',
          toolSchemas: toolRegistry.getSchemas(mode, 'A'),
          customSystemPrompt
        }
      );
      const systemPrompt =
        assembly.slots.find((s) => s.name === 'system')?.content ||
        modeRegistry.getSystemPrompt(mode);

      const provider = new LiteLLMProvider({
        id: 'agent-k-chat',
        name: 'Agent K Chat',
        type: providerType,
        baseUrl,
        apiKey,
        model
      });

      const loop = new AgentLoopController({
        mode,
        maxTurns,
        modelId: model,
        tier: 'A',
        contextBudget: modelContext.maxInputTokens,
        systemPrompt,
        provider,
        debugStage:
          mode === 'debug'
            ? ((message.debugStage as
                | 'hypothesis'
                | 'instrument'
                | 'reproduce'
                | 'analyze'
                | 'fix'
                | 'cleanup') || 'hypothesis')
            : undefined,
        planStage:
          mode === 'plan'
            ? ((message.planStage as
                | 'research'
                | 'questions'
                | 'planning'
                | 'review'
                | 'build') || 'research')
            : undefined,
        onDebugStage: (stage) => {
          post('debug.stage', { stage });
        },
        thinkingEffort:
          (message.thinkingEffort as 'off' | 'low' | 'medium' | 'high') ||
          (configManager.get('agent-k.thinking.effort') as
            | 'off'
            | 'low'
            | 'medium'
            | 'high') ||
          'medium',
        // Per-turn Thought / Exploring / Planning next moves (Cursor-style)
        onTurnStart: async (turn) => {
          // Freeze previous turn's Thought + Planning so UI stays sequential
          if (currentTurn > 0 && currentTurn !== turn) {
            postTimeline({
              kind: 'thinking',
              label: 'Thought',
              status: 'done',
              id: `tl_thinking_${currentTurn}`,
              turn: currentTurn
            });
            postTimeline({
              kind: 'planning',
              label: 'Planning next moves',
              status: 'done',
              id: `tl_planning_${currentTurn}`,
              turn: currentTurn
            });
          }
          currentTurn = turn;
          activeToolItems.clear();
          // Only "Planning next moves" while waiting for the LLM —
          // Thinking appears later when reasoning tokens arrive (not both live).
          postTimeline({
            kind: 'planning',
            label: 'Planning next moves',
            status: 'running',
            id: `tl_planning_${turn}`,
            turn
          });
        },
        onStatus: (status) => {
          if (status === 'doom_loop') {
            postTimeline({
              kind: 'error',
              label: 'Doom loop — stopped',
              status: 'error',
              id: `tl_doom_${currentTurn}`
            });
          }
        },
        onReasoning: async (fullText) => {
          const clipped = String(fullText || '').trim().slice(0, 20000);
          if (!clipped) return;
          const turn = currentTurn || 1;
          // Reasoning replaces Planning next moves
          postTimeline({
            kind: 'planning',
            label: 'Planning next moves',
            status: 'done',
            id: `tl_planning_${turn}`,
            turn
          });
          postTimeline({
            kind: 'thinking',
            label: 'Thought',
            detail: clipped,
            status: 'running',
            id: `tl_thinking_${turn}`,
            turn
          });
        },
        onAssistantDelta: async (piece) => {
          const text = String(piece || '');
          if (!text) return;
          const firstAnswerToken = streamedAnswerChars === 0;
          streamedAnswerChars += text.length;
          if (firstAnswerToken) {
            // Close Thought chrome once answer tokens start (Cursor-like)
            const turn = currentTurn || 1;
            postTimeline({
              kind: 'thinking',
              label: 'Thought',
              status: 'done',
              id: `tl_thinking_${turn}`,
              turn
            });
            postTimeline({
              kind: 'planning',
              label: 'Planning next moves',
              status: 'done',
              id: `tl_planning_${turn}`,
              turn
            });
          }
          post('delta', { content: text });
        },
        onToolCall: async (name, args, callId) => {
          const kind = toolKind(name);
          const detail = shortDetail(args as Record<string, unknown>);
          const turn = currentTurn || 1;
          const id =
            callId && String(callId).trim()
              ? `tl_${String(callId)}`
              : `tl_tool_${turn}_${name}_${++timelineSeq}`;
          activeToolItems.set(callId || name, id);
          // Tool turn may have streamed draft prose — reset so final answer can stream cleanly
          streamedAnswerChars = 0;
          // Close Thought + Planning before Exploring tools slide in
          postTimeline({
            kind: 'thinking',
            label: 'Thought',
            status: 'done',
            id: `tl_thinking_${turn}`,
            turn
          });
          postTimeline({
            kind: 'planning',
            label: 'Planning next moves',
            status: 'done',
            id: `tl_planning_${turn}`,
            turn
          });
          postTimeline({
            kind,
            label: `${kindVerb(kind)} · ${name}`,
            detail,
            toolName: name,
            status: 'running',
            id,
            turn
          });
          // Seal mid-turn prose once per turn — not on every parallel tool
          if (sealedContentTurn !== turn) {
            sealedContentTurn = turn;
            post('tool.start', { toolName: name, turn });
          }
        },
        onTerminalEvent: async (ev) => {
          post('terminal.run', {
            id: ev.id,
            phase: ev.phase,
            command: ev.command,
            description: ev.description,
            cwd: ev.cwd,
            chunk: ev.chunk,
            stream: ev.stream,
            exitCode: ev.exitCode,
            error: ev.error,
            durationMs: ev.durationMs,
            turn: ev.turn != null ? Number(ev.turn) : currentTurn || 1,
            status: ev.status
          });
        },
        onToolResult: async (name, result, callId) => {
          const kind = toolKind(name);
          const turn = currentTurn || 1;
          const id =
            activeToolItems.get(callId || name) ||
            (callId ? `tl_${String(callId)}` : `tl_tool_${turn}_${name}`);
          const detail = resultDetail(kind, result, name);
          postTimeline({
            // Keep explore/action kind so UI groups correctly; status carries failure
            kind,
            label: result.success
              ? `${kindVerb(kind)} · ${name}`
              : `Failed · ${name}`,
            detail,
            toolName: name,
            status: result.success ? 'done' : 'error',
            id,
            turn
          });
          post('tool.end', {
            toolName: name,
            toolResult: result.success
              ? JSON.stringify(result.data ?? {}).slice(0, 4000)
              : undefined,
            error: result.success ? undefined : result.error
          });
          // Cursor-style file edit cards in the chat transcript
          if (
            result.success &&
            (name === 'edit_file' || name === 'write_file') &&
            result.data &&
            typeof result.data === 'object'
          ) {
            const data = result.data as Record<string, unknown>;
            const diff = data.diff as
              | {
                  additions?: number;
                  deletions?: number;
                  lines?: Array<{
                    type: string;
                    lineNumber: number;
                    text: string;
                  }>;
                }
              | undefined;
            if (diff && Array.isArray(diff.lines)) {
              post('file.edit', {
                path: String(data.relPath || data.path || name),
                absPath: data.path != null ? String(data.path) : undefined,
                checkpointId:
                  data.checkpointId != null ? String(data.checkpointId) : undefined,
                turn: currentTurn || 1,
                additions: Number(diff.additions) || 0,
                deletions: Number(diff.deletions) || 0,
                lines: diff.lines.slice(0, 80).map((l) => ({
                  type: l.type === 'add' || l.type === 'delete' ? l.type : 'context',
                  lineNumber: Number(l.lineNumber) || 0,
                  text: String(l.text ?? '').slice(0, 400)
                }))
              });
            }
          }
        },
        onAssistantContent: async (content) => {
          deliveredFinal = true;
          const turn = currentTurn || 1;
          postTimeline({
            kind: 'thinking',
            label: 'Thought',
            status: 'done',
            id: `tl_thinking_${turn}`,
            turn
          });
          postTimeline({
            kind: 'planning',
            label: 'Planning next moves',
            status: 'done',
            id: `tl_planning_${turn}`,
            turn
          });
          post('status', { status: '' });
          // Avoid duplicating tokens already pushed via onAssistantDelta
          if (streamedAnswerChars === 0 && content?.trim()) {
            post('delta', { content });
          }
        },
        onError: (err) => {
          postTimeline({
            kind: 'error',
            label: 'Error',
            detail: (err.message || String(err)).slice(0, 80),
            status: 'error',
            id: `tl_error_${currentTurn || 0}`
          });
          post('error', { error: err.message || String(err) });
        }
      });

      this._hostLoop = loop;

      // Keepalive so webview idle watchdog does not fire during slow LLM TTFT
      const heartbeat = setInterval(() => {
        if (this._hostLoopRequestId !== requestId) return;
        if (this._hostLoop?.isRunning) {
          post('heartbeat', {});
        }
      }, 8_000);

      // History without harness dumps; last user turn drives the loop
      const history = incoming
        .filter((m: { role: string }) => m.role !== 'system')
        .map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant' | 'tool' | 'system',
          content: String(m.content || '')
        }));

      abort.signal.addEventListener('abort', () => loop.stop(), { once: true });

      try {
        await loop.continue([
          { role: 'system', content: systemPrompt },
          ...history
        ]);

        if (!deliveredFinal && this._hostLoopRequestId === requestId) {
          post('status', { status: '' });
          const snap = loop.getMessages();
          const last = [...snap].reverse().find(
            (m) => m.role === 'assistant' && m.content && !m.toolCalls?.length
          );
          if (last?.content) {
            post('delta', { content: last.content });
          }
        }

        if (this._hostLoopRequestId === requestId) {
          post('complete');
        }
      } finally {
        clearInterval(heartbeat);
        RuntimeServices.setAskQuestionNotifier(undefined);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      post('error', { error: msg || 'Agent loop failed' });
    } finally {
      if (this._hostLoopRequestId === requestId) {
        this._hostLoop = undefined;
        this._hostLoopAbort = undefined;
        this._hostLoopRequestId = undefined;
      }
    }
  }

  public newSession() {
    this._view?.webview.postMessage({ type: 'session.new' });
  }

  /** Open in-chat Settings Hub (Models tab by default) */
  public openSettings(tab?: string) {
    this._view?.webview.postMessage({ type: 'settings.open', tab: tab || 'models' });
  }

  public openProviderSettings() {
    this.openSettings('models');
  }

  public switchMode() {
    this._view?.webview.postMessage({ type: 'mode.switch' });
  }

  public focusInput() {
    this._view?.webview.postMessage({ type: 'focus.input' });
  }

  /**
   * Attach current editor selection (with line range) to the chat composer.
   */
  public attachEditorSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage('Agent K: 에디터에서 텍스트를 선택한 뒤 다시 시도하세요.');
      return;
    }
    const { document, selection } = editor;
    const text = document.getText(selection);
    if (!text.trim()) {
      void vscode.window.showWarningMessage('Agent K: 선택된 텍스트가 없습니다.');
      return;
    }
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;
    const path = document.uri.fsPath;
    const label = path.replace(/\\/g, '/').split('/').pop() || path;
    void vscode.commands.executeCommand('agent-k.chat.focusInput');
    this._view?.webview.postMessage({
      type: 'attachments.add',
      items: [
        {
          type: 'snippet',
          path,
          label,
          content: text,
          startLine,
          endLine,
          id: `sel_${Date.now().toString(36)}`
        }
      ]
    });
  }

  /** RW-C7-05/06/10: open in-chat panels */
  public openDesignMode() {
    this._view?.webview.postMessage({ type: 'ui.design.open' });
  }
  public openReview() {
    this._view?.webview.postMessage({ type: 'ui.review.open' });
  }
  public openArtifacts() {
    this._view?.webview.postMessage({ type: 'ui.artifacts.open' });
  }

  /** Reveal chat then send plan Build / Review from editor */
  public async revealChat(): Promise<void> {
    await vscode.commands.executeCommand('workbench.view.extension.agent-k');
    this.focusInput();
  }

  public async buildPlanFromEditor(uri?: vscode.Uri): Promise<void> {
    const payload = await readPlanFromEditor(uri);
    if (!payload) {
      void vscode.window.showWarningMessage(
        'Agent K: `.agentk/plans` 아래 plan_*.md 파일을 연 뒤 Build를 실행하세요.'
      );
      return;
    }
    await this.revealChat();
    this._view?.webview.postMessage({
      type: 'plan.buildFromEditor',
      content: payload.content,
      slug: payload.slug,
      title: payload.title,
      filePath: payload.filePath
    });
  }

  public async openPlanReviewFromEditor(uri?: vscode.Uri): Promise<void> {
    const payload = await readPlanFromEditor(uri);
    if (!payload) {
      void vscode.window.showWarningMessage(
        'Agent K: `.agentk/plans` 아래 plan_*.md 파일을 연 뒤 Review를 여세요.'
      );
      return;
    }
    await this.revealChat();
    this._view?.webview.postMessage({
      type: 'plan.openReviewFromEditor',
      content: payload.content,
      slug: payload.slug,
      title: payload.title,
      filePath: payload.filePath
    });
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
  const outputChannel = vscode.window.createOutputChannel('Agent K');
  outputChannel.appendLine('[Agent K] Extension activating…');

  // ─── CRITICAL: register WebviewViewProvider FIRST ─────────
  // If anything below throws, VS Code shows
  // "보기 데이터를 제공할 수 있는 등록된 데이터 공급자가 없습니다."
  const provider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    outputChannel,
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );
  outputChannel.appendLine('[Agent K] WebviewViewProvider registered: agent-k.chat');

  const planCodeLens = new PlanCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [{ language: 'markdown', pattern: '**/.agentk/plans/**/*.md' }],
      planCodeLens
    ),
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      updatePlanDocumentContext(ed);
      planCodeLens.refresh();
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (PlanStorage.isPlanDocumentUri(doc.uri)) planCodeLens.refresh();
    })
  );
  updatePlanDocumentContext(vscode.window.activeTextEditor);

  // Force the webview view to re-resolve after provider registration (avoids stale "no data provider")
  setTimeout(() => {
    void vscode.commands.executeCommand('workbench.view.extension.agent-k');
  }, 100);

  try {
    RuntimeServices.setWorkspaceState(context.workspaceState);
    RuntimeServices.setDebugLogServer(debugLogServer);
    RuntimeServices.setMcpClient(mcpClient);
    PlanStorage.setExtensionContext(context);
    DebugStorage.setExtensionContext(context);

    const memoryStore = new MemoryStore(context.secrets, context);
    RuntimeServices.setMemoryStore(memoryStore);
    void memoryStore.getAllMemories().then(() => {
      outputChannel.appendLine('[Agent K] MemoryStore hydrated from SecretStorage');
    }).catch((err: Error) => {
      outputChannel.appendLine(`[Agent K] MemoryStore hydrate failed: ${err.message}`);
    });

    bindAgentKConfigBridge(context);

    RuntimeServices.setCheckpointManager(new CheckpointManager());
    const permissionGate = new PermissionGate(
      configManager.get('agent-k.permission.level') || 'accept_edits'
    );
    const denyGlobs: string[] = configManager.get('agent-k.permission.denyGlobs') || [
      '**/.env*',
      '**/secrets/**',
      '**/id_rsa*',
      '**/*.pem',
      '**/.git/**',
      '**/node_modules/**',
    ];
    permissionGate.setDenyGlobs(denyGlobs);
    permissionGate.subscribe(async () => 'allow_once');
    RuntimeServices.setPermissionGate(permissionGate);

    const workspaceSkills = vscode.workspace.workspaceFolders?.[0]
      ? path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'skills')
      : undefined;
    const bundledSkills = path.join(context.extensionUri.fsPath, 'skills');
    getSkillRegistry(workspaceSkills || bundledSkills);

    registerReadTools();
    registerEditTools();
    registerC5C7Tools();
    outputChannel.appendLine('[Agent K] Tool registry initialized');

    context.subscriptions.push(
      vscode.commands.registerCommand('agent-k.chat.new', () => {
        provider.newSession();
      }),

      vscode.commands.registerCommand('agent-k.openSettings', () => {
        provider.openSettings('models');
      }),

      vscode.commands.registerCommand('agent-k.provider.add', () => {
        provider.openSettings('models');
      }),

      vscode.commands.registerCommand('agent-k.mode.switch', () => {
        provider.switchMode();
      }),

      vscode.commands.registerCommand('agent-k.chat.focusInput', () => {
        provider.focusInput();
      }),

      vscode.commands.registerCommand('agent-k.chat.attachSelection', () => {
        provider.attachEditorSelection();
      }),

      vscode.commands.registerCommand('agent-k.plan.open', () => {
        vscode.window.showInformationMessage('[Agent K] Plan mode: create a new plan');
        provider.switchMode();
      }),

      vscode.commands.registerCommand('agent-k.plan.build', (uri?: vscode.Uri) => {
        void provider.buildPlanFromEditor(uri);
      }),

      vscode.commands.registerCommand('agent-k.plan.openReview', (uri?: vscode.Uri) => {
        void provider.openPlanReviewFromEditor(uri);
      }),

      vscode.commands.registerCommand('agent-k.debug.open', () => {
        vscode.window.showInformationMessage('[Agent K] Debug mode: start debugging session');
        provider.switchMode();
      }),

      vscode.commands.registerCommand('agent-k.review.open', () => {
        provider.openReview();
      }),

      vscode.commands.registerCommand('agent-k.browser.open', () => {
        provider.openDesignMode();
      }),

      vscode.commands.registerCommand('agent-k.artifacts.open', () => {
        provider.openArtifacts();
      }),

      vscode.commands.registerCommand('agent-k.mcp.connect', async () => {
        const serverName = await vscode.window.showInputBox({ prompt: 'MCP server name' });
        const commandLine = await vscode.window.showInputBox({
          prompt: 'MCP server command (argv, space-separated)',
          placeHolder: 'python3 /path/to/server.py',
        });
        if (serverName && commandLine) {
          const parts = commandLine.trim().split(/\s+/);
          mcpClient.registerServer({ name: serverName, command: parts[0], args: parts.slice(1) });
          try {
            const tools = await mcpClient.connect(serverName);
            registerMcpToolsInRegistry(tools);
            vscode.window.showInformationMessage(`[Agent K] MCP connected: ${serverName} (${tools.length} tools)`);
          } catch (err) {
            vscode.window.showErrorMessage(`[Agent K] MCP connection failed: ${err}`);
          }
        }
      }),

      vscode.commands.registerCommand('agent-k.mcp.disconnect', async () => {
        await mcpClient.disconnectAll();
        vscode.window.showInformationMessage('[Agent K] MCP disconnected');
      }),

      vscode.commands.registerCommand('agent-k.mcp.reload', async () => {
        await mcpClient.disconnectAll();
        const lines = await bootstrapMcpFromSettings(mcpClient, (m) => outputChannel.appendLine(m));
        vscode.window.showInformationMessage(
          lines.length ? `[Agent K] MCP reload: ${lines.join(' | ')}` : '[Agent K] MCP: no servers'
        );
      })
    );

    outputChannel.appendLine('[Agent K] Commands registered');

    // Auto-connect MCP servers from agent-k.mcp.servers (Continue-style map)
    void bootstrapMcpFromSettings(mcpClient, (m) => outputChannel.appendLine(m)).then((lines) => {
      if (lines.length) {
        outputChannel.appendLine(`[Agent K] MCP bootstrap done: ${lines.length} result(s)`);
      }
    });

    debugLogServer.start().then(() => {
      outputChannel.appendLine('[Agent K] Debug log server started on port 18999');
    }).catch((err: Error) => {
      outputChannel.appendLine(`[Agent K] Debug log server start failed: ${err.message}`);
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    outputChannel.appendLine(`[Agent K] activate init error (webview still registered): ${msg}`);
    console.error('[Agent K] activate init error', err);
    void vscode.window.showErrorMessage(`[Agent K] Init error: ${msg}`);
  }
}

export function deactivate() {
  debugLogServer.stop();
  mcpClient.disconnectAll();
}