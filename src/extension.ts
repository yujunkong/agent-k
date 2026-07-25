import * as vscode from 'vscode';
import { registerReadTools } from './tools/readTools';
import { registerEditTools } from './tools/editTools';
import { registerC5C7Tools } from './tools/c5c7Tools';
import { DebugLogServer } from './debug/DebugLogServer';
import { MCPClient } from './mcp/MCPClient';
import { bootstrapMcpFromSettings, registerMcpToolsInRegistry } from './mcp/bootstrapMcp';
import { RuntimeServices } from './core/RuntimeServices';
import { PlanStorage } from './plan/PlanStorage';
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
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <!-- connect-src: webview fetch (Models tab test, chat API calls) -->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src http: https: ws: wss:; script-src 'nonce-${nonce}' ${webview.cspSource}; style-src 'nonce-${nonce}' 'unsafe-inline' ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="${styleUri}" nonce="${nonce}">
        <title>Agent K Chat</title>
      </head>
      <body>
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
   * Agent/Plan/Debug chat.send → AgentLoopController (정의된 턴 계약).
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
        name === 'codebase_search'
      ) {
        return 'searching';
      }
      if (name === 'read_file' || name === 'list_dir' || name === 'read_lints') {
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
      const pick =
        args.path ??
        args.target_file ??
        args.file_path ??
        args.glob_pattern ??
        args.pattern ??
        args.query ??
        args.command ??
        args.url;
      if (pick == null) return undefined;
      const s = String(pick);
      return s.length > 80 ? `${s.slice(0, 77)}…` : s;
    };

    const resultDetail = (
      kind: string,
      result: { success: boolean; data?: unknown; error?: string }
    ): string | undefined => {
      if (!result.success) {
        const err = String(result.error || 'failed');
        return err.length > 60 ? `${err.slice(0, 57)}…` : err;
      }
      const data = result.data;
      if (Array.isArray(data)) return `${data.length} result(s)`;
      if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>;
        if (Array.isArray(obj.files)) return `${obj.files.length} file(s)`;
        if (Array.isArray(obj.matches)) return `${obj.matches.length} match(es)`;
        if (typeof obj.path === 'string') return String(obj.path).slice(0, 80);
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

    let deliveredFinal = false;
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
      const { toolRegistry } = await import('./tools/registry');
      const { modeRegistry } = await import('./agent/modeRegistry');

      const modeConfig = modeRegistry.getModeConfig(mode);
      const maxTurns = modeConfig.maxTurns || 15;

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
          toolSchemas: toolRegistry.getSchemas(mode, 'A')
        }
      );
      const systemPrompt =
        assembly.slots.find((s) => s.name === 'system')?.content ||
        modeRegistry.getSystemPrompt(mode);

      const provider = new LiteLLMProvider({
        id: 'agent-k-chat',
        name: 'Agent K Chat',
        type: 'litellm',
        baseUrl,
        apiKey,
        model
      });

      const loop = new AgentLoopController({
        mode,
        maxTurns,
        modelId: model,
        tier: 'A',
        systemPrompt,
        provider,
        // Per-turn Thought + tools (sequential history — do not overwrite one row)
        onTurnStart: async (turn) => {
          // Freeze previous turn's Thought so duration/UI stay sequential
          if (currentTurn > 0 && currentTurn !== turn) {
            postTimeline({
              kind: 'thinking',
              label: 'Thought',
              status: 'done',
              id: `tl_thinking_${currentTurn}`,
              turn: currentTurn
            });
          }
          currentTurn = turn;
          activeToolItems.clear();
          postTimeline({
            kind: 'thinking',
            label: 'Working',
            status: 'running',
            id: `tl_thinking_${turn}`,
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
          const clipped = String(fullText || '').trim().slice(0, 6000);
          if (!clipped) return;
          const turn = currentTurn || 1;
          postTimeline({
            kind: 'thinking',
            label: 'Thought',
            detail: clipped,
            status: 'running',
            id: `tl_thinking_${turn}`,
            turn
          });
        },
        onToolCall: async (name, args) => {
          const kind = toolKind(name);
          const detail = shortDetail(args as Record<string, unknown>);
          const turn = currentTurn || 1;
          const id = `tl_tool_${turn}_${name}_${++timelineSeq}`;
          activeToolItems.set(name, id);
          // Close this turn's Thought (keep detail) before tools
          postTimeline({
            kind: 'thinking',
            label: 'Thought',
            status: 'done',
            id: `tl_thinking_${turn}`,
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
          post('tool.start', { toolName: name });
        },
        onToolResult: async (name, result) => {
          const kind = toolKind(name);
          const turn = currentTurn || 1;
          const id = activeToolItems.get(name) || `tl_tool_${turn}_${name}`;
          const detail = resultDetail(kind, result);
          postTimeline({
            kind: result.success ? kind : 'error',
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
          post('status', { status: '' });
          if (content?.trim()) {
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

  public clearHistory() {
    this._view?.webview.postMessage({ type: 'session.clear' });
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

  // Force the webview view to re-resolve after provider registration (avoids stale "no data provider")
  setTimeout(() => {
    void vscode.commands.executeCommand('workbench.view.extension.agent-k');
  }, 100);

  try {
    RuntimeServices.setWorkspaceState(context.workspaceState);
    RuntimeServices.setDebugLogServer(debugLogServer);
    RuntimeServices.setMcpClient(mcpClient);
    PlanStorage.setExtensionContext(context);

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

      vscode.commands.registerCommand('agent-k.chat.clear', () => {
        provider.clearHistory();
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

      vscode.commands.registerCommand('agent-k.plan.open', () => {
        vscode.window.showInformationMessage('[Agent K] Plan mode: create a new plan');
        provider.switchMode();
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