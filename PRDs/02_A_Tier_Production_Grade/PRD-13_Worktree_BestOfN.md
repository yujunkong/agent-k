# PRD-13: Worktree / Best-of-N (Worktree & Best-of-N)

> **Priority**: A급 (격리 병렬 시도 후 비교)  
> **Phase**: C7 (DGX 2대 활용 극대화)  
> **관련 PRD**: `PRD-Tools-F_Orchestration_Extension.md`, `PRD-Harness-12_Routing_Heuristics.md`, `PRD-C4_Infrastructure.md`

---

## 1. Overview

### 목적
`git worktree`로 **격리된 작업 트리**를 생성해, 서로 다른 모델/프롬프트/접근법으로 **병렬 시도** 후 결과를 비교·선택한다. DGX 2대(Flash 여러 개 vs Pro 1개)를 활용해 **Best-of-N** 평가 자동화.

### 비즈니스 가치
- **위험 분산**: 한 모델이 망쳐도 다른 트리에서 성공 가능
- **객관적 비교**: 동일 태스크에 대해 Flash×3 vs Pro×1 결과 diff/테스트 비교
- **자동 선택**: 테스트 통과율, 린트 에러 수, 코드 품질 메트릭으로 베스트 선택

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, "이 리팩터링 3가지 접근으로 시도해보고 테스트 통과하는 걸로 골라줘" 하고 싶다 |
| US-02 | 팀 리더로서, Flash 모델 3개로 병렬 돌리고 Pro 1개로 검증해 비용·품질 균형 맞추고 싶다 |
| US-03 | 개발자로서, worktree별 diff·테스트 리포트를 나란히 보고 하나만 선택 적용하고 싶다 |

---

## 2. Functional Requirements

### 2.1 Worktree 관리
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | Worktree 생성 | `git worktree add ../worktree-<id> <branch>` (새 브랜치 또는 기존) |
| FR-02 | 에이전트 바인딩 | 각 worktree에 전용 AgentLoop 인스턴스 할당 (별도 컨텍스트/파일시스템) |
| FR-03 | 리소스 격리 | 워킹 디렉터리, node_modules, 빌드 산출물 완전 분리 |
| FR-04 | 자동 정리 | 완료 후 `git worktree remove` + 브랜치 삭제 옵션 |
| FR-05 | 동시 실행 제한 | 설정 `maxParallelWorktrees` (기본 3, DGX 2대면 4~6) |

### 2.2 Best-of-N 실행 파이프라인
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-06 | 명령어 | `/best-of-n N=3 [model=flash] [prompt="approach: functional"] <task>` |
| FR-07 | 변수 주입 | 각 worktree에 `{MODEL, PROMPT_VARIANT, SEED}` 환경변수 주입 |
| FR-08 | 동시 실행 | `Promise.all`로 N개 AgentLoop 병렬 실행 (maxTurns 공유) |
| FR-09 | 결과 수집 | 각 트리에서: git diff, 테스트 결과, 린트 에러, 토큰 사용량, 시간 |
| FR-10 | 비교 UI | Webview로 N개 결과 나란히 표시 (Diff, Test, Metrics 탭) |
| FR-11 | 선택 적용 | 사용자 선택 → 해당 worktree 변경사항만 메인 브랜치에 `cherry-pick` 또는 `merge` |
| FR-12 | 나머지 정리 | 미선택 worktree 자동 제거 (옵션: 브랜치 보관) |

### 2.3 라우팅 휴리스틱 연동 (Harness-12)
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-13 | 자동 티어 할당 | 복잡도 높음 → Pro 1개 + Flash N-1개, 단순 → Flash N개 |
| FR-14 | 비용 상한 | 총 예상 토큰 × 모델 단가 > 임계값 시 사용자 확인 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | Worktree 생성 시간 | < 3초 (shallow clone 옵션) |
| NFR-02 | 디스크 사용량 | Worktree당 베이스 리포 크기의 ~1.2배 (공통 .git 공유) |
| NFR-03 | 병렬 실행 격리 | 프로세스/포트 충돌 없음 (포트 자동 할당) |
| NFR-04 | 비교 UI 렌더링 | 10파일 × 3 worktree diff < 2초 |

