/**
 * HOST-001 / EXT-* — Chat WebviewViewProvider.
 * Webview lifecycle, message router, command surface stubs.
 */

import * as vscode from 'vscode';
import type { ChatSendContext, HostLoopRuntime } from './chatSend';
import { handleWebviewMessage } from './handleWebviewMessage';
import { getNonce } from './nonce';
import {
  abortPlanGenerate,
  type PlanGenerateContext,
} from './planGenerate';
import { getWebviewHtml } from './webviewHtml';
import { rememberEditorCopy } from './editorCopyStash';
import { hostLog } from './hostLog';
import {
  InlineEditController,
  type InlineEditRequest,
} from './inline/InlineEditController';
import {
  connectMcpServer,
  disconnectMcp,
  reloadMcpFromSettings,
} from './mcpHost';
import { readPlanFromEditor } from './planEditorHost';
import { runReviewAndOpenPanel } from './reviewHost';
import { BestOfN, WorktreeManager } from '@agent-k/worktree';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  /** Must match contributes.views id in extensions/agent-k/package.json. */
  public static readonly viewType = 'agent-k.chat';

  private view?: vscode.WebviewView;

  /** HOST-002 — in-flight agent loops keyed by requestId. */
  private readonly hostLoops = new Map<string, HostLoopRuntime>();
  private hostLoopRequestId: string | undefined;

  /** HOST-008 — Plan V2 generate abort tracking. */
  private readonly planGenerateAborts = new Map<
    string,
    { abort: AbortController; sessionId: string }
  >();
  private readonly planGenerateCancelledIds = new Set<string>();

  /** INLINE-001 — selection edit bridge. */
  private readonly inlineEditController = new InlineEditController();

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
      // Comment: after ui.ready handshake, claim workbench focus so 1st paste/DnD hits webview
      if (
        message &&
        typeof message === 'object' &&
        (message as { type?: string }).type === 'ui.ready'
      ) {
        this.claimWebviewFocus('ui.ready');
      }
    });

    // Comment: Activity Bar reveal often leaves focus on the editor — steal it for paste/DnD
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.claimWebviewFocus('visibility');
      }
    });
    if (webviewView.visible) {
      this.claimWebviewFocus('resolve');
    }
  }

  /**
   * CHAT-012 — first Cmd+V / drag into an unfocused sidebar webview is eaten by
   * the workbench (focus only). Take focus + tell Composer to focus the textarea.
   * Retries: React may not have mounted Composer yet when ui.ready fires.
   */
  private claimWebviewFocus(reason: string): void {
    hostLog('composer.attach', `claim webview focus (${reason})`);
    try {
      // preserveFocus=false → keyboard/clipboard target becomes this webview
      this.view?.show(false);
    } catch {
      /* show() may throw if view disposed */
    }
    const post = () => {
      void this.view?.webview.postMessage({ type: 'focus.input' });
    };
    post();
    setTimeout(post, 50);
    setTimeout(post, 200);
    setTimeout(post, 500);
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
      planGenerateAborts: this.planGenerateAborts,
      planGenerateCancelledIds: this.planGenerateCancelledIds,
      abortPlanGenerate: (requestId) =>
        abortPlanGenerate(planGenerate, requestId),
    };
    return {
      webview: this.view?.webview,
      extensionVersion: this.extensionVersion,
      chatSend,
      planGenerate,
    };
  }

  // ─── EXT-003 command surface (v2.1 parity + v3.0 adaptations) ───

  public newSession(): void {
    void this.focusChatView();
    // v2.1 parity: webview forks a new tab (CHAT-009).
    void this.postMessage({ type: 'session.new' });
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
    // v2.1 parity: webview cycles the mode pill (auto → agent → plan → debug → ask).
    void this.postMessage({ type: 'mode.switch' });
  }

  public focusInput(): void {
    void this.focusChatView().then(() => {
      this.claimWebviewFocus('command.focusInput');
    });
  }

  /** CHAT-005 — attach current editor selection (line range) as a Composer chip. */
  public attachEditorSelection(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage(
        '[Agent K] Select text in the editor, then try again.',
      );
      return;
    }
    const { document, selection } = editor;
    const text = document.getText(selection);
    if (!text.trim()) {
      void vscode.window.showWarningMessage('[Agent K] No text is selected.');
      return;
    }
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;
    const path = document.uri.fsPath;
    const label = path.replace(/\\/g, '/').split('/').pop() || path;
    // Comment: same copy-time meta as Cmd+C stash — paste/attach share path source
    rememberEditorCopy({
      path,
      label,
      content: text,
      startLine,
      endLine,
    });
    void this.focusInput();
    void this.view?.webview.postMessage({
      type: 'attachments.add',
      items: [
        {
          // Comment: file + range — Composer maps to openable chip (not anonymous log)
          type: 'file',
          path,
          label,
          content: text,
          startLine,
          endLine,
          id: `sel_${Date.now().toString(36)}`,
        },
      ],
    });
  }

  public requestInlineEdit(): void {
    void this.inlineEditController.runFromActiveEditor();
  }

  /** Wire inline edit → webview (called from activate). */
  public wireInlineEditBridge(): void {
    this.inlineEditController.setHandler(async (request: InlineEditRequest) => {
      await this.focusChatView();
      void this.postMessage(this.inlineEditController.toChatPayload(request));
    });
  }

  /** For activate registration. */
  public getInlineEditController(): InlineEditController {
    return this.inlineEditController;
  }

  public openPlanCreate(): void {
    void this.focusChatView();
  }

  /** EXT-003 — read `plan_*.md` from the editor and start Build in the webview. */
  public async buildPlanFromEditor(uri?: vscode.Uri): Promise<void> {
    const payload = await readPlanFromEditor(uri);
    if (!payload) {
      void vscode.window.showWarningMessage(
        'Agent K: open a plan_*.md file under `.agentk/plans`, then run Build.',
      );
      return;
    }
    await this.focusChatView();
    void this.postMessage({
      type: 'plan.buildFromEditor',
      content: payload.content,
      slug: payload.slug,
      title: payload.title,
      filePath: payload.filePath,
    });
  }

  /** EXT-003 — read `plan_*.md` from the editor and open Review in the webview. */
  public async openPlanReviewFromEditor(uri?: vscode.Uri): Promise<void> {
    const payload = await readPlanFromEditor(uri);
    if (!payload) {
      void vscode.window.showWarningMessage(
        'Agent K: open a plan_*.md file under `.agentk/plans`, then open Review.',
      );
      return;
    }
    await this.focusChatView();
    void this.postMessage({
      type: 'plan.openReviewFromEditor',
      content: payload.content,
      slug: payload.slug,
      title: payload.title,
      filePath: payload.filePath,
    });
  }

  public openDebug(): void {
    void this.focusChatView();
    // v3.0 adaptation: Debug mode exists as a first-class mode — switch to it.
    void this.postMessage({ type: 'mode.switch', mode: 'debug' });
  }

  /** REVIEW-002 — run diff review (+ optional LM pass) and seed FindingList. */
  public openReview(): void {
    void this.focusChatView();
    void runReviewAndOpenPanel((message) => {
      void this.postMessage(message);
    });
  }

  /** BROWSER-004 — open the BrowserPreview panel (session source pending Playwright). */
  public openBrowserSession(): void {
    void this.focusChatView();
    void this.postMessage({ type: 'ui.browser.open' });
  }

  /** ART-002/003 — open the Artifacts gallery panel. */
  public openArtifacts(): void {
    void this.focusChatView();
    void this.postMessage({ type: 'ui.artifacts.open' });
  }

  public mcpReload(): void {
    void reloadMcpFromSettings()
      .then((status) => {
        const summary =
          status.map((s) => `${s.name}:${s.status}`).join(', ') || '(none)';
        void vscode.window.showInformationMessage(`MCP reload: ${summary}`);
      })
      .catch((err) => {
        void vscode.window.showErrorMessage(
          `MCP reload failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  public mcpConnect(): void {
    void connectMcpServer();
  }

  public mcpDisconnect(): void {
    void disconnectMcp();
  }

  /**
   * BON-001~005 — Best-of-N fan-out over managed worktrees.
   * Trial runner is the domain placeholder (stages the task file); the
   * AgentLoop-backed runner is a follow-up. Worktrees are cleaned up after
   * the run so the command never leaves stray candidates behind.
   */
  public async runBestOfN(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      void vscode.window.showWarningMessage(
        '[Agent K] Open a workspace folder first.',
      );
      return;
    }
    const task = await vscode.window.showInputBox({
      prompt: 'Best-of-N task',
      placeHolder: 'Describe the task to stage in parallel worktrees',
    });
    if (!task?.trim()) return;
    const cfg = vscode.workspace.getConfiguration('agent-k');
    const model = String(cfg.get('provider.model') || 'gpt-4o-mini');
    const manager = new WorktreeManager(root);
    const bon = new BestOfN(manager);
    try {
      const trials = await bon.run({
        n: 2,
        models: [model],
        prompts: [task.trim()],
        task: task.trim(),
      });
      const summary =
        trials.map((t) => `${t.id}:${t.status}`).join(', ') || '(none)';
      void vscode.window.showInformationMessage(
        `Agent K Best-of-N: ${summary} (trial runner placeholder — BON AgentLoop wiring pending)`,
      );
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Best-of-N failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      await bon.cleanup().catch(() => {
        /* best-effort cleanup */
      });
    }
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
