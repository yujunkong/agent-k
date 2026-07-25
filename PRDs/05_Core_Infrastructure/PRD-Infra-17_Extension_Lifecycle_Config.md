# PRD-Infra-17: Extension Lifecycle & Configuration (확장 생명주기 & 설정)

> **Category**: Core Infrastructure  
> **Priority**: P0  
> **Phase**: C0 (Chat UI) — VS Code Extension 진입점  
> **관련 PRD**: `PRD-C0_Chat_UI_Streaming.md`, `PRD-Infra-01_Instructions_Rules.md`, `PRD-21_Secrets_Config_Vault.md`, `PRD-29_Settings_Hub.md`

---

## 1. Overview

### 목적
VS Code Extension의 **생명주기 관리**, **설정 시스템**, **상태 영속성**, **명령어 등록**을 담당하는 기반 인프라.

### 범위
- Extension Activation / Deactivation
- Configuration Schema (package.json contributes.configuration)
- Global / Workspace / Folder 설정 계층
- Secret Storage (VS Code SecretStorage API)
- Command Registration & Keybindings
- Webview Panel Lifecycle (Sidebar Chat, Inline Diff, etc.)
- Extension Context 관리 (글로벌 상태, 워크스페이스 상태)

---

## 2. Extension Entry Point

### 2.1 활성화 이벤트 (package.json)

```json
{
  "activationEvents": [
    "onStartupFinished",           // VS Code 시작 후 바로 활성화 (사이드바 준비)
    "onView:agent-k.chat",         // 사이드바 뷰 열릴 때
    "onCommand:agent-k.startChat", // 명령어 호출 시
    "onLanguage:typescript",       // TS/JS 파일 열릴 때 (인라인 완성)
    "onLanguage:python",
    "workspaceContains:.agent-k"   // 프로젝트에 .agent-k 폴더 있을 때
  ],
  "main": "./dist/extension.js"
}
```

### 2.2 메인 진입점 (`src/extension.ts`)

```typescript
import * as vscode from 'vscode';
import { AgentKExtension } from './core/AgentKExtension';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const extension = new AgentKExtension(context);
  await extension.activate();
  
  // 전역 에러 핸들러
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('agent-k')) {
        extension.onConfigurationChanged(e);
      }
    })
  );
}

export function deactivate(): void {
  // AgentKExtension.deactivate()에서 정리
}
```

---

## 3. Core Extension Class

