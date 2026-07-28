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
import { SessionManager } from './session/SessionManager';
import { fromHostSnapshot, toHostSnapshot } from './session/HostSessionBridge';
import { getSkillRegistry } from './skills/SkillRegistry';
import * as path from 'path';
import { configManager, AGENT_K_VSCODE_CONFIG_KEYS } from './core/ConfigManager';
import {
  PROJECT_CONFIG_FILENAMES,
  PROJECT_CONFIG_PATH,
  exampleProjectConfig,
  parseProjectConfigJson,
  pickProjectConfigValues,
  unflattenProjectConfig,
} from './core/ProjectConfig';
import { SessionUsageTracker } from './telemetry/StatusBarCost';
import { WorktreeManager } from './worktree/WorktreeManager';
import { BestOfN, type BoNTrial } from './worktree/BestOfN';
import { AdoptWinner } from './worktree/AdoptWinner';
import { AgentReviewLoop } from './review/AgentReviewLoop';

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
      // VS Code first, then project JSON wins
      configManager.syncFromVSCode(readAgentKFromVSCode());
      void applyProjectConfigFromDisk();
      const level = configManager.get('agent-k.permission.level') || 'accept_edits';
      RuntimeServices.getPermissionGate()?.setLevel(level);
    })
  );
}

/** Resolve workspace `.agent-k/settings.json` (legacy root files still supported) */
async function findProjectConfigUri(): Promise<vscode.Uri | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  for (const name of PROJECT_CONFIG_FILENAMES) {
    const uri = vscode.Uri.joinPath(folder.uri, name);
    try {
      await vscode.workspace.fs.stat(uri);
      return uri;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

async function readProjectConfigFile(
  uri: vscode.Uri
): Promise<{ text: string; values: Record<string, unknown> } | { error: string }> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString('utf8');
    const parsed = parseProjectConfigJson(text);
    if (!parsed.ok) return { error: parsed.error };
    return { text, values: parsed.values };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Apply project JSON on top of current ConfigManager (no VS Code write-back). */
async function applyProjectConfigFromDisk(): Promise<Record<string, unknown> | null> {
  const uri = await findProjectConfigUri();
  if (!uri) return null;
  const result = await readProjectConfigFile(uri);
  if ('error' in result) {
    void vscode.window.showWarningMessage(
      `Agent K: failed to read ${uri.fsPath}: ${result.error}`
    );
    return null;
  }
  configManager.syncFromVSCode(result.values);
  return result.values;
}

function preferredProjectConfigUri(): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  return vscode.Uri.joinPath(folder.uri, PROJECT_CONFIG_PATH);
}

async function ensureProjectConfigDir(fileUri: vscode.Uri): Promise<void> {
  const dir = vscode.Uri.joinPath(fileUri, '..');
  try {
    await vscode.workspace.fs.stat(dir);
  } catch {
    await vscode.workspace.fs.createDirectory(dir);
  }
}

let projectConfigPostToWebview:
  | ((msg: Record<string, unknown>) => void)
  | undefined;

function bindProjectConfig(context: vscode.ExtensionContext): void {
  void applyProjectConfigFromDisk().then((values) => {
    if (values && projectConfigPostToWebview) {
      projectConfigPostToWebview({ type: 'config.hydrate', values });
    }
  });

  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/{.agent-k/settings.json,.agent-k.json,agent-k.json}'
  );
  const reload = () => {
    void (async () => {
      configManager.syncFromVSCode(readAgentKFromVSCode());
      const values = await applyProjectConfigFromDisk();
      if (values && projectConfigPostToWebview) {
        projectConfigPostToWebview({ type: 'config.hydrate', values });
      }
      const level = configManager.get('agent-k.permission.level') || 'accept_edits';
      RuntimeServices.getPermissionGate()?.setLevel(level);
    })();
  };
  watcher.onDidCreate(reload);
  watcher.onDidChange(reload);
  watcher.onDidDelete(() => {
    configManager.syncFromVSCode(readAgentKFromVSCode());
    if (projectConfigPostToWebview) {
      projectConfigPostToWebview({
        type: 'config.hydrate',
        values: readAgentKFromVSCode(),
      });
    }
  });
  context.subscriptions.push(watcher);
}

// RW-C6-04: DebugLogServer 전역 인스턴스 (activate/deactivate 수명주기)
const debugLogServer = new DebugLogServer();
// RW-C7-03: MCPClient 전역 인스턴스
const mcpClient = new MCPClient();
// ADDON-T11: 세션 토큰/비용 트래커 (Status Bar에 반영)
const sessionUsageTracker = new SessionUsageTracker();
let usageStatusBarItem: vscode.StatusBarItem | undefined;