---

## 4. API & Technical Spec

### 4.1 Worktree Manager (`src/worktree/manager.ts`)

```typescript
export interface WorktreeConfig {
  id: string;
  baseBranch: string;
  model: string;              // 사용할 모델 ID
  promptVariant?: string;     // 프롬프트 변형 태그
  env?: Record<string, string>;
  maxTurns?: number;
}

export class WorktreeManager {
  private worktrees = new Map<string, WorktreeInstance>();
  private readonly baseRepoPath: string;
  private readonly worktreeRoot: string;  // e.g., /tmp/agent-k-worktrees/

  constructor(baseRepoPath: string) {
    this.baseRepoPath = baseRepoPath;
    this.worktreeRoot = path.join(os.tmpdir(), 'agent-k-worktrees', path.basename(baseRepoPath));
    fs.mkdirSync(this.worktreeRoot, { recursive: true });
  }

  async create(config: WorktreeConfig): Promise<WorktreeInstance> {
    const worktreePath = path.join(this.worktreeRoot, config.id);
    const branchName = `agent-k/${config.id}`;

    // 1. worktree 추가 (기존 브랜치면 checkout, 새 브랜치면 생성)
    await this.git('worktree', 'add', '-b', branchName, worktreePath, config.baseBranch);

    // 2. 의존성 설치 (package.json 있으면) - 병렬로
    if (await this.hasPackageJson(worktreePath)) {
      await this.installDeps(worktreePath);
    }

    // 3. AgentLoop 인스턴스 생성 (별도 워킹 디렉토리)
    const loop = new AgentLoop({
      cwd: worktreePath,
      model: config.model,
      maxTurns: config.maxTurns || 20,
      env: { ...process.env, ...config.env, AGENT_K_WORKTREE_ID: config.id },
      // 도구 실행 시 cwd 강제 지정
      toolContext: { cwd: worktreePath },
    });

    const instance: WorktreeInstance = {
      config,
      path: worktreePath,
      branch: branchName,
      loop,
      status: 'running',
      startTime: Date.now(),
    };

    this.worktrees.set(config.id, instance);
    return instance;
  }

  async runParallel(configs: WorktreeConfig[], task: string): Promise<WorktreeResult[]> {
    const instances = await Promise.all(configs.map(c => this.create(c)));
    
    // 각 인스턴스에 태스크 실행
    const results = await Promise.allSettled(
      instances.map(inst => this.runTask(inst, task))
    );

    return results.map((r, i) => ({
      config: configs[i],
      instance: instances[i],
      success: r.status === 'fulfilled',
      result: r.status === 'fulfilled' ? r.value : r.reason,
    }));
  }

  private async runTask(instance: WorktreeInstance, task: string): Promise<TaskResult> {
    const events = [];
    for await (const event of instance.loop.run([{ role: 'user', content: task }])) {
      events.push(event);
      if (event.type === 'done') break;
    }

    // 결과 수집
    const diff = await this.gitDiff(instance.path, instance.config.baseBranch);
    const testResult = await this.runTests(instance.path);
    const lintResult = await this.runLint(instance.path);

    return {
      events,
      diff,
      testResult,
      lintResult,
      tokensUsed: instance.loop.getTokenUsage(),
      duration: Date.now() - instance.startTime,
    };
  }

  async cleanup(id: string, keepBranch = false): Promise<void> {
    const inst = this.worktrees.get(id);
    if (!inst) return;
    
    await this.git('worktree', 'remove', '--force', inst.path);
    if (!keepBranch) {
      await this.git('branch', '-D', inst.branch).catch(() => {});
    }
    this.worktrees.delete(id);
  }
}
```

### 4.2 Best-of-N 명령 파서 (`src/commands/bestOfN.ts`)

