import * as vscode from 'vscode';
import * as path from 'path';
import { registerReadTools } from './tools/readTools';
import { registerEditTools } from './tools/editTools';
import { registerC5C7Tools } from './tools/c5c7Tools';
import { bootstrapMcpFromSettings, registerMcpToolsInRegistry } from './mcp/bootstrapMcp';
import { RuntimeServices } from './core/RuntimeServices';
import { PlanStorage } from './plan/PlanStorage';
import {
  PlanCodeLensProvider,
  updatePlanDocumentContext
} from './plan/PlanCodeLensProvider';
import { DebugStorage } from './debug/DebugStorage';
import { MemoryStore } from './memories/MemoryStore';
import { PermissionGate } from './permission/PermissionGate';
import { CheckpointManager } from './checkpoint/CheckpointManager';
import { SessionManager } from './session/SessionManager';
import { getSkillRegistry } from './skills/SkillRegistry';
import { configManager } from './core/ConfigManager';
import { WorktreeManager } from './worktree/WorktreeManager';
import { BestOfN, type BoNTrial } from './worktree/BestOfN';
import { AdoptWinner } from './worktree/AdoptWinner';
import { ChatViewProvider } from './host/ChatViewProvider';
import { bindAgentKConfigBridge, bindProjectConfig } from './host/configBridge';
import { InlineEditController } from './inline/InlineEditController';
import {
  debugLogServer,
  mcpClient,
  sessionUsageTracker,
  setUsageStatusBarItem,
  updateUsageStatusBar,
  usageStatusBarItem,
} from './host/runtimeSingletons';