/** ADDON-T11: Status Bar 텍스트/표시 여부 갱신. 실패해도 activate/turn을 막지 않는다. */
function updateUsageStatusBar(): void {
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

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'agent-k.chat';

  private _view?: vscode.WebviewView;
  /** Active AgentLoopController for chat Agent/Plan/Debug (turn contract) */
  private _hostLoop?: import('./loop/AgentLoopController').AgentLoopController;
  private _hostLoopRequestId?: string;
  private _hostLoopAbort?: AbortController;
  /** Serialize chat.send so interrupt/new-tab cannot interleave two loops */
  private _hostSendChain: Promise<void> = Promise.resolve();

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    projectConfigPostToWebview = (msg) => {
      void this._view?.webview.postMessage(msg);
    };
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

    // ask_question UI bridge lives with the webview (not per chat.request finally)
    this.ensureAskQuestionBridge();
    webviewView.onDidDispose(() => {
      if (this._view === webviewView) {
        RuntimeServices.setAskQuestionNotifier(undefined);
        this._view = undefined;
        projectConfigPostToWebview = undefined;
      }
    });
  }

  /**
   * Keep ClarifyingQuestions bridge registered for the active webview.
   * Must not be cleared by a superseded request's finally (interrupt → resend race).
   */
  private ensureAskQuestionBridge(): void {
    RuntimeServices.setAskQuestionNotifier((q) => {
      const webview = this._view?.webview;
      const requestId = this._hostLoopRequestId;
      if (!webview) {
        throw new Error(
          'ask_question: Agent K chat webview is closed. Re-open the Agent K sidebar.'
        );
      }
      if (!requestId) {
        throw new Error(
          'ask_question: no active chat request. Send a message again to continue.'
        );
      }
      void webview.postMessage({
        type: 'chat.stream',
        requestId,
        event: 'ask_question',
        qid: q.id,
        question: q.question,
        options: q.options,
        required: q.required
      });
      void webview.postMessage({
        type: 'chat.stream',
        requestId,
        event: 'status',
        status: 'asking'
      });
    });
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
    ) as 'litellm' | 'openai' | 'anthropic' | 'ollama' | 'lmstudio' | 'opencode-zen' | 'opencode-go';
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
      // Abort current wait immediately, then run next send after prior promise settles
      this.abortHostChatLoop();
      this._hostSendChain = this._hostSendChain
        .catch(() => undefined)
        .then(() => this.runHostChatSend(message));
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
    // Composer @ mention — workspace file/folder search
    if (message.type === 'composer.search' && message.requestId != null) {
      void this.handleComposerSearch(
        String(message.requestId),
        String(message.query ?? ''),
        message.kind === 'folder' ? 'folder' : 'file'
      );
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
    // ADDON-T07: Checkpoints dropdown — summaries only (no file contents)
    if (message.type === 'checkpoint.list') {
      this.sendCheckpointList();
      return;
    }
    // ADDON-T06: webview mounted — send host-restored session metas
    if (message.type === 'host.sessions.ready') {
      this.sendSessionHydration();
      this.sendConfigHydrate();
      return;
    }
    // Project JSON config (.agent-k/settings.json)
    if (message.type === 'config.project.get') {
      void this.handleProjectConfigGet();
      return;
    }
    if (message.type === 'config.project.save') {
      void this.handleProjectConfigSave(String(message.text ?? ''));
      return;
    }
    if (message.type === 'config.project.open') {
      void this.handleProjectConfigOpen();
      return;
    }
    if (message.type === 'config.project.createExample') {
      void this.handleProjectConfigCreateExample();
      return;
    }
    // ADDON-T06: webview session list changed — sync into host SessionManager
    if (message.type === 'host.sessions.persist' && Array.isArray(message.sessions)) {
      this.persistSessionsToHost(message.sessions, message.currentId);
      return;
    }
    // ADDON-T10: /compact — pragmatic stub, real compaction runs client-side
    if (message.type === 'session.compact') {
      void vscode.window.showInformationMessage(
        'Agent K: context compaction requested (older turns will be summarized).'
      );
      return;
    }
    // ADDON-T13: /bon slash command → same flow as the command palette entry
    if (message.type === 'host.bestOfN') {
      void vscode.commands.executeCommand('agent-k.bestOfN.run');
      return;
    }
  }

  /** Push effective ConfigManager values (incl. project JSON) into webview */
  private sendConfigHydrate(): void {
    const webview = this._view?.webview;
    if (!webview) return;
    void webview.postMessage({
      type: 'config.hydrate',
      values: configManager.getAll(),
    });
  }

  private async handleProjectConfigGet(): Promise<void> {
    const webview = this._view?.webview;
    if (!webview) return;
    const uri = await findProjectConfigUri();
    if (!uri) {
      const nested = unflattenProjectConfig(
        pickProjectConfigValues(configManager.getAll())
      );
      void webview.postMessage({
        type: 'config.project.result',
        exists: false,
        path: preferredProjectConfigUri()?.fsPath ?? null,
        text: JSON.stringify(nested, null, 2),
      });
      return;
    }
    const result = await readProjectConfigFile(uri);
    if ('error' in result) {
      void webview.postMessage({
        type: 'config.project.result',
        exists: true,
        path: uri.fsPath,
        error: result.error,
      });
      return;
    }
    void webview.postMessage({
      type: 'config.project.result',
      exists: true,
      path: uri.fsPath,
      text: result.text,
    });
  }

  private async handleProjectConfigSave(text: string): Promise<void> {
    const webview = this._view?.webview;
    const uri = preferredProjectConfigUri() || (await findProjectConfigUri());
    if (!uri) {
      void webview?.postMessage({
        type: 'config.project.saved',
        ok: false,
        error: '워크스페이스 폴더가 없습니다.',
      });
      return;
    }
    const parsed = parseProjectConfigJson(text);
    if (!parsed.ok) {
      void webview?.postMessage({
        type: 'config.project.saved',
        ok: false,
        error: parsed.error,
      });
      return;
    }
    try {
      // Pretty-print nested form for the file
      const nested = unflattenProjectConfig(parsed.values);
      const body = Buffer.from(JSON.stringify(nested, null, 2) + '\n', 'utf8');
      await ensureProjectConfigDir(uri);
      await vscode.workspace.fs.writeFile(uri, body);
      configManager.syncFromVSCode(parsed.values);
      void webview?.postMessage({
        type: 'config.project.saved',
        ok: true,
        path: uri.fsPath,
        values: parsed.values,
      });
      void webview?.postMessage({
        type: 'config.hydrate',
        values: parsed.values,
      });
    } catch (err) {
      void webview?.postMessage({
        type: 'config.project.saved',
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleProjectConfigOpen(): Promise<void> {
    let uri = await findProjectConfigUri();
    if (!uri) {
      uri = preferredProjectConfigUri();
      if (!uri) {
        void vscode.window.showWarningMessage('워크스페이스 폴더가 없습니다.');
        return;
      }
      const nested = unflattenProjectConfig(
        pickProjectConfigValues(configManager.getAll())
      );
      await ensureProjectConfigDir(uri);
      await vscode.workspace.fs.writeFile(
        uri,
        Buffer.from(JSON.stringify(nested, null, 2) + '\n', 'utf8')
      );
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
  }

  private async handleProjectConfigCreateExample(): Promise<void> {
    const uri = preferredProjectConfigUri();
    if (!uri) {
      void vscode.window.showWarningMessage('워크스페이스 폴더가 없습니다.');
      return;
    }
    try {
      await vscode.workspace.fs.stat(uri);
      const overwrite = await vscode.window.showWarningMessage(
        '.agent-k/settings.json already exists. Overwrite with example?',
        'Overwrite',
        'Cancel'
      );
      if (overwrite !== 'Overwrite') return;
    } catch {
      /* create new */
    }
    const body = Buffer.from(
      JSON.stringify(exampleProjectConfig(), null, 2) + '\n',
      'utf8'
    );
    await ensureProjectConfigDir(uri);
    await vscode.workspace.fs.writeFile(uri, body);
    const values = await applyProjectConfigFromDisk();
    void this._view?.webview.postMessage({
      type: 'config.project.result',
      exists: true,
      path: uri.fsPath,
      text: body.toString('utf8'),
    });
    if (values) {
      void this._view?.webview.postMessage({ type: 'config.hydrate', values });
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
  }

  /** ADDON-T07: summarize checkpoints (id/label/timestamp/turn/mode) → webview */
  private sendCheckpointList(): void {
    const webview = this._view?.webview;
    if (!webview) return;
    const mgr = RuntimeServices.getCheckpointManager();
    const checkpoints = mgr ? mgr.list() : [];
    void webview.postMessage({
      type: 'checkpoint.listResult',
      checkpoints: [...checkpoints]
        .reverse()
        .map((c) => ({
          id: c.id,
          label: c.label,
          timestamp: c.timestamp,
          turnNumber: c.metadata.turnNumber,
          mode: c.metadata.mode,
          trigger: c.metadata.trigger,
          fileCount: c.fileSnapshots.length
        }))
    });
  }

  /** ADDON-T06: SessionManager (workspaceState) → webview ChatSessionStore metas */
  private sendSessionHydration(): void {
    const webview = this._view?.webview;
    if (!webview) return;
    const mgr = RuntimeServices.getSessionManager();
    if (!mgr) return;
    const current = mgr.getCurrentSession();
    const { metas, currentId } = fromHostSnapshot({
      sessions: mgr.getAllSessions(),
      currentId: current?.id ?? null
    });
    void webview.postMessage({
      type: 'host.sessions.hydrate',
      sessions: metas,
      currentId
    });
  }

  /** ADDON-T06: webview ChatSessionStore metas → SessionManager (workspaceState) */
  private persistSessionsToHost(sessions: unknown[], currentId?: unknown): void {
    const mgr = RuntimeServices.getSessionManager();
    if (!mgr) return;
    const webviewMetas = sessions
      .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
      .map((s) => ({
        id: String(s.id ?? ''),
        title: String(s.title ?? 'Session'),
        mode: String(s.mode ?? 'agent'),
        messageCount: Number(s.messageCount) || 0,
        createdAt: Number(s.createdAt) || Date.now(),
        updatedAt: Number(s.updatedAt) || Date.now(),
        summary: s.summary != null ? String(s.summary) : undefined
      }))
      .filter((s) => s.id);
    const snapshot = toHostSnapshot(webviewMetas, currentId != null ? String(currentId) : null);
    for (const record of snapshot.sessions) {
      mgr.upsertFromChatMeta({
        id: record.id,
        title: record.label,
        mode: record.mode,
        messageCount: record.messageCount,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        summary: record.summary
      });
    }
    if (snapshot.currentId) mgr.setCurrentSession(snapshot.currentId);
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
   * Composer `@` file/folder picker — workspace search (built-in).
   */
  private async handleComposerSearch(
    requestId: string,
    query: string,
    kind: 'file' | 'folder'
  ): Promise<void> {
    const webview = this._view?.webview;
    if (!webview) return;

    const q = query.trim().toLowerCase().replace(/\\/g, '/');
    const exclude =
      '**/{node_modules,.git,dist,out,build,.next,coverage,.agentk,venv,.venv}/**';

    type Hit = {
      kind: 'file' | 'folder';
      path: string;
      label: string;
      description: string;
      score: number;
    };
    const hits: Hit[] = [];
    const folderSeen = new Set<string>();

    try {
      const uris = await vscode.workspace.findFiles('**/*', exclude, 1200);
      for (const uri of uris) {
        const abs = uri.fsPath;
        const rel = vscode.workspace.asRelativePath(uri).replace(/\\/g, '/');
        const base = rel.split('/').pop() || rel;
        const relLower = rel.toLowerCase();
        const baseLower = base.toLowerCase();

        if (kind !== 'folder') {
          if (
            !q ||
            baseLower.includes(q) ||
            relLower.includes(q)
          ) {
            let score = 0;
            if (baseLower === q) score = 100;
            else if (baseLower.startsWith(q)) score = 80;
            else if (baseLower.includes(q)) score = 60;
            else if (relLower.includes(q)) score = 40;
            else score = 10;
            hits.push({
              kind: 'file',
              path: abs,
              label: base,
              description: rel,
              score
            });
          }
        }

        const parts = rel.split('/');
        for (let i = 1; i < parts.length; i++) {
          const folderRel = parts.slice(0, i).join('/');
          if (folderSeen.has(folderRel)) continue;
          const folderBase = parts[i - 1] || folderRel;
          const folderLower = folderRel.toLowerCase();
          const folderBaseLower = folderBase.toLowerCase();
          if (
            q &&
            !folderLower.includes(q) &&
            !folderBaseLower.includes(q)
          ) {
            continue;
          }
          folderSeen.add(folderRel);
          if (kind === 'file' && q && !folderBaseLower.includes(q)) {
            // When searching files, only surface strongly matching folders
            if (!folderLower.endsWith('/' + q) && folderBaseLower !== q) continue;
          }
          let score = 0;
          if (folderBaseLower === q) score = 95;
          else if (folderBaseLower.startsWith(q)) score = 75;
          else if (folderBaseLower.includes(q)) score = 55;
          else score = 20;
          const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
          const root =
            wsFolder?.uri || vscode.workspace.workspaceFolders?.[0]?.uri;
          if (!root) continue;
          const folderUri = vscode.Uri.joinPath(root, ...folderRel.split('/'));
          hits.push({
            kind: 'folder',
            path: folderUri.fsPath,
            label: folderBase,
            description: folderRel,
            score
          });
        }
      }

      hits.sort((a, b) => b.score - a.score || a.description.localeCompare(b.description));
      const results = hits.slice(0, 40).map(({ kind: k, path, label, description }) => ({
        kind: k,
        path,
        label,
        description
      }));

      void webview.postMessage({
        type: 'composer.search.result',
        requestId,
        query,
        results
      });
    } catch (err) {
      void webview.postMessage({
        type: 'composer.search.result',
        requestId,
        query,
        results: [],
        error: err instanceof Error ? err.message : String(err)
      });
    }
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

    // Bridge ask_question → this request's post() (survives interrupt / new-tab races)
    RuntimeServices.setAskQuestionNotifier((q) => {
      if (this._hostLoopRequestId !== requestId) {
        throw new Error(
          'ask_question: request superseded. Send a message again to continue.'
        );
      }
      post('ask_question', {
        qid: q.id,
        question: q.question,
        options: q.options,
        required: q.required
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
      // Only real shell tools are "running" — else UI says "Ran a command" wrongly
      if (name === 'run_terminal_cmd' || name === 'terminal_output') {
        return 'running';
      }
      if (name.startsWith('browser_')) return 'browsing';
      if (name === 'ask_question') return 'asking';
      // Session chrome — not a shell command (MessageSteps hides these)
      if (
        name === 'todo_write' ||
        name === 'switch_mode' ||
        name === 'checkpoint_create' ||
        name === 'checkpoint_restore'
      ) {
        return 'session';
      }
      if (name === 'task_run' || name === 'skill_run') return 'task';
      // Other MCP tools still count as explore/search surface in MessageSteps
      if (name.startsWith('mcp_')) return 'searching';
      return 'task';
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
        case 'session':
          return 'Updating';
        case 'task':
          return 'Working';
        default:
          return 'Working';
      }
    };

    // Short path/pattern only — never dump full tool JSON (PRD-C0 §5.3)
    // Cursor-style: "Grepped pattern in path", "Read file.ts L10-50"
    const shortDetail = (
      name: string,
      args: Record<string, unknown> | undefined
    ): string | undefined => {
      if (!args) return undefined;

      if (name === 'grep') {
        const pattern = String(args.pattern ?? args.query ?? '').trim();
        const path = String(
          args.path ?? args.target ?? args.glob ?? args.glob_pattern ?? ''
        ).trim();
        const scope =
          !path || path === '.' || path === './'
            ? 'workspace'
            : path.replace(/\\/g, '/');
        if (pattern && scope) {
          const p = pattern.length > 48 ? `${pattern.slice(0, 45)}…` : pattern;
          const s = scope.length > 40 ? `${scope.slice(0, 37)}…` : scope;
          return `${p} in ${s}`;
        }
        if (pattern) return pattern.length > 80 ? `${pattern.slice(0, 77)}…` : pattern;
        if (scope) return scope;
      }

      if (name === 'glob' || name === 'file_search') {
        const pattern = String(
          args.glob_pattern ?? args.pattern ?? args.query ?? ''
        ).trim();
        const path = String(args.path ?? '').trim();
        if (pattern && path && path !== '.' && path !== './') {
          return `${pattern} in ${path}`;
        }
        if (pattern) return pattern.length > 80 ? `${pattern.slice(0, 77)}…` : pattern;
      }

      if (name === 'read_file' || name === 'read_files') {
        if (name === 'read_files' && Array.isArray(args.paths) && args.paths.length) {
          const n = args.paths.length;
          const first = String(args.paths[0] ?? '');
          const base = first.replace(/\\/g, '/').split('/').pop() || first;
          return n === 1 ? base.slice(0, 80) : `${n} files · ${base.slice(0, 40)}`;
        }
        const file = String(
          args.path ??
            args.target_file ??
            args.file_path ??
            args.filepath ??
            args.file ??
            ''
        ).trim();
        if (!file) return undefined;
        const base = file.replace(/\\/g, '/').split('/').pop() || file;
        const offset =
          typeof args.offset === 'number'
            ? args.offset
            : typeof args.start_line === 'number'
              ? args.start_line
              : undefined;
        const limit =
          typeof args.limit === 'number'
            ? args.limit
            : typeof args.end_line === 'number' && offset != null
              ? Math.max(0, args.end_line - offset + 1)
              : undefined;
        if (offset != null && offset > 0) {
          const start = offset;
          const end =
            limit != null && limit > 0
              ? start + limit - 1
              : typeof args.end_line === 'number'
                ? args.end_line
                : start + 249;
          return `${base} L${start}-${end}`;
        }
        return base.slice(0, 80);
      }

      if (name === 'run_terminal_cmd' || name === 'terminal_output') {
        const cmd = String(
          args.command ?? args.cmd ?? args.shell ?? args.description ?? ''
        ).trim();
        if (!cmd) return undefined;
        return cmd.length > 80 ? `${cmd.slice(0, 77)}…` : cmd;
      }

      if (name === 'todo_write') {
        if (Array.isArray(args.todos)) return `${args.todos.length} todo(s)`;
        const text = String(args.text ?? args.content ?? '').trim();
        if (text) return text.length > 60 ? `${text.slice(0, 57)}…` : text;
        return 'todos';
      }

      // ADDON-T09: task_run running badge — show the sub-agent's task description
      if (name === 'task_run') {
        const label = String(args.description ?? args.task ?? '').trim();
        return label ? (label.length > 60 ? `${label.slice(0, 57)}…` : label) : 'running';
      }

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
        // ADDON-T09: task_run completed/timeout/cancelled badge (SubAgentResult status)
        if (toolName === 'task_run' && typeof obj.status === 'string') {
          return String(obj.status);
        }
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
      | 'lmstudio'
      | 'opencode-zen'
      | 'opencode-go';
    const fallbackBudget = Number(cfg.get('context.budget')) || 100000;

    let deliveredFinal = false;
    /** Answer text already pushed via onAssistantDelta (this segment) */
    let streamedAnswer = '';
    /** Only seal chat body once per agent turn (avoid N tools → N clearContent flickers) */
    let sealedContentTurn = -1;
    // PRD-C0 §5.3: track turn for timeline headers
    let currentTurn = 0;
    let timelineSeq = 0;
    /** Active tool timeline item id keyed by tool name (last call wins per name) */
    const activeToolItems = new Map<string, string>();
    /** Cursor-style row text from tool args — keep on result so Grepped/Read don't become "N matches" */
    const toolStartDetails = new Map<string, string>();

    const postTimeline = (payload: {
      kind: string;
      label: string;
      detail?: string;
      toolName?: string;
      status: 'running' | 'done' | 'error';
      id?: string;
      turn?: number;
      /** opening = per-turn main Thought; mid = nested under Exploring */
      thoughtRole?: 'opening' | 'mid';
    }) => {
      const id = payload.id || `tl_${payload.kind}_${currentTurn}_${++timelineSeq}`;
      post('timeline', {
        kind: payload.kind,
        turn: payload.turn ?? currentTurn,
        label: payload.label,
        detail: payload.detail,
        toolName: payload.toolName,
        status: payload.status,
        id,
        thoughtRole: payload.thoughtRole
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
          : modeConfig.maxTurns;
      const configuredTimeout = Number(configManager.get('agent-k.turnTimeoutMs'));
      const turnTimeoutMs = Number.isFinite(configuredTimeout)
        ? Math.max(0, Math.floor(configuredTimeout))
        : undefined;

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
        turnTimeoutMs,
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
        // Re-bind ask_question UI on every tool call (new tab / interrupt safe)
        onAskQuestion: (q) => {
          if (this._hostLoopRequestId !== requestId) {
            throw new Error(
              'ask_question: request superseded. Send a message again to continue.'
            );
          }
          post('ask_question', {
            qid: q.id,
            question: q.question,
            options: q.options,
            required: q.required
          });
          post('status', { status: 'asking' });
        },
        thinkingEffort:
          (message.thinkingEffort as
            | 'off'
            | 'low'
            | 'medium'
            | 'high'
            | 'max') ||
          (configManager.get('agent-k.thinking.effort') as
            | 'off'
            | 'low'
            | 'medium'
            | 'high'
            | 'max') ||
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
              turn: currentTurn,
              thoughtRole: 'opening'
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
          toolStartDetails.clear();
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
          if (status === 'timeout') {
            postTimeline({
              kind: 'error',
              label: 'Run timed out',
              status: 'error',
              id: `tl_timeout_${currentTurn}`
            });
            post('status', { status: 'timeout' });
            // Use `error` field — webview reads data.error (not data.message).
            // onError also fires from the loop; prefer a single clear payload here
            // and skip duplicate empty-message fallbacks in the webview.
            post('error', {
              error:
                'Agent run idle-timed out (agent-k.turnTimeoutMs) — no LLM/tool activity. Increase the setting or set 0 to disable.',
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
            turn,
            thoughtRole: 'opening'
          });
        },
        onAssistantDelta: async (piece) => {
          const text = String(piece || '');
          if (!text) return;
          const firstAnswerToken = streamedAnswer.length === 0;
          streamedAnswer += text;
          deliveredFinal = true;
          if (firstAnswerToken) {
            // Close Thought chrome once answer tokens start (Cursor-like)
            const turn = currentTurn || 1;
            postTimeline({
              kind: 'thinking',
              label: 'Thought',
              status: 'done',
              id: `tl_thinking_${turn}`,
              turn,
              thoughtRole: 'opening'
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
          const detail = shortDetail(name, args as Record<string, unknown>);
          const turn = currentTurn || 1;
          const id =
            callId && String(callId).trim()
              ? `tl_${String(callId)}`
              : `tl_tool_${turn}_${name}_${++timelineSeq}`;
          activeToolItems.set(callId || name, id);
          // Keep Cursor-style start detail across tool result (don't replace with "N matches")
          if (detail) {
            toolStartDetails.set(id, detail);
          }
          // Tool turn may have streamed draft prose — reset so final answer can stream cleanly
          streamedAnswer = '';
          // Mid-turn deltas must not count as the closing message
          deliveredFinal = false;
          // Close Thought + Planning before Exploring tools slide in
          postTimeline({
            kind: 'thinking',
            label: 'Thought',
            status: 'done',
            id: `tl_thinking_${turn}`,
            turn,
            thoughtRole: 'opening'
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
        onUsage: (usage) => {
          try {
            const tracker = RuntimeServices.getSessionUsageTracker() || sessionUsageTracker;
            tracker.recordUsage(usage.promptTokens || 0, usage.completionTokens || 0);
            updateUsageStatusBar();
          } catch {
            /* usage tracking is best-effort */
          }
        },
        onToolResult: async (name, result, callId) => {
          const kind = toolKind(name);
          const turn = currentTurn || 1;
          const id =
            activeToolItems.get(callId || name) ||
            (callId ? `tl_${String(callId)}` : `tl_tool_${turn}_${name}`);
          const startDetail = toolStartDetails.get(id);
          const endDetail = resultDetail(kind, result, name);
          // Explore rows keep Grepped/Read args text; failures still show error
          const exploreKeepStart =
            kind === 'searching' ||
            kind === 'reading' ||
            kind === 'browsing' ||
            name === 'grep' ||
            name === 'read_file' ||
            name === 'read_files' ||
            name === 'glob' ||
            name === 'file_search' ||
            name === 'codebase_search' ||
            name === 'list_dir';
          const detail = !result.success
            ? endDetail || startDetail
            : exploreKeepStart && startDetail
              ? startDetail
              : endDetail || startDetail;
          toolStartDetails.delete(id);
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
            turn,
            thoughtRole: 'opening'
          });
          postTimeline({
            kind: 'planning',
            label: 'Planning next moves',
            status: 'done',
            id: `tl_planning_${turn}`,
            turn
          });
          post('status', { status: '' });
          const full = String(content || '');
          if (!full.trim()) return;
          // Never re-dump the whole answer after deltas already streamed it
          if (streamedAnswer.length > 0) {
            if (full.startsWith(streamedAnswer)) {
              const rest = full.slice(streamedAnswer.length);
              if (rest) {
                streamedAnswer += rest;
                post('delta', { content: rest });
              }
            }
            // else: different/duplicate blob — ignore to avoid "same message twice"
            return;
          }
          streamedAnswer = full;
          post('delta', { content: full });
        },
        onError: (err) => {
          // Timeout already posted a user-facing error from onStatus — avoid
          // a second event that the webview would ignore (finished=true) or
          // that could race with the wrong field name.
          if (/timed out/i.test(err.message || '')) {
            return;
          }
          postTimeline({
            kind: 'error',
            label: 'Error',
            detail: (err.message || String(err)).slice(0, 80),
            status: 'error',
            id: `tl_error_${currentTurn || 0}`
          });
          post('error', { error: err.message || String(err) || 'Agent loop failed' });
        }
      });

      this._hostLoop = loop;

      // Keepalive so webview idle watchdog does not fire during slow LLM TTFT / ask_question
      const heartbeat = setInterval(() => {
        if (this._hostLoopRequestId !== requestId) return;
        const asking = RuntimeServices.isAskQuestionPending();
        if (this._hostLoop?.isRunning || asking) {
          post('heartbeat', {});
        }
        // Re-broadcast pending MCQ — recovers if first ask_question event was missed
        const pending = RuntimeServices.getPendingQuestion();
        if (pending) {
          post('ask_question', {
            qid: pending.id,
            question: pending.question,
            options: pending.options,
            required: pending.required,
          });
          post('status', { status: 'asking' });
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

        if (!deliveredFinal && streamedAnswer.length === 0 && this._hostLoopRequestId === requestId) {
          post('status', { status: '' });
          const snap = loop.getMessages();
          const last = [...snap].reverse().find(
            (m) => m.role === 'assistant' && m.content && !m.toolCalls?.length
          );
          if (last?.content) {
            post('delta', { content: last.content });
            deliveredFinal = true;
            streamedAnswer = String(last.content);
          }
        }

        // Tools ran but body still empty (sealed mid-prose, empty final) — surface last assistant text
        if (
          streamedAnswer.length === 0 &&
          sealedContentTurn >= 0 &&
          this._hostLoopRequestId === requestId
        ) {
          const snap = loop.getMessages();
          const last = [...snap].reverse().find(
            (m) =>
              m.role === 'assistant' &&
              String(m.content || '').trim() &&
              !m.toolCalls?.length
          );
          if (last?.content?.trim()) {
            post('delta', { content: last.content });
            streamedAnswer = String(last.content);
          }
        }

        if (this._hostLoopRequestId === requestId) {
          // Don't send complete after a timeout/error already ended the stream
          const st = loop.state?.status;
          if (st !== 'timeout' && st !== 'error') {
            post('complete');
          }
        }
      } finally {
        clearInterval(heartbeat);
        // Do NOT clear ask_question notifier here — a newer request may already
        // own the bridge. Cleared only on webview dispose / ensure overwrite.
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

  /** Command palette: create/open workspace `.agent-k/settings.json` */
  public openProjectConfig(): void {
    void this.handleProjectConfigOpen();
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
  /** ADDON-T14: run diff review (+ optional LM pass) and seed FindingList */
  public async openReview() {
    const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (repoRoot) {
      try {
        const loop = new AgentReviewLoop(repoRoot);
        let provider: { complete: (prompt: string) => Promise<string> } | undefined;
        try {
          const { LiteLLMProvider } = await import('./providers/LiteLLMProvider');
          const cfg = vscode.workspace.getConfiguration('agent-k');
          const apiKey = cfg.get<string>('provider.apiKey') || undefined;
          const baseUrl = String(cfg.get('provider.baseUrl') || 'http://127.0.0.1:52415');
          const model = String(cfg.get('provider.model') || cfg.get('model') || 'gpt-4o-mini');
          const providerType = String(cfg.get('provider.type') || 'litellm') as
            | 'litellm'
            | 'openai'
            | 'anthropic'
            | 'ollama'
            | 'lmstudio'
            | 'opencode-zen'
            | 'opencode-go';
          const litellm = new LiteLLMProvider({
            id: 'agent-k-review',
            name: 'Agent K Review',
            type: providerType,
            baseUrl,
            apiKey,
            model,
          });
          provider = {
            complete: async (prompt: string) => {
              let out = '';
              for await (const chunk of litellm.streamChat({
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                maxTokens: 2000,
              })) {
                if (chunk.content) out += chunk.content;
                if (chunk.error) break;
              }
              return out;
            },
          };
        } catch {
          provider = undefined;
        }
        const result = await loop.reviewWithLM(provider);
        this._view?.webview.postMessage({
          type: 'ui.review.open',
          findings: result.findings,
          diffSummary: result.diffSummary,
        });
        if (!result.diffSummary) {
          void vscode.window.showInformationMessage('Agent K Review: no git diff to review.');
        }
        return;
      } catch {
        /* fall through to demo panel — e.g. not a git repo */
      }
    }
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

  // ADDON-T11: Status Bar 토큰/비용 표시. 실패해도 나머지 activate에 영향 없음.
  try {
    usageStatusBarItem = vscode.window.createStatusBarItem(
      'agent-k.usage',
      vscode.StatusBarAlignment.Right,
      100
    );
    context.subscriptions.push(usageStatusBarItem);
    RuntimeServices.setSessionUsageTracker(sessionUsageTracker);
    updateUsageStatusBar();
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('agent-k.telemetry.statusBarEnabled')) {
          updateUsageStatusBar();
        }
      })
    );
  } catch (err) {
    outputChannel.appendLine(
      `[Agent K] usage status bar init failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`
    );
  }

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
    bindProjectConfig(context);

    const checkpointManager = new CheckpointManager();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      checkpointManager.setPersistRoot(workspaceRoot);
    }
    RuntimeServices.setCheckpointManager(checkpointManager);

    // ADDON-T06: host-side session persistence (survives Extension Host restart)
    RuntimeServices.setSessionManager(new SessionManager(context.workspaceState));
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

      vscode.commands.registerCommand('agent-k.openProjectConfig', () => {
        provider.openProjectConfig();
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
      }),

      // ADDON-T13: Best-of-N — prompt task/N, run parallel worktree trials, adopt or clean up
      vscode.commands.registerCommand('agent-k.bestOfN.run', async () => {
        const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!repoRoot) {
          void vscode.window.showWarningMessage(
            'Agent K: Best-of-N requires an open workspace folder.'
          );
          return;
        }

        const task = await vscode.window.showInputBox({
          prompt: 'Best-of-N: describe the task to run in parallel worktrees',
          placeHolder: 'e.g. Add input validation to the signup form'
        });
        if (!task?.trim()) return;

        const nPick = await vscode.window.showQuickPick(['2', '3', '4'], {
          placeHolder: 'Number of parallel trials (N)'
        });
        if (!nPick) return;
        const n = Number(nPick) || 2;

        const cfg = vscode.workspace.getConfiguration('agent-k');
        const model = String(cfg.get('provider.model') || 'default-model');

        const manager = new WorktreeManager(repoRoot);
        const bestOfN = new BestOfN(manager);

        let trials: BoNTrial[] = [];
        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Agent K: Running Best-of-${n}…`,
              cancellable: false
            },
            async () => {
              trials = await bestOfN.run({
                n,
                models: Array(n).fill(model),
                prompts: Array(n).fill(task),
                task
              });
            }
          );
        } catch (err) {
          void vscode.window.showErrorMessage(`[Agent K] Best-of-N failed: ${err}`);
          await bestOfN.cleanup().catch(() => {});
          return;
        }

        if (!trials.length) {
          void vscode.window.showWarningMessage(
            '[Agent K] Best-of-N produced no trials (worktree creation may have failed).'
          );
          return;
        }

        const items = trials.map((t) => ({
          label: `${t.id} — ${t.status}`,
          description: `${t.model} · ${t.duration != null ? `${(t.duration / 1000).toFixed(1)}s` : 'n/a'}`,
          detail: (t.output || t.error || '').slice(0, 200),
          trial: t
        }));

        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a trial to adopt into this workspace (Esc cancels and cleans up all worktrees)'
        });

        if (!picked) {
          await bestOfN.cleanup().catch(() => {});
          void vscode.window.showInformationMessage(
            '[Agent K] Best-of-N cancelled — worktrees cleaned up.'
          );
          return;
        }

        const adopter = new AdoptWinner(manager, repoRoot);
        try {
          const result = await adopter.adopt(picked.trial);
          if (result.success) {
            await Promise.all(
              trials
                .filter((t) => t.id !== picked.trial.id)
                .map((t) => manager.remove(t.worktree.path).catch(() => {}))
            );
            void vscode.window.showInformationMessage(
              `[Agent K] Adopted ${picked.trial.id} (${result.filesChanged} file(s) changed).`
            );
          } else {
            void vscode.window.showErrorMessage(
              `[Agent K] Adopt failed: ${result.error || 'unknown error'}`
            );
            await bestOfN.cleanup().catch(() => {});
          }
        } catch (err) {
          void vscode.window.showErrorMessage(`[Agent K] Adopt failed: ${err}`);
          await bestOfN.cleanup().catch(() => {});
        }
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