```typescript
// /best-of-n N=3 model=flash prompt="use functional style" "Refactor auth to use strategy pattern"
export function parseBestOfNCommand(input: string): BestOfNCommand {
  const args = shlex.split(input.slice('/best-of-n'.length).trim());
  const opts: Record<string, string> = {};
  let task = '';

  for (const arg of args) {
    if (arg.includes('=')) {
      const [k, v] = arg.split('=', 2);
      opts[k] = v;
    } else {
      task += (task ? ' ' : '') + arg;
    }
  }

  const N = Math.min(parseInt(opts.N || '3', 10), 6);
  const model = opts.model || 'flash';
  const promptVariant = opts.prompt;

  const configs: WorktreeConfig[] = Array.from({ length: N }, (_, i) => ({
    id: `bon-${Date.now()}-${i}`,
    baseBranch: 'HEAD',
    model: model === 'flash' ? 'deepseek-v4-flash' : 'deepseek-v4-pro',
    promptVariant: promptVariant ? `${promptVariant}-v${i+1}` : `variant-${i+1}`,
    env: { PROMPT_VARIANT: promptVariant || `variant-${i+1}` },
  }));

  return { N, task, configs };
}
```

### 4.3 비교 UI 데이터 구조 (`src/views/bestOfNView.ts`)

```typescript
interface BestOfNComparison {
  task: string;
  results: WorktreeResult[];
  selectedIndex?: number;
}

// Webview용 변환
function toComparisonView(comp: BestOfNComparison): ComparisonViewData {
  return {
    task: comp.task,
    columns: comp.results.map((r, i) => ({
      id: r.config.id,
      model: r.config.model,
      variant: r.config.promptVariant,
      status: r.success ? 'success' : 'failed',
      error: r.success ? null : r.result?.message,
      metrics: {
        tests: `${r.result?.testResult.passed}/${r.result?.testResult.total}`,
        lintErrors: r.result?.lintResult.errors.length || 0,
        lintWarnings: r.result?.lintResult.warnings.length || 0,
        tokens: r.result?.tokensUsed,
        duration: `${(r.result?.duration / 1000).toFixed(1)}s`,
      },
      diffSummary: summarizeDiff(r.result?.diff),
      diffFiles: r.result?.diff?.split('diff --git ').slice(1).map(f => f.split('\n')[0]) || [],
    })),
  };
}
```

---

## 5. UI/UX Specification

### 5.1 `/best-of-n` 실행 플로우
```
User: /best-of-n N=3 model=flash "Refactor UserService to Strategy pattern"

[Worktree 생성 중... ████████░░] 3/3
  ├─ bon-1 (flash)  ████████░░  Running...
  ├─ bon-2 (flash)  ████████████ Done (45s)
  └─ bon-3 (flash)  ████████████ Done (52s)

→ Comparison View 열림
```

### 5.2 비교 뷰 (Webview)
```
┌─ Best-of-3 Comparison: "Refactor UserService" ────────────────────────────┐
│  Task: Refactor UserService to Strategy pattern                          │
├─────────────────────┬─────────────────────┬───────────────────────────────┤
│ bon-1 (flash)       │ bon-2 (flash)       │ bon-3 (flash)                 │
│ variant-1           │ variant-2           │ variant-3                     │
├─────────────────────┼─────────────────────┼───────────────────────────────┤
│ ✅ Success          │ ✅ Success          │ ❌ Failed (maxTurns)          │
│ Tests: 12/12        │ Tests: 11/12        │ Tests: 0/12                   │
│ Lint: 0 err, 2 warn │ Lint: 0 err, 0 warn │ Lint: 3 err                   │
│ Tokens: 42k         │ Tokens: 38k         │ Tokens: 85k                   │
│ Time: 45s           │ Time: 52s           │ Time: 120s                    │
├─────────────────────┼─────────────────────┼───────────────────────────────┤
│ Files changed: 3    │ Files changed: 4    │ Files changed: 8              │
│  • src/UserService  │  • src/UserService  │  • src/UserService            │
│  • src/strategies/  │  • src/strategies/  │  • src/strategies/            │
│  • tests/           │  • tests/           │  • tests/ (broken)            │
├─────────────────────┼─────────────────────┼───────────────────────────────┤
│ [Select]            │ [Select]            │ [Discard]                     │
└─────────────────────┴─────────────────────┴───────────────────────────────┘

[Diff View]  [Test Logs]  [Metrics Chart]  ← 탭 전환
```