```typescript
// src/core/AgentKExtension.ts
export class AgentKExtension {
  private chatProvider: ChatViewProvider;
  private inlineProvider: InlineCompletionProvider;
  private diffProvider: DiffViewProvider;
  private config: AgentKConfig;
  private secrets: SecretStorage;
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {}

  async activate(): Promise<void> {
    // 1. 설정 로드
    this.config = await this.loadConfiguration();
    
    // 2. 시크릿 스토리지 초기화
    this.secrets = new SecretStorage(this.context.secrets);
    
    // 3. 상태 마이그레이션 (버전 업그레이드 시)
    await this.migrateState();
    
    // 4. 프로바이더 등록
    this.registerProviders();
    
    // 5. 명령어 등록
    this.registerCommands();
    
    // 6. 웹뷰 패널 관리자
    this.registerWebviewPanels();
    
    // 7. 백그라운드 서비스 시작
    await this.startBackgroundServices();
    
    // 8. 상태 바 아이템
    this.createStatusBar();
  }

  private async loadConfiguration(): Promise<AgentKConfig> {
    const config = vscode.workspace.getConfiguration('agent-k');
    return {
      modelTier: config.get<'A' | 'B' | 'C'>('modelTier', 'A'),
      localModelPath: config.get<string>('localModelPath', ''),
      apiKeys: await this.secrets.getAllApiKeys(),
      autoApprove: config.get<string[]>('autoApproveTools', []),
      maxTurns: config.get<number>('maxTurns', 20),
      tokenBudget: config.get<number>('tokenBudget', 128000),
      telemetryEnabled: config.get<boolean>('telemetry.enabled', true),
      // ... 기타 설정
    };
  }

  private registerProviders(): void {
    // 사이드바 채팅 뷰
    this.chatProvider = new ChatViewProvider(this.context, this.config);
    this.disposables.push(
      vscode.window.registerWebviewViewProvider('agent-k.chat', this.chatProvider)
    );

    // 인라인 완성
    this.inlineProvider = new InlineCompletionProvider(this.config);
    this.disposables.push(
      vscode.languages.registerInlineCompletionItemProvider(
        [{ pattern: '**/*' }], this.inlineProvider
      )
    );

    // 디퓨 뷰 (Selection Diff Apply)
    this.diffProvider = new DiffViewProvider(this.context);
    this.disposables.push(
      vscode.window.registerCustomEditorProvider(
        'agent-k.diffView', this.diffProvider, { supportsMultipleEditors: true }
      )
    );
  }

  private registerCommands(): void {
    const commands = [
      { id: 'agent-k.startChat', handler: () => this.chatProvider.show() },
      { id: 'agent-k.newSession', handler: () => this.chatProvider.newSession() },
      { id: 'agent-k.openSettings', handler: () => vscode.commands.executeCommand('workbench.action.openSettings', 'agent-k') },
      { id: 'agent-k.clearHistory', handler: () => this.chatProvider.clearHistory() },
      { id: 'agent-k.toggleAutoApprove', handler: () => this.toggleAutoApprove() },
      { id: 'agent-k.showTelemetry', handler: () => this.showTelemetryPanel() },
      { id: 'agent-k.exportSession', handler: () => this.chatProvider.exportSession() },
      { id: 'agent-k.importSession', handler: () => this.chatProvider.importSession() },
    ];

    for (const cmd of commands) {
      this.disposables.push(
        vscode.commands.registerCommand(cmd.id, cmd.handler)
      );
    }
  }

  private registerWebviewPanels(): void {
    // 플랜 모드 패널, 디버그 패널, 설정 패널 등
    this.disposables.push(
      vscode.window.registerWebviewPanelSerializer('agent-k.plan', {
        async deserializeWebviewPanel(panel, state) {
          new PlanPanel(panel, state);
        }
      })
    );
  }

  async deactivate(): Promise<void> {
    // 백그라운드 서비스 정지
    await this.stopBackgroundServices();
    
    // 모든 disposable 정리
    for (const d of this.disposables) {
      d.dispose();
    }
    
    // 상태 저장
    await this.saveState();
  }
}
```

---

## 4. Configuration Schema

### 4.1 package.json contributes.configuration

