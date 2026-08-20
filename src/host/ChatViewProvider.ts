import * as vscode from 'vscode';
import { RuntimeServices } from '../core/RuntimeServices';
import { PlanStorage } from '../plan/PlanStorage';
import {
  readPlanFromEditor,
} from '../plan/PlanCodeLensProvider';
import { DebugStorage } from '../debug/DebugStorage';
import { configManager } from '../core/ConfigManager';
import { AgentReviewLoop } from '../review/AgentReviewLoop';
import {
  handleRulesList,
  handleRulesLoad,
  handleRulesSave,
  handleRulesCreate,
  handleRulesDelete,
} from '../settings/rulesHostHandlers';
import { setProjectConfigPostToWebview } from './configBridge';
import { resolveWorkspaceRelativeSegments } from './workspacePaths';
import { getWebviewHtml } from './webviewHtml';
import {
  runProviderConnectionTest as probeProviderConnection,
  refreshModelContext as probeModelContext,
} from './providerProbe';
import {
  sendConfigHydrate as hydrateHostConfig,
  handleProjectConfigGet as getProjectConfig,
  handleProjectConfigSave as saveProjectConfig,
  handleProjectConfigOpen as openProjectConfigFile,
  handleProjectConfigCreateExample as createProjectConfigExample,
} from './configProject';
import {
  sendCheckpointList as hydrateCheckpoints,
  sendSessionHydration as hydrateSessions,
  persistSessionsToHost as persistHostSessions,
  restoreCheckpoint as restoreHostCheckpoint,
} from './sessionHost';
import {
  openWorkspaceFile as openHostWorkspaceFile,
  pickAttachmentUris as pickHostAttachmentUris,
  handleComposerSearch as searchComposer,
  resolveAttachmentUris as resolveHostAttachmentUris,
} from './composerHost';
import { runPlanV2Generate as executePlanV2Generate } from './planGenerate';
import { runHostPlanExecute as executeHostPlanExecute } from './planExecute';
import { runHostChatSend as executeHostChatSend, type HostLoopRuntime } from './chatSend';
import type { InlineEditChatPayload } from '../inline/InlineEditController';
import {
  handleWorktreeApplyMessage,
  handleWorktreeRejectMessage,
  handleWorktreeReviewMessage
} from './subagentWorktreeBridge';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'agent-k.chat';

  private _view?: vscode.WebviewView;
  /** In-flight AgentLoopController runtimes keyed by requestId (parallel tabs). */
  private _hostLoops = new Map<string, HostLoopRuntime>();
  /** Latest request id (legacy bridge fallback only). */
  private _hostLoopRequestId?: string;
  /**
   * In-flight Plan V2 LLM generations, keyed by webview requestId.
   * sessionId lets chat.send abort only the same tab's generate (parallel tabs).
   */
  private _planV2Aborts = new Map<string, { abort: AbortController; sessionId: string }>();
  /** Cancel arrived before runPlanV2Generate registered an AbortController. */
  private _planV2CancelledIds = new Set<string>();

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    setProjectConfigPostToWebview((msg) => {
      void this._view?.webview.postMessage(msg);
    });
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
        this.abortPlanV2Generate();
        this.abortHostChatLoop();
        this._view = undefined;
        setProjectConfigPostToWebview(undefined);
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
        required: q.required,
        allowMultiple: Boolean(q.allowMultiple)
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
    return getWebviewHtml(webview, this.extensionUri);
  }

  private async runProviderConnectionTest(
    requestId: string,
    baseUrl: string,
    apiKey?: string,
    model?: string,
    extraHeaders?: Record<string, string>
  ): Promise<void> {
    await probeProviderConnection(this._view?.webview, requestId, baseUrl, apiKey, model, extraHeaders);
  }

  private async refreshModelContext(message: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    providerType?: string;
  }): Promise<void> {
    await probeModelContext(this._view?.webview, message);
  }

  private handleMessage(message: any) {
    if (!message || typeof message !== 'object') return;
    // Models tab: 연결 테스트는 Host fetch로 수행
    if (message.type === 'provider.test' && message.requestId != null) {
      const extraHeaders =
        message.extraHeaders && typeof message.extraHeaders === 'object' && !Array.isArray(message.extraHeaders)
          ? Object.fromEntries(
              Object.entries(message.extraHeaders as Record<string, unknown>).filter(
                (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
              )
            )
          : undefined;
      void this.runProviderConnectionTest(
        String(message.requestId),
        String(message.baseUrl ?? ''),
        message.apiKey ? String(message.apiKey) : undefined,
        message.model ? String(message.model) : undefined,
        extraHeaders
      );
      return;
    }
    // Agent/Plan/Debug: host-mediated tool loop (webview cannot run fs tools)
    if (message.type === 'chat.send' && message.requestId != null) {
      // Parallel tabs: abort only this session's Plan V2 generate — never all tabs.
      const sendSessionId =
        String(message.sessionId || '').trim() ||
        this.sessionIdFromHostRequestId(String(message.requestId));
      this.abortPlanV2GenerateForSession(sendSessionId);
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
    if (message.type === 'worktree.review' && message.subagentId != null) {
      void handleWorktreeReviewMessage(this._view?.webview, message);
      return;
    }
    if (message.type === 'worktree.apply' && message.subagentId != null) {
      void handleWorktreeApplyMessage(this._view?.webview, message);
      return;
    }
    if (message.type === 'worktree.reject' && message.subagentId != null) {
      void handleWorktreeRejectMessage(this._view?.webview, message);
      return;
    }
    if (message.type === 'plan.v2.cancel' && message.requestId != null) {
      this.abortPlanV2Generate(String(message.requestId));
      return;
    }
    // ask_question answer from ClarifyingQuestions (host waits on RuntimeServices)
    if (message.type === 'chat.answer' && message.qid != null) {
      RuntimeServices.resolveQuestion(String(message.qid), String(message.answer ?? ''));
      return;
    }
    if (message.type === 'chat.question.cancel') {
      if (message.qid != null) {
        RuntimeServices.cancelQuestionById(
          String(message.qid),
          `ask_question cancelled: ${message.qid}`
        );
      } else if (this._hostLoopRequestId) {
        RuntimeServices.cancelQuestion(
          'ask_question cancelled',
          this._hostLoopRequestId
        );
      } else {
        RuntimeServices.cancelQuestion('ask_question cancelled');
      }
      return;
    }
    // Plan V2 semantic validation: resolve repository file existence in the
    // Extension Host instead of weakening validation inside the webview.
    if (message.type === 'plan.fileExists' && message.requestId != null) {
      void (async () => {
        const requestId = String(message.requestId);
        const rawPath = String(message.path || '').trim();
        try {
          const folder = vscode.workspace.workspaceFolders?.[0];
          if (!folder) {
            void this._view?.webview.postMessage({ type: 'plan.fileExists.result', requestId, exists: false });
            return;
          }
          const segments = resolveWorkspaceRelativeSegments(rawPath, folder);
          if (!segments) {
            void this._view?.webview.postMessage({ type: 'plan.fileExists.result', requestId, exists: false });
            return;
          }
          const candidate = vscode.Uri.joinPath(folder.uri, ...segments);
          try {
            await vscode.workspace.fs.stat(candidate);
            void this._view?.webview.postMessage({ type: 'plan.fileExists.result', requestId, exists: true });
          } catch {
            void this._view?.webview.postMessage({ type: 'plan.fileExists.result', requestId, exists: false });
          }
        } catch {
          void this._view?.webview.postMessage({ type: 'plan.fileExists.result', requestId, exists: false });
        }
      })();
      return;
    }
    // Plan V2 generation: run the actual LLM request from the Extension
    // Host, not the webview. LiteLLMPlanModel/PlanV2Generator used to be
    // instantiated directly inside ChatApp.tsx and called provider.fetch()
    // from the webview's browser context -- a vscode-webview:// origin,
    // which is subject to full CORS like any other page. Any local model
    // server that doesn't send Access-Control-Allow-Origin (LM Studio's
    // default on http://localhost:1234, for one) gets its preflight
    // rejected outright: "blocked by CORS policy ... Failed to fetch",
    // surfaced up through PlanV2Generator as MODEL_REQUEST_FAILED. The
    // main Agent/Plan/Debug chat loop never hit this because
    // AgentLoopController + LiteLLMProvider already run here in the
    // Extension Host (Node), where fetch has no CORS restriction at all --
    // this handler brings Plan V2 generation in line with that, rather
    // than special-casing CORS in the webview (which can't be fixed
    // client-side; the server would have to add the header itself).
    if (message.type === 'plan.v2.generate' && message.requestId != null) {
      // Stop only the same session/runtime loop first, then generate.
      this.abortHostChatLoopsForSession(String(message.sessionId || ''));
      void this.runPlanV2Generate(message);
      return;
    }
    if (message.type === 'plan.execute' && message.requestId != null) {
      this.abortHostChatLoopsForSession(String(message.sessionId || ''));
      void executeHostPlanExecute({ webview: this._view?.webview }, message);
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
            requestId: message.requestId,
            sessionId: message.sessionId != null ? String(message.sessionId) : undefined
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
                `Plan saved: ${stored.filePath}`,
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
          void vscode.window.showErrorMessage(`Plan save failed: ${msg}`);
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
            requestId: message.requestId,
            sessionId: message.sessionId != null ? String(message.sessionId) : undefined
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
              `Debug saved: ${stored.filePath}`,
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
          void vscode.window.showErrorMessage(`Debug save failed: ${msg}`);
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
    // Webview → host: persist agent-k.* settings (and keep host ConfigManager in sync)
    if (message.type === 'config.update' && message.values) {
      const values = message.values as Record<string, unknown>;
      configManager.syncFromVSCode(values);
      const section = vscode.workspace.getConfiguration('agent-k');
      for (const [fullKey, value] of Object.entries(values)) {
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
      void this.restoreCheckpoint(
        String(message.id),
        message.reason != null ? String(message.reason) : undefined
      );
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
    // Project JSON config (.agentk/settings.json)
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
    if (message.type === 'rules.list') {
      void handleRulesList(this._view?.webview, String(message.requestId || ''));
      return;
    }
    if (message.type === 'rules.load') {
      void handleRulesLoad(
        this._view?.webview,
        String(message.requestId || ''),
        String(message.id || '')
      );
      return;
    }
    if (message.type === 'rules.save') {
      void handleRulesSave(
        this._view?.webview,
        String(message.requestId || ''),
        String(message.id || ''),
        String(message.content ?? '')
      );
      return;
    }
    if (message.type === 'rules.create') {
      void handleRulesCreate(
        this._view?.webview,
        String(message.requestId || ''),
        String(message.title ?? '')
      );
      return;
    }
    if (message.type === 'rules.delete') {
      void handleRulesDelete(
        this._view?.webview,
        String(message.requestId || ''),
        String(message.id || '')
      );
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

  private sendConfigHydrate(): void {
    hydrateHostConfig(this._view?.webview);
  }

  private async handleProjectConfigGet(): Promise<void> {
    await getProjectConfig(this._view?.webview);
  }

  private async handleProjectConfigSave(text: string): Promise<void> {
    await saveProjectConfig(this._view?.webview, text);
  }

  private async handleProjectConfigOpen(): Promise<void> {
    await openProjectConfigFile();
  }

  private async handleProjectConfigCreateExample(): Promise<void> {
    await createProjectConfigExample(this._view?.webview);
  }

  private sendCheckpointList(): void {
    hydrateCheckpoints(this._view?.webview);
  }

  private sendSessionHydration(): void {
    hydrateSessions(this._view?.webview);
  }

  private persistSessionsToHost(sessions: unknown[], currentId?: unknown): void {
    persistHostSessions(sessions, currentId);
  }

  private async restoreCheckpoint(id: string, reason?: string): Promise<void> {
    await restoreHostCheckpoint(id, reason);
  }

  private async openWorkspaceFile(filePath: string): Promise<void> {
    await openHostWorkspaceFile(filePath);
  }

  private async pickAttachmentUris(requestId: string): Promise<void> {
    await pickHostAttachmentUris(this._view?.webview, requestId);
  }

  private async handleComposerSearch(
    requestId: string,
    query: string,
    kind: 'file' | 'folder'
  ): Promise<void> {
    await searchComposer(this._view?.webview, requestId, query, kind);
  }

  private async resolveAttachmentUris(requestId: string, uris: string[]): Promise<void> {
    await resolveHostAttachmentUris(this._view?.webview, requestId, uris);
  }

  private abortHostChatLoop(requestId?: string) {
    const targets = requestId
      ? requestId && this._hostLoops.has(requestId)
        ? [requestId]
        : []
      : [...this._hostLoops.keys()];

    for (const id of targets) {
      const rt = this._hostLoops.get(id);
      if (!rt) continue;
      rt.loop.stop();
      rt.abort.abort();
      this._hostLoops.delete(id);
      if (this._view) {
        void this._view.webview.postMessage({
          type: 'chat.stream',
          requestId: id,
          event: 'stopped'
        });
      }
      if (this._hostLoopRequestId === id) {
        this._hostLoopRequestId = undefined;
      }
    }

    // Unstick ask_question / reproduce waiters for the aborted request(s) only.
    if (requestId) {
      RuntimeServices.cancelQuestion('chat stopped', requestId);
      if (this._hostLoops.size === 0) {
        RuntimeServices.cancelReproduce();
      }
    } else {
      RuntimeServices.cancelQuestion('chat stopped');
      RuntimeServices.cancelReproduce();
    }
  }

  /** Stop only host chat loops that belong to one chat session/runtime key. */
  private abortHostChatLoopsForSession(sessionId?: string) {
    const owner = String(sessionId || '').trim();
    if (!owner) return;
    const prefix = `host_${owner}_`;
    for (const id of [...this._hostLoops.keys()]) {
      if (id.startsWith(prefix)) this.abortHostChatLoop(id);
    }
  }

  /** Parse session/runtime key from `host_${sessionId}_${n}_${ts}` request ids. */
  private sessionIdFromHostRequestId(requestId: string): string {
    const m = String(requestId || '').match(/^host_(.+?)_\d+_\d+$/);
    return m?.[1]?.trim() || '';
  }

  /** Abort Plan V2 generates that belong to one chat session only. */
  private abortPlanV2GenerateForSession(sessionId?: string): void {
    const owner = String(sessionId || '').trim();
    if (!owner) return;
    for (const [id, entry] of [...this._planV2Aborts.entries()]) {
      if (entry.sessionId !== owner) continue;
      this._planV2CancelledIds.add(id);
      entry.abort.abort();
      this._planV2Aborts.delete(id);
    }
  }

  private abortPlanV2Generate(requestId?: string): void {
    if (requestId) {
      this._planV2CancelledIds.add(requestId);
      const entry = this._planV2Aborts.get(requestId);
      entry?.abort.abort();
      this._planV2Aborts.delete(requestId);
      return;
    }
    // Dispose path only — cancel every in-flight Plan V2 generate.
    for (const id of this._planV2Aborts.keys()) this._planV2CancelledIds.add(id);
    for (const entry of this._planV2Aborts.values()) entry.abort.abort();
    this._planV2Aborts.clear();
  }

  /**
   * Plan V2 LLM generation. Always runs after the current AgentLoop chain
   * so research turns cannot keep posting after the webview has moved on.
   */
  private async runPlanV2Generate(message: any): Promise<void> {
    await executePlanV2Generate(
      {
        webview: this._view?.webview,
        planV2Aborts: this._planV2Aborts,
        planV2CancelledIds: this._planV2CancelledIds,
        abortPlanV2Generate: (id) => this.abortPlanV2Generate(id),
      },
      message
    );
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
    await executeHostChatSend(
      {
        webview: this._view?.webview,
        hostLoops: this._hostLoops,
        getHostLoopRequestId: () => this._hostLoopRequestId,
        setHostLoopRequestId: (id) => {
          this._hostLoopRequestId = id;
        },
      },
      message
    );
  }

  public newSession() {
    this._view?.webview.postMessage({ type: 'session.new' });
  }

  /** Open in-chat Settings Hub (Models tab by default) */
  public openSettings(tab?: string) {
    this._view?.webview.postMessage({ type: 'settings.open', tab: tab || 'models' });
  }

  /** Command palette: create/open workspace `.agentk/settings.json` */
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

  /** Host → webview Inline Edit (1-4d). Does not dump selection into composer text. */
  public async requestInlineEdit(payload: InlineEditChatPayload): Promise<void> {
    await this.revealChat();
    if (!this._view?.webview) {
      void vscode.window.showWarningMessage(
        'Agent K: open the chat panel before using Inline Edit.'
      );
      return;
    }
    this._view.webview.postMessage(payload);
  }

  /**
   * Attach current editor selection (with line range) to the chat composer.
   */
  public attachEditorSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage('Agent K: select text in the editor, then try again.');
      return;
    }
    const { document, selection } = editor;
    const text = document.getText(selection);
    if (!text.trim()) {
      void vscode.window.showWarningMessage('Agent K: no text is selected.');
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
          const { LiteLLMProvider } = await import('../providers/LiteLLMProvider');
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
        'Agent K: open a plan_*.md file under `.agentk/plans`, then run Build.'
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
        'Agent K: open a plan_*.md file under `.agentk/plans`, then open Review.'
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