export { ChatViewProvider };

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Agent K');
  outputChannel.appendLine('[Agent K] Extension activating…');

  // ─── CRITICAL: register WebviewViewProvider FIRST ─────────
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

  setTimeout(() => {
    void vscode.commands.executeCommand('workbench.view.extension.agent-k');
  }, 100);

  try {
    setUsageStatusBarItem(vscode.window.createStatusBarItem(
      'agent-k.usage',
      vscode.StatusBarAlignment.Right,
      100
    ));
    if (usageStatusBarItem) context.subscriptions.push(usageStatusBarItem);
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
    if (workspaceRoot) checkpointManager.setPersistRoot(workspaceRoot);
    RuntimeServices.setCheckpointManager(checkpointManager);

    RuntimeServices.setSessionManager(new SessionManager(context.workspaceState));
    const permissionGate = new PermissionGate(
      configManager.get('agent-k.permission.level') || 'accept_edits'
    );
    const denyGlobs: string[] = configManager.get('agent-k.permission.denyGlobs') || [
      '**/.env*', '**/secrets/**', '**/id_rsa*', '**/*.pem', '**/.git/**', '**/node_modules/**',
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

    const inlineEdit = new InlineEditController();
    context.subscriptions.push(inlineEdit.register(context));
    inlineEdit.setHandler(async (request) => {
      const payload = inlineEdit.toChatPayload(request);
      await provider.requestInlineEdit(payload);
      outputChannel.appendLine(`[Agent K] Inline Edit request: ${payload.requestId}`);
    });
    context.subscriptions.push({ dispose: () => inlineEdit.dispose() });

    context.subscriptions.push(
      vscode.commands.registerCommand('agent-k.chat.new', () => provider.newSession()),
      vscode.commands.registerCommand('agent-k.openSettings', () => provider.openSettings('models')),
      vscode.commands.registerCommand('agent-k.openProjectConfig', () => provider.openProjectConfig()),
      vscode.commands.registerCommand('agent-k.provider.add', () => provider.openSettings('models')),
      vscode.commands.registerCommand('agent-k.mode.switch', () => provider.switchMode()),
      vscode.commands.registerCommand('agent-k.chat.focusInput', () => provider.focusInput()),
      vscode.commands.registerCommand('agent-k.chat.attachSelection', () => provider.attachEditorSelection()),
      vscode.commands.registerCommand('agent-k.plan.open', () => {
        vscode.window.showInformationMessage('[Agent K] Plan mode: create a new plan');
        provider.switchMode();
      }),
      vscode.commands.registerCommand('agent-k.plan.build', (uri?: vscode.Uri) => void provider.buildPlanFromEditor(uri)),
      vscode.commands.registerCommand('agent-k.plan.openReview', (uri?: vscode.Uri) => void provider.openPlanReviewFromEditor(uri)),
      vscode.commands.registerCommand('agent-k.debug.open', () => {
        vscode.window.showInformationMessage('[Agent K] Debug mode: start debugging session');
        provider.switchMode();
      }),
      vscode.commands.registerCommand('agent-k.review.open', () => provider.openReview()),
      vscode.commands.registerCommand('agent-k.browser.open', () => provider.openDesignMode()),
      vscode.commands.registerCommand('agent-k.artifacts.open', () => provider.openArtifacts()),
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
        vscode.window.showInformationMessage(lines.length ? `[Agent K] MCP reload: ${lines.join(' | ')}` : '[Agent K] MCP: no servers');
      }),
      vscode.commands.registerCommand('agent-k.bestOfN.run', async () => {
        const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!repoRoot) {
          void vscode.window.showWarningMessage('Agent K: Best-of-N requires an open workspace folder.');
          return;
        }
        const task = await vscode.window.showInputBox({
          prompt: 'Best-of-N: describe the task to run in parallel worktrees',
          placeHolder: 'e.g. Add input validation to the signup form'
        });
        if (!task?.trim()) return;
        const nPick = await vscode.window.showQuickPick(['2', '3', '4'], { placeHolder: 'Number of parallel trials (N)' });
        if (!nPick) return;
        const n = Number(nPick) || 2;
        const cfg = vscode.workspace.getConfiguration('agent-k');
        const model = String(cfg.get('provider.model') || 'default-model');
        const manager = new WorktreeManager(repoRoot);
        const bestOfN = new BestOfN(manager);
        let trials: BoNTrial[] = [];
        try {
          await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Agent K: Running Best-of-${n}…`, cancellable: false }, async () => {
            trials = await bestOfN.run({ n, models: Array(n).fill(model), prompts: Array(n).fill(task), task });
          });
        } catch (err) {
          void vscode.window.showErrorMessage(`[Agent K] Best-of-N failed: ${err}`);
          await bestOfN.cleanup().catch(() => {});
          return;
        }
        if (!trials.length) {
          void vscode.window.showWarningMessage('[Agent K] Best-of-N produced no trials (worktree creation may have failed).');
          return;
        }
        const items = trials.map((t) => ({
          label: `${t.id} — ${t.status}`,
          description: `${t.model} · ${t.duration != null ? `${(t.duration / 1000).toFixed(1)}s` : 'n/a'}`,
          detail: (t.output || t.error || '').slice(0, 200),
          trial: t
        }));
        const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a trial to adopt into this workspace (Esc cancels and cleans up all worktrees)' });
        if (!picked) {
          await bestOfN.cleanup().catch(() => {});
          void vscode.window.showInformationMessage('[Agent K] Best-of-N cancelled — worktrees cleaned up.');
          return;
        }
        const adopter = new AdoptWinner(manager, repoRoot);
        try {
          const result = await adopter.adopt(picked.trial);
          if (result.success) {
            await Promise.all(trials.filter((t) => t.id !== picked.trial.id).map((t) => manager.remove(t.worktree.path).catch(() => {})));
            void vscode.window.showInformationMessage(`[Agent K] Adopted ${picked.trial.id} (${result.filesChanged} file(s) changed).`);
          } else {
            void vscode.window.showErrorMessage(`[Agent K] Adopt failed: ${result.error || 'unknown error'}`);
            await bestOfN.cleanup().catch(() => {});
          }
        } catch (err) {
          void vscode.window.showErrorMessage(`[Agent K] Adopt failed: ${err}`);
          await bestOfN.cleanup().catch(() => {});
        }
      })
    );

    outputChannel.appendLine('[Agent K] Commands registered');
    void bootstrapMcpFromSettings(mcpClient, (m) => outputChannel.appendLine(m)).then((lines) => {
      if (lines.length) outputChannel.appendLine(`[Agent K] MCP bootstrap done: ${lines.length} result(s)`);
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