```json
{
  "configuration": {
    "title": "Agent-K",
    "properties": {
      "agent-k.modelTier": {
        "type": "string",
        "enum": ["A", "B", "C"],
        "default": "A",
        "description": "Model tier: A=Flash (harness), B=Pro (full tools), C=Base (chat only)"
      },
      "agent-k.localModelPath": {
        "type": "string",
        "default": "",
        "description": "Path to local GGUF model for Tier C/Base"
      },
      "agent-k.maxTurns": {
        "type": "integer",
        "default": 20,
        "minimum": 1,
        "maximum": 100,
        "description": "Maximum turns per agent session"
      },
      "agent-k.tokenBudget": {
        "type": "integer",
        "default": 128000,
        "minimum": 32768,
        "maximum": 1000000,
        "description": "Token budget for context window"
      },
      "agent-k.permissionMode": {
        "type": "string",
        "enum": ["ask", "accept_edits", "auto", "bypass"],
        "default": "accept_edits",
        "description": "Permission level (Spec-05). Session Always stays in memory; permanent Always uses this + allowlists."
      },
      "agent-k.queue.onEnterWhileRunning": {
        "type": "string",
        "enum": ["resynthesize", "queue_only"],
        "default": "resynthesize",
        "description": "Cursor-like: Enter while running interrupts and resynthesizes. queue_only = soft enqueue only."
      },
      "agent-k.queue.onStop": {
        "type": "string",
        "enum": ["keep", "discard"],
        "default": "keep",
        "description": "What to do with message queue when user hits Stop"
      },
      "agent-k.queue.resynthesizeDebounceMs": {
        "type": "integer",
        "default": 300,
        "minimum": 0,
        "maximum": 2000,
        "description": "Debounce for Interrupt & Resynthesize to prevent Enter spam"
      },
      "agent-k.harness.verificationMicroLoop": {
        "type": "boolean",
        "default": true,
        "description": "After edit_file, auto read_lints (± allowlist test)"
      },
      "agent-k.harness.aTierOptionalSearch": {
        "type": "boolean",
        "default": false,
        "description": "Tier A: include codebase_search / lsp_* in tool schemas (C4+)"
      },
      "agent-k.context.readMaxLines": {
        "type": "integer",
        "default": 250,
        "minimum": 50,
        "maximum": 2000,
        "description": "Default read_file limit (Spec-03)"
      },
      "agent-k.maxTurns.A": {
        "type": "integer",
        "default": 15,
        "minimum": 1,
        "maximum": 100,
        "description": "maxTurns for Tier A (Flash)"
      },
      "agent-k.maxTurns.B": {
        "type": "integer",
        "default": 25,
        "minimum": 1,
        "maximum": 100,
        "description": "maxTurns for Tier B (Pro)"
      },
      "agent-k.autoApproveTools": {
        "type": "array",
        "items": { "type": "string" },
        "default": ["read_file", "grep", "glob", "list_dir"],
        "description": "Tools that run without confirmation"
      },
      "agent-k.enablePrefetch": {
        "type": "boolean",
        "default": true,
        "description": "Enable predictive prefetching"
      },
      "agent-k.enableCompaction": {
        "type": "boolean",
        "default": true,
        "description": "Enable context compaction for long sessions"
      },
      "agent-k.telemetry.enabled": {
        "type": "boolean",
        "default": true,
        "description": "Enable anonymous telemetry"
      },
      "agent-k.telemetry.endpoint": {
        "type": "string",
        "default": "",
        "description": "Custom OTLP endpoint (optional)"
      },
      "agent-k.rules.files": {
        "type": "array",
        "items": { "type": "string" },
        "default": [".agent-k/rules/*.md", ".cursor/rules/*.mdc"],
        "description": "Rule file glob patterns"
      }
    }
  }
}
```

### 4.2 설정 변경 감지

```typescript
// src/core/ConfigManager.ts
export class ConfigManager {
  private config: AgentKConfig;
  private listeners: Set<(config: AgentKConfig) => void> = new Set();

  constructor(private context: vscode.ExtensionContext) {
    this.config = this.loadConfig();
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('agent-k')) {
        this.config = this.loadConfig();
        this.notifyListeners();
      }
    });
  }

  getConfig(): AgentKConfig { return this.config; }
  
  onConfigChange(listener: (config: AgentKConfig) => void): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.config);
    }
  }
}
```

---

## 5. Secret Storage

```typescript
// src/core/SecretStorage.ts
export class SecretStorage {
  constructor(private secrets: vscode.SecretStorage) {}

  // API 키 저장
  async setApiKey(provider: string, key: string): Promise<void> {
    await this.secrets.store(`agent-k.apikey.${provider}`, key);
  }

  async getApiKey(provider: string): Promise<string | undefined> {
    return this.secrets.get(`agent-k.apikey.${provider}`);
  }

  async deleteApiKey(provider: string): Promise<void> {
    await this.secrets.delete(`agent-k.apikey.${provider}`);
  }

  async getAllApiKeys(): Promise<Record<string, string>> {
    // SecretStorage는 열거 불가 → 알려진 프로바이더만 조회
    const providers = ['openai', 'anthropic', 'google', 'openrouter', 'local'];
    const result: Record<string, string> = {};
    for (const p of providers) {
      const key = await this.getApiKey(p);
      if (key) result[p] = key;
    }
    return result;
  }

  // 사용자 설정 토큰 (예: GitHub PAT)
  async setUserToken(service: string, token: string): Promise<void> {
    await this.secrets.store(`agent-k.token.${service}`, token);
  }
}
```