### 5.3 Diff 탭 (3-way diff)
```
bon-1 (Selected)          bon-2                        bon-3
─────────────────────────────────────────────────────────────────
class UserService {       class UserService {          class UserService {
  constructor() {           constructor(strategies) {    constructor() {
-   this.db = new DB();   +   this.strategies = s;      -   this.db = new DB();
  }                       }                              }
  async find(id) {        async find(id) {             async find(id) {
-   return this.db.get(id);  return this.strategies.    -   return this.db.get(id);
  }                          findById(id);              }
}                         }                              }
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Worktree and Best-of-N

  Scenario: Create worktree and run agent in isolation
    Given a git repository with package.json
    When worktree manager creates "bon-1" worktree
    Then new directory exists with separate node_modules
    And git status shows clean in both main and worktree
    And agent runs with cwd=worktree path

  Scenario: Best-of-3 with flash models
    Given user runs "/best-of-n N=3 model=flash 'Add null checks to UserService'"
    Then 3 worktrees created in parallel
    And each runs with deepseek-v4-flash
    And all complete within 5 minutes
    And comparison view shows 3 columns with metrics

  Scenario: Select best result and apply to main
    Given comparison view shows 3 results
    When user clicks "Select" on bon-2 (best test pass, clean lint)
    And confirms "Apply to main branch"
    Then bon-2 changes are cherry-picked to current branch
    And bon-1, bon-3 worktrees are removed
    And main branch has the refactored code

  Scenario: Failed worktree handled gracefully
    Given one worktree hits maxTurns and fails
    Then comparison shows "Failed" status with error
    And user can still select from successful ones
    And failed worktree cleaned up automatically

  Scenario: Resource limits respected
    Given maxParallelWorktrees=2
    When user requests N=4
    Then only 2 run concurrently
    And remaining 2 queue and start as slots free
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `git` CLI | 런타임 | `worktree` 명령 필요 (Git 2.5+) |
| `PRD-Tools-F_Orchestration_Extension.md` | 상위 | 별도 컨텍스트 AgentLoop 재사용 |
| `PRD-Harness-12_Routing_Heuristics.md` | 병행 | 모델 티어 자동 할당 |
| `PRD-C4_Infrastructure.md` | 선행 | 체크포인트/롤백으로 worktree 안전성 확보 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | WorktreeManager: 생성/제거/깃 연동 | 격리된 디렉토리에서 npm install/test 동작 |
| 2 | AgentLoop 다중 인스턴스 (cwd 분리) | 병렬 실행 프레임워크 |
| 3 | `/best-of-n` 명령 파서 + 변형 주입 | N개 설정 자동 생성 |
| 4 | 결과 수집: diff, test, lint, metrics | 구조화된 비교 데이터 |
| 5 | 비교 Webview (3-way diff, 메트릭 차트) | 시각적 선택 UI |
| 6 | 선택 적용 (cherry-pick) + 정리 | 메인 브랜치 반영 + 자동 클린업 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| 디스크 공간 부족 (대형 레포 × N) | 높음 | `git worktree add --no-checkout` + sparse checkout, 임시 디렉토리 정리 정책 |
| 포트 충돌 (동시 dev server) | 중간 | 포트 자동 할당 (OS에 0 요청), `PORT=0` 환경변수 |
| worktree 간 파일 락 충돌 (Windows) | 중간 | `--force` 제거, 재시도 로직 |
| 긴 실행 시간으로 사용자 대기 지루함 | 낮음 | 진행률 Webview + 백그라운드 알림 (완료 시 토스트) |

---


## Out of Scope

- Team MCP 마켓 풀 복제 / Cloud 상시 에이전트
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **A급: Worktree / Best-of-N**
- Git Worktree: https://git-scm.com/docs/git-worktree
- Cursor Best-of-N: https://cursor.sh/docs/best-of-n