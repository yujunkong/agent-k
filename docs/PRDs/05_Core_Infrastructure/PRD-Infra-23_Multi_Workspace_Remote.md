# PRD-Infra-23: Multi-Workspace & Remote Development (멀티 워크스페이스 & 원격 개발)

> **Category**: Core Infrastructure  
> **Priority**: P1  
> **Phase**: C5 (Plan Mode) → C7 (Production)  
> **관련 PRD**: `PRD-13_Worktree_BestOfN.md`, `PRD-18_PR_Issue_Agent.md`, `PRD-22_DGX_vLLM_Provider.md`, `PRD-Infra-17_Extension_Lifecycle_Config.md`

---

## 1. Overview

### 목적
**단일 VS Code 윈도우에서 다중 워크스페이스/리모트 환경 동시 관리**. 다음 시나리오 지원:
- **Monorepo + Microservices**: 여러 서비스 동시 개발
- **Worktree 병렬 실행**: Best-of-N(PRD-13)을 위한 격리된 git worktree
- **Remote SSH/DevContainer/WSL**: 원격 머신에서 에이전트 실행
- **DGX/vLLM 클러스터**: GPU 리소스가 원격에 있는 경우 (PRD-22)

---

## 2. Architecture

### 2.1 워크스페이스 컨텍스트 모델

```typescript
// src/workspace/WorkspaceContext.ts

export interface WorkspaceContext {
  id: string;                          // 고유 ID
  name: string;                        // 표시 이름
  type: 'local' | 'ssh' | 'devcontainer' | 'wsl' | 'tunnel';
  
  // 연결 정보
  uri: vscode.Uri;                     // vscode-remote://ssh-remote+host/path
  fsPath: string;                      // 로컬 경로 또는 마운트 경로
  
  // 상태
  connected: boolean;
  capabilities: WorkspaceCapabilities;
  
  // 에이전트 상태
  activeSessions: ChatSession[];       // 이 워크스페이스에서 활성 세션
  indexStatus: IndexStatus;            // 코드 인덱스 상태
  
  // 설정
  config: WorkspaceConfig;
}

export interface WorkspaceCapabilities {
  fileSystem: boolean;                 // 파일 읽기/쓰기
  terminal: boolean;                   // 터미널 실행
  languageServer: boolean;             // LSP 사용 가능
  debugging: boolean;                  // 디버거 연결
  git: boolean;                        // Git 연동
  docker: boolean;                     // Docker 사용 가능
  gpu: boolean;                        // GPU 접근 (DGX/vLLM)
}

export interface WorkspaceConfig {
  // 에이전트 설정 (워크스페이스별 오버라이드)
  modelTier?: 'A' | 'B' | 'C';
  maxTurns?: number;
  autoApproveTools?: string[];
  tokenBudget?: number;
  
  // 인덱싱
  indexingEnabled: boolean;
  indexExcludePatterns: string[];
  
  // 원격 실행
  remoteAgentMode?: 'proxy' | 'full';  // proxy: 로컬에서 원격 호출, full: 원격에 에이전트 배포
}
```

### 2.2 멀티 워크스페이스 매니저

```typescript
// src/workspace/MultiWorkspaceManager.ts

export class MultiWorkspaceManager {
  private contexts = new Map<string, WorkspaceContext>();
  private activeContextId: string | null = null;
  
  // 워크스페이스 추가/제거
  async addWorkspace(folder: vscode.WorkspaceFolder): Promise<WorkspaceContext>;
  async removeWorkspace(contextId: string): Promise<void>;
  
  // 활성 워크스페이스 전환
  setActiveWorkspace(contextId: string): void;
  getActiveWorkspace(): WorkspaceContext | null;
  
  // 전체 워크스페이스 대상 작업
  async broadcastToAll<T>(fn: (ctx: WorkspaceContext) => Promise<T>): Promise<Map<string, T>>;
  async executeOnWorkspace(contextId: string, fn: (ctx: WorkspaceContext) => Promise<void>): Promise<void>;
  
  // Worktree 관리 (PRD-13 연동)
  async createWorktree(baseContextId: string, branchName: string, purpose: string): Promise<WorkspaceContext>;
  async listWorktrees(contextId: string): Promise<WorktreeInfo[]>;
  async removeWorktree(contextId: string, worktreePath: string): Promise<void>;
}
```

---

## 3. Remote Agent Architecture

### 3.1 실행 모드

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOCAL VS CODE WINDOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │ Workspace A     │    │ Workspace B     │                     │
│  │ (Local)         │    │ (SSH Remote)    │                     │
│  │                 │    │                 │                     │
│  │ Agent Loop      │    │ Agent Proxy     │──────┐              │
│  │ (Local LLM)     │    │ (Local)         │      │              │
│  └────────┬────────┘    └────────┬────────┘      │              │
│           │                      │               │              │
│           │         ┌────────────┴────────┐      │              │
│           │         │   CONNECTION      │      │              │
│           │         │   MANAGER         │      │              │
│           │         │   (SSH/Tunnel)    │      │              │
│           │         └────────┬──────────┘      │              │
│           │                  │                │              │
│           ▼                  ▼                ▼              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              REMOTE HOST (DGX/vLLM Server)              │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │ │
│  │  │ Agent Runtime │  │ Model Server │  │ Workspace   │      │ │
│  │  │ (Full Agent)  │  │ (vLLM/TGI)   │  │ (Cloned)    │      │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 원격 실행 모드 비교

| 모드 | 설명 | 장점 | 단점 | 용도 |
|------|------|------|------|------|
| **Proxy** | 로컬 에이전트가 원격 도구 호출 | 간단, 로컬 모델 사용 | 네트워크 지연, 대역폭 | 단순 원격 개발 |
| **Full** | 원격에 에이전트 런타임 배포 | 로컬 모델/툴 사용, 저지연 | 배포 복잡, 리소스 필요 | DGX 클러스터, 대용량 |

### 3.3 원격 에이전트 배포 (Full Mode)

```typescript
// src/remote/RemoteAgentDeployer.ts

export class RemoteAgentDeployer {
  async deploy(context: WorkspaceContext): Promise<RemoteAgentHandle> {
    // 1. 원격 환경 확인
    const env = await this.checkRemoteEnvironment(context);
    
    // 2. 에이전트 런타임 패키징
    const package = await this.packageAgentRuntime({
      modelTier: context.config.modelTier,
      tools: this.getAllowedTools(context),
      config: context.config
    });
    
    // 3. 원격 전송 및 실행 (SSH/Docker)
    const handle = await this.startRemoteAgent(context, package);
    
    // 4. 헬스 체크
    await this.waitForHealthy(handle);
    
    return handle;
  }

  private async packageAgentRuntime(options: PackageOptions): Promise<Buffer> {
    // TypeScript 컴파일 → 단일 번들 (esbuild)
    // 의존성 포함 (node_modules 압축)
    // 설정 파일 포함
    // 실행 스크립트 생성
  }
}
```

---

## 4. Worktree Integration (PRD-13)

### 4.1 Worktree Lifecycle

```typescript
// src/workspace/WorktreeManager.ts

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  purpose: 'feature' | 'fix' | 'experiment' | 'review' | 'best-of-n';
  createdAt: number;
  parentContextId: string;
  agentSessionId?: string;      // 이 워크트리에서 실행 중인 에이전트
  status: 'active' | 'completed' | 'merged' | 'abandoned';
}

export class WorktreeManager {
  async createForBestOfN(
    baseContext: WorkspaceContext, 
    task: string, 
    variants: number
  ): Promise<WorktreeInfo[]> {
    const worktrees: WorktreeInfo[] = [];
    
    for (let i = 0; i < variants; i++) {
      const branchName = `agent-k/best-of-n/${task.slice(0,30)}/v${i+1}-${Date.now()}`;
      const wt = await this.createWorktree(baseContext, branchName, 'best-of-n');
      worktrees.push(wt);
    }
    
    return worktrees;
  }

  async runAgentInWorktree(
    worktree: WorktreeInfo, 
    agentConfig: AgentLoopConfig
  ): Promise<AgentResult> {
    // 1. 워크트리용 새 워크스페이스 컨텍스트 생성
    const ctx = await this.multiWorkspace.addWorkspace({
      uri: vscode.Uri.file(worktree.path),
      name: `Worktree: ${worktree.branch}`
    });
    
    // 2. 에이전트 세션 시작
    const session = await this.agentLoop.startSession(ctx, agentConfig);
    worktree.agentSessionId = session.id;
    
    // 3. 완료 대기
    const result = await session.waitForCompletion();
    
    // 4. 결과 아카이브
    await this.archiveWorktreeResult(worktree, result);
    
    return result;
  }
}
```

---

## 5. UI Integration

### 5.1 워크스페이스 선택기 (Status Bar)

```typescript
// src/ui/WorkspacePicker.ts

export class WorkspacePicker {
  createStatusBarItem(): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    item.command = 'agent-k.selectWorkspace';
    item.tooltip = 'Switch active workspace';
    this.updateDisplay();
    return item;
  }

  private updateDisplay(): void {
    const active = this.manager.getActiveWorkspace();
    const count = this.manager.getAllWorkspaces().length;
    
    this.item.text = `$(repo) ${active?.name || 'No workspace'} ${count > 1 ? `(${count})` : ''}`;
    this.item.show();
  }

  async showPicker(): Promise<void> {
    const workspaces = this.manager.getAllWorkspaces();
    const items = workspaces.map(w => ({
      label: w.name,
      description: `${w.type} • ${w.fsPath}`,
      detail: `Sessions: ${w.activeSessions.length} • Index: ${w.indexStatus.progress}%`,
      picked: w.id === this.manager.getActiveWorkspace()?.id,
      workspace: w
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select active workspace',
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (selected) {
      this.manager.setActiveWorkspace(selected.workspace.id);
    }
  }
}
```

### 5.2 워크트리 뷰 (Side Panel)

```typescript
// src/ui/WorktreeViewProvider.ts

export class WorktreeViewProvider implements vscode.TreeDataProvider<WorktreeTreeItem> {
  getTreeItem(element: WorktreeTreeItem): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element.worktree.branch,
      element.worktree.status === 'active' ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed
    );
    
    item.iconPath = this.getStatusIcon(element.worktree.status);
    item.description = `${element.worktree.purpose} • ${this.formatTime(element.worktree.createdAt)}`;
    item.tooltip = `Path: ${element.worktree.path}\nCommit: ${element.worktree.commit}`;
    
    // 컨텍스트 메뉴
    item.contextValue = 'worktree';
    item.command = {
      command: 'agent-k.openWorktree',
      arguments: [element.worktree.path],
      title: 'Open in New Window'
    };
    
    return item;
  }

  getChildren(element?: WorktreeTreeItem): Thenable<WorktreeTreeItem[]> {
    if (!element) {
      // 루트: 활성 워크스페이스별 그룹
      return this.groupByWorkspace();
    }
    return [];
  }
}
```

---

## 6. Configuration

```json
// package.json contributes.configuration
{
  "agent-k.workspaces": {
    "autoDetectRemotes": true,
    "defaultRemoteMode": "proxy",
    "maxConcurrentWorktrees": 5,
    "worktreeBasePath": ".agent-k/worktrees",
    "archiveCompletedWorktrees": true,
    "archiveRetentionDays": 7
  },
  "agent-k.remote": {
    "ssh": {
      "defaultUser": "",
      "defaultPort": 22,
      "keepAliveInterval": 30000,
      "connectionTimeout": 10000
    },
    "devcontainer": {
      "autoBuild": true,
      "postCreateCommand": "npm install"
    },
    "dgx": {
      "clusterEndpoint": "",
      "namespace": "agent-k",
      "gpuTypes": ["A100", "H100"],
      "defaultModel": "meta-llama/Llama-3.1-70B-Instruct"
    }
  }
}
```

---

## 7. Acceptance Criteria

```gherkin
Feature: Multi-Workspace & Remote Development

  Scenario: Switch between local and remote workspace
    Given VS Code open with local folder and SSH remote
    When user clicks workspace picker in status bar
    And selects remote workspace
    Then active workspace changes
    And agent sessions use remote file system
    And terminal executes on remote host

  Scenario: Create worktree for Best-of-N
    Given agent running Best-of-N with 3 variants
    When worktrees created
    Then 3 isolated git worktrees created
    And each has independent agent session
    And results aggregated for comparison

  Scenario: Full remote agent on DGX
    Given DGX cluster configured
    And user selects "Full Remote" mode
    When agent session starts
    Then agent runtime deployed to DGX
    And model served by vLLM on A100
    And tool execution happens on DGX
    And latency < 100ms for tool calls

  Scenario: Workspace-specific config
    Given workspace A has modelTier=B, workspace C has modelTier=A
    When switching between workspaces
    Then model tier changes automatically
    And tool permissions respect workspace config

  Scenario: Worktree cleanup
    Given completed worktrees older than 7 days
    When archive job runs
    Then worktrees archived to .agent-k/archive
    And git worktree removed
    And disk space reclaimed
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 8. References

- `PRD-13_Worktree_BestOfN.md` — Best-of-N 워크트리 상세
- `PRD-18_PR_Issue_Agent.md` — PR/Issue 에이전트 (멀티 레포)
- `PRD-22_DGX_vLLM_Provider.md` — DGX 원격 모델 서빙
- `PRD-Infra-17_Extension_Lifecycle_Config.md` — 확장 설정 시스템
- VS Code Multi-root Workspace: https://code.visualstudio.com/docs/editor/multi-root-workspaces
- VS Code Remote Development: https://code.visualstudio.com/docs/remote/remote-overview
- Git Worktree: https://git-scm.com/docs/git-worktree