---

## 6. State Persistence

### 6.1 Global State (Extension Context)

```typescript
// src/core/StateManager.ts
export class StateManager {
  constructor(private context: vscode.ExtensionContext) {}

  // 세션 히스토리 (최근 50개)
  getSessions(): ChatSession[] {
    return this.context.globalState.get<ChatSession[]>('agent-k.sessions', []);
  }

  saveSessions(sessions: ChatSession[]): void {
    this.context.globalState.update('agent-k.sessions', sessions.slice(-50));
  }

  // 현재 활성 세션
  getActiveSession(): ChatSession | undefined {
    const id = this.context.globalState.get<string>('agent-k.activeSession');
    if (!id) return undefined;
    return this.getSessions().find(s => s.id === id);
  }

  setActiveSession(id: string): void {
    this.context.globalState.update('agent-k.activeSession', id);
  }

  // 사용자 메모리 (PRD-Harness-04)
  getMemories(): UserMemory[] {
    return this.context.globalState.get<UserMemory[]>('agent-k.memories', []);
  }

  saveMemories(memories: UserMemory[]): void {
    this.context.globalState.update('agent-k.memories', memories);
  }

  // 아티팩트 (PRD-16)
  getArtifacts(): Artifact[] {
    return this.context.globalState.get<Artifact[]>('agent-k.artifacts', []);
  }
}
```

### 6.2 Workspace State (프로젝트별)

```typescript
// 워크스페이스별: 인덱스 상태, 프로젝트 규칙, 메모리
export class WorkspaceStateManager {
  constructor(private context: vscode.ExtensionContext) {}

  getIndexStatus(): IndexStatus {
    return this.context.workspaceState.get<IndexStatus>('agent-k.indexStatus', { 
      status: 'idle', 
      fileCount: 0,
      lastIndexed: 0 
    });
  }

  setIndexStatus(status: IndexStatus): void {
    this.context.workspaceState.update('agent-k.indexStatus', status);
  }

  getProjectRules(): ProjectRule[] {
    return this.context.workspaceState.get<ProjectRule[]>('agent-k.projectRules', []);
  }
}
```

---

## 7. Webview Management

### 7.1 패널 생명주기

```typescript
// src/webview/WebviewManager.ts
export class WebviewManager {
  private panels = new Map<string, vscode.WebviewPanel>();

  createOrShow(
    viewType: string,
    title: string,
    column: vscode.ViewColumn,
    getHtml: (webview: vscode.Webview) => string
  ): vscode.WebviewPanel {
    const existing = this.panels.get(viewType);
    if (existing) {
      existing.reveal(column);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      viewType, title, column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.getExtensionUri()]
      }
    );

    panel.webview.html = getHtml(panel.webview);
    panel.onDidDispose(() => this.panels.delete(viewType), null, this.disposables);
    
    this.panels.set(viewType, panel);
    return panel;
  }

  postMessage(viewType: string, message: any): void {
    this.panels.get(viewType)?.webview.postMessage(message);
  }
}
```

### 7.2 메시지 버스 (Extension ↔ Webview)

```typescript
// src/webview/MessageBus.ts
export interface ExtensionMessage {
  type: 'chat' | 'tool' | 'config' | 'state' | 'telemetry';
  payload: any;
  requestId?: string;
}

export class MessageBus {
  private handlers = new Map<string, (msg: ExtensionMessage) => Promise<any>>();
  private pendingRequests = new Map<string, { resolve: Function; reject: Function }>();

  constructor(private webview: vscode.Webview) {
    webview.onDidReceiveMessage(this.onMessage.bind(this));
  }

  registerHandler(type: string, handler: (msg: ExtensionMessage) => Promise<any>): void {
    this.handlers.set(type, handler);
  }

  send(type: string, payload: any): void {
    this.webview.postMessage({ type, payload });
  }

  sendRequest(type: string, payload: any): Promise<any> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      this.webview.postMessage({ type, payload, requestId });
      
      // 30초 타임아웃
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  private async onMessage(msg: ExtensionMessage): Promise<void> {
    if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
      const { resolve } = this.pendingRequests.get(msg.requestId)!;
      this.pendingRequests.delete(msg.requestId);
      resolve(msg.payload);
      return;
    }

    const handler = this.handlers.get(msg.type);
    if (handler) {
      try {
        await handler(msg);
      } catch (e) {
        console.error(`Handler error for ${msg.type}:`, e);
      }
    }
  }
}
```

---

## 8. Status Bar & Notifications

```typescript
// src/ui/StatusBar.ts
export class StatusBarManager {
  private statusItem: vscode.StatusBarItem;
  private currentModel: string = 'A';

  constructor() {
    this.statusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right, 100
    );
    this.statusItem.command = 'agent-k.openSettings';
    this.updateDisplay();
    this.statusItem.show();
  }

  setModelTier(tier: 'A' | 'B' | 'C'): void {
    this.currentModel = tier;
    this.updateDisplay();
  }

  setSessionActive(active: boolean, turnCount?: number): void {
    this.statusItem.text = active 
      ? `$(sparkle) Agent-K: Tier ${this.currentModel} • Turn ${turnCount || 0}`
      : `$(sparkle) Agent-K: Tier ${this.currentModel}`;
    this.statusItem.tooltip = active 
      ? 'Active session - Click for settings' 
      : 'No active session - Click to start';
  }

  showProgress(message: string): vscode.Progress<{ increment?: number }> {
    return vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: message,
      cancellable: true
    }, (progress, token) => {
      // 토큰으로 취소 처리
      return new Promise(resolve => {
        token.onCancellationRequested(() => resolve());
      });
    });
  }
}
```

---

## 9. Acceptance Criteria

```gherkin
Feature: Extension Lifecycle & Configuration

  Scenario: Extension activates on startup
    Given VS Code starts with Agent-K installed
    When activationEvents include "onStartupFinished"
    Then extension activates within 2 seconds
    And chat view provider registered
    And inline completion provider registered

  Scenario: Configuration loads with defaults
    Given no user settings configured
    When extension activates
    Then modelTier = "A"
    And maxTurns = 20
    And tokenBudget = 128000
    And autoApproveTools = ["read_file", "grep", "glob", "list_dir"]

  Scenario: User changes model tier
    Given user sets "agent-k.modelTier" = "B"
    When setting changed
    Then ConfigManager notifies all listeners
    And active sessions use new tier for next turn

  Scenario: API keys stored securely
    Given user enters OpenAI API key in settings
    When save clicked
    Then key stored in VS Code SecretStorage
    And not written to globalState or workspaceState
    And retrieved correctly on restart

  Scenario: Session persistence across restarts
    Given user has 3-turn conversation
    When VS Code restarts
    Then session restored in chat view
    And turn count preserved
    And active session marked

  Scenario: Webview message roundtrip
    Given chat webview open
    When webview posts "chat.send" message
    Then extension receives and processes
    And response sent back to webview
    And request/response correlation via requestId works

  Scenario: Extension deactivates cleanly
    When VS Code shuts down or extension disabled
    Then deactivate() called
    And all disposables disposed
    And background services stopped
    And state saved
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 10. References

- `PRD-C0_Chat_UI_Streaming.md` — 채팅 UI 웹뷰 구현
- `PRD-Infra-01_Instructions_Rules.md` — 규칙 파일 로딩 (워크스페이스 상태)
- `PRD-21_Secrets_Config_Vault.md` — 시크릿 관리 상세
- VS Code Extension API: `vscode.ExtensionContext`, `SecretStorage`, `WebviewViewProvider`