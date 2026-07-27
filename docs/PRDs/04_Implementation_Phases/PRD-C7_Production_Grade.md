# PRD-C7: 제품급 (Production Grade - Browser/Design, Side Chat, Worktree/Best-of-N, Review, Memories, MCP)

> **Phase**: C7 (C6 Debug 모드 안정화 후)  
> **Priority**: 높음 (Cursor급 확장 완성)  
> **관련 PRD**: `PRD-11_Browser_Design_Mode.md`, `PRD-12_Side_Chat.md`, `PRD-13_Worktree_BestOfN.md`, `PRD-14_Agent_Review_Bugbot.md`, `PRD-15_Memories.md`, `PRD-10_MCP_Client.md`, `PRD-28_Skills_Pinned.md`, `PRD-Tools-F_Orchestration_Extension.md`

---

## 1. Overview

### 목적
C0~C6으로 완성된 핵심 루프와 인프라 위에 **Cursor급 제품 기능**을 올려 완성도 높은 확장을 만든다. 이 단계부터 실무에서 "이거 Cursor 안 써도 되네" 수준 도달.

### 비즈니스 가치
- **Browser/Design Mode**: 프론트엔드 디버깅 완전 지원
- **Side Chat**: 메인 에이전트 안 끊고 병렬 탐색
- **Worktree/Best-of-N**: 격리된 병렬 시도로 리스크 분산
- **Agent Review**: 푸시 전 로컬 버그/보안 리뷰
- **Memories**: 세션 넘어 선호·사실 유지
- **MCP Client**: 외부 도구 생태계 연동

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 프론트엔드 개발자로서, 브라우저 자동화+Design Mode로 UI 버그 재현·수정·검증 원클릭으로 하고 싶다 |
| US-02 | 개발자로서, 메인 Agent가 20턴째 돌고 있을 때 Side Chat으로 "이 인터페이스 어디야?" 묻고 싶다 |
| US-03 | 팀 리더로, 어려운 리팩터링을 Flash 3개 + Pro 1개로 병렬 돌려 Best-of-N으로 최고 결과 고르고 싶다 |
| US-04 | 개발자로서, `git push` 전 `/review`로 보안/정합성 리뷰 받고 싶다 |
| US-05 | 팀원으로, "이 프로젝트는 NestJS 쓴다" 한 번 말해두면 영구 기억되게 하고 싶다 |
| US-06 | 팀 리더로, 사내 MCP 서버(DB, 내부 API) 연결해 전원 공유 도구로 쓰고 싶다 |

---

## 2. Functional Requirements

### 2.1 Browser + Design Mode (PRD-11 — **본 단계 C7에서 구현**)
| 기능 | 상태 | 비고 |
|------|------|------|
| Browser 도구 세트 (`browser_navigate`, `click`, `screenshot`, `evaluate`, `console_logs`, `network_logs`) | C7 구현 | Playwright · Tools-D |
| Design Mode (스크린샷 오버레이 + 주석 + 셀렉터 추출) | C7 구현 | 캔버스 오버레이 · PRD-11 |
| 브라우저 세션 풀 (최대 3, LRU) | C7 구현 | 메모리 < 800MB |
| 인증 쿠키 주입 / 다운로드 처리 | C7 구현 | 세션 유지 |

> **주의**: C6 Debug는 계측·재현·로그 루프만. Browser/Design을 C6 완료로 간주하지 말 것.

### 2.2 Side Chat (PRD-12 재사용)
| 기능 | 구현 포인트 |
|------|-------------|
| 진입 명령 | `/side` 또는 사이드바 `+ Side Chat` 탭 |
| 독립 컨텍스트 | 별도 메시지 히스토리, 읽기 전용 도구만 (`grep`, `glob`, `read_file`, `codebase_search`, `lsp_*`, `ask_question`) |
| 메인 세션 참조 | 메인의 열린 파일/규칙/현재 작업 읽기 전용 접근 |
| 결과 아티팩트 | `/side done` → 요약 + 파일 리스트 저장 → 메인에서 `@side-<id>`로 인용 |
| 다중 Side Chat | 탭 UI로 최대 5개 동시 유지 |

### 2.3 Worktree / Best-of-N (PRD-13 재사용)
| 기능 | 구현 포인트 |
|------|-------------|
| Worktree 생성 | `git worktree add ../worktree-<id> <branch>` 격리 디렉토리 |
| 에이전트 바인딩 | Worktree별 전용 AgentLoop (별도 cwd, 별도 컨텍스트) |
| `/best-of-n N=3` | 모델/프롬프트 변형별 worktree 병렬 실행 |
| 결과 비교 UI | Diff + 테스트 결과 + 메트릭 3-way 비교 테이블 |
| 선택 적용 | `cherry-pick` 또는 `merge`로 메인 브랜치 반영 |
| 자동 정리 | 미선택 worktree 자동 제거 (옵션: 브랜치 보관) |

### 2.4 Agent Review / 로컬 Bugbot (PRD-14 재사용)
| 기능 | 구현 포인트 |
|------|-------------|
| `/review [--staged] [--since=HEAD~3]` | Diff 수집 → 체크리스트 프롬프트 → Finding 리스트 UI |
| 체크리스트 | Correctness / Security / Tests / Performance / Maintainability |
| Finding UI | 파일별 그룹핑, 심각도/카테고리 필터, Diff 점프, [Fix] 버튼 |
| Fix 세션 | Finding 주입 → 새 Agent 세션 → 자동 `read_lints`/`test` 검증 |
| SARIF 내보내기 | CI 연동용 |

### 2.5 Memories (PRD-15 재사용)
| 기능 | 구현 포인트 |
|------|-------------|
| 명시 저장 | "기억해: 이 프로젝트는 NestJS 쓴다" → `save_memory` 도구 |
| 반복 감지 | 동일 지시 3회 → "이 패턴 기억할까요?" 토스트 |
| 주입 | 매 턴 시스템 프롬프트 옆 1~2% 예산으로 `## Active Memories` 블록 |
| UI | 메모리 패널 (키/값/범위/출처/편집/삭제/이동) |
| 팀 공유 | `.agentk/team-memories.json` Git 커밋으로 동기화 |

### 2.5 MCP Client (PRD-10 재사용)
| 기능 | 구현 포인트 |
|------|-------------|
| 서버 설정 | `stdio`/`sse`/`websocket`, `command`/`args`/`env`, SecretStorage 연동 |
| 자동 동기화 | `tools/list`, `resources/list`, `prompts/list` → 레지스트리 등록 |
| 네임스페이스 | `mcp_<serverId>_<toolName>` 프리픽스로 충돌 방지 |
| 지연 로드 | 50개 초과 시 스텁만 등록, 최초 호출 시 상세 로드 (`tool_search`) |
| 진행 스트리밍 | `notifications/progress` → UI 프로그레스 바 |

---

## 2. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | Browser 세션 메모리 | 세션당 < 200MB, 총 < 800MB |
| NFR-02 | Side Chat 메모리 오버헤드 | 세션당 < 50MB |
| NFR-03 | Worktree 생성 시간 | < 3초 (shallow clone 옵션) |
| NFR-04 | 리뷰 지연 | 500라인 diff 기준 < 10초 |
| NFR-05 | 메모리 주입 지연 | 턴당 < 5ms |
| NFR-06 | MCP 도구 호출 오버헤드 | < 50ms |

---

## 3. Technical Spec (통합 아키텍처)

### 3.1 기능 플래그 레지스트리 (`src/features/registry.ts`)

```typescript
export interface FeatureModule {
  id: string;
  name: string;
  dependencies: string[];      // 선행 모듈
  enable: () => Promise<void>;  // 등록 로직
  disable: () => Promise<void>; // 정리 로직
  configSchema: JSONSchema;     // 설정 스키마
}

export const FEATURE_MODULES: FeatureModule[] = [
  { id: 'browser', name: 'Browser & Design Mode', dependencies: ['core-loop', 'tools-browser'], enable: setupBrowser },
  { id: 'side-chat', name: 'Side Chat', dependencies: ['core-loop', 'tools-read'], enable: setupSideChat },
  { id: 'worktree', name: 'Worktree & Best-of-N', dependencies: ['core-loop', 'git'], enable: setupWorktree },
  { id: 'review', name: 'Agent Review', dependencies: ['core-loop', 'tools-lint', 'tools-test'], enable: setupReview },
  { id: 'memories', name: 'Memories', dependencies: ['context-assembly'], enable: setupMemories },
  { id: 'mcp', name: 'MCP Client', dependencies: ['tool-registry', 'secrets'], enable: setupMCP },
];

export async function enableFeature(id: string): Promise<void> {
  const module = FEATURE_MODULES.find(m => m.id === id);
  if (!module) throw new Error(`Unknown feature: ${id}`);
  
  // 의존성 먼저 활성화
  for (const dep of module.dependencies) {
    await enableFeature(dep);
  }
  
  await module.enable();
  vscode.workspace.getConfiguration().update('agentK.enabledFeatures', [...getEnabled(), id], true);
}
```

### 3.2 통합 설정 스키마 (`package.json` configuration)

```json
{
  "agentK.enabledFeatures": {
    "type": "array",
    "items": { "enum": ["browser", "side-chat", "worktree", "review", "memories", "mcp"] },
    "default": ["browser", "side-chat", "worktree", "review", "memories", "mcp"]
  },
  "agentK.browser": {
    "type": "object",
    "properties": {
      "maxSessions": { "type": "integer", "default": 3 },
      "defaultViewport": { "type": "object", "properties": { "width": 1280, "height": 720 } },
      "enableDesignMode": { "type": "boolean", "default": true }
    }
  },
  "agentK.sideChat": {
    "type": "object",
    "properties": {
      "maxSessions": { "type": "integer", "default": 5 },
      "toolWhitelist": { "type": "array", "items": { "type": "string" }, "default": ["grep", "glob", "read_file", "codebase_search", "lsp_definition", "ask_question"] }
    }
  },
  "agentK.worktree": {
    "type": "object",
    "properties": {
      "maxParallel": { "type": "integer", "default": 3 },
      "shallowClone": { "type": "boolean", "default": true },
      "autoCleanup": { "type": "boolean", "default": true }
    }
  },
  "agentK.review": {
    "type": "object",
    "properties": {
      "rulesFile": { "type": "string", "default": ".agentk/review-rules.md" },
      "autoReviewOnPush": { "type": "boolean", "default": false }
    }
  },
  "agentK.memories": {
    "type": "object",
    "properties": {
      "userBudget": { "type": "integer", "default": 50 },
      "workspaceBudget": { "type": "integer", "default": 100 },
      "teamSyncEnabled": { "type": "boolean", "default": false }
    }
  },
  "agentK.mcp": {
    "type": "object",
    "properties": {
      "servers": { "type": "array", "items": { "$ref": "#/definitions/mcpServer" } }
    }
  }
}
```

---

## 3. UI/UX Specification

### 3.1 기능 토글 (설정 패널)
```
┌─ Agent K Features ────────────────────────────────────────────────────┐
│  ☑ Browser & Design Mode     [⚙ Configure]  (Playwright, Design Mode) │
│  ☑ Side Chat                 [⚙ Configure]  (Max 5 sessions)          │
│  ☑ Worktree & Best-of-N      [⚙ Configure]  (Max 3 parallel)         │
│  ☑ Agent Review              [⚙ Configure]  (Rules: .agentk/review)  │
│  ☑ Memories                  [⚙ Configure]  (Team sync: Off)         │
│  ☑ MCP Client                [⚙ Configure]  (2 servers configured)    │
│                                                                       │
│  [Save & Reload]                                                           │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 통합 사이드바 (모든 기능 접근)
```
┌─ Agent K ──────────────────────────────────────────────────────────────┐
│  [Main 🟢]  [Side: auth 🔍]  [Side: api 🔍]  [+ Side]  [🌿 Worktree]   │
│  [🌐 Browser]  [🔍 Review]  [🧠 Memories]  [🔌 MCP]  [⚙ Settings]     │
├────────────────────────────────────────────────────────────────────────┤
│  (Main Chat Area)                                                      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Production Grade Features (C7)

  Scenario: Browser + Design Mode end-to-end
    Given user opens Browser tab
    When user navigates to localhost:3000, clicks button, captures screenshot
    And opens Design Mode, draws red box on button with text "Make green"
    Then annotation extracted with selector "button[data-testid=submit]"
    And agent edits CSS, re-navigates, re-captures
    And user verifies green button visually

  Scenario: Side Chat while main agent running
    Given main agent at turn 15 of refactoring
    When user opens Side Chat tab
    And asks "Where is UserService defined?"
    Then side chat searches (grep/lsp) without interrupting main
    And returns 3 implementations
    When user clicks "Done - Save Artifact"
    And main chat types "@side-auth-abc123"
    Then side chat findings injected into main context

  Scenario: Best-of-3 with Flash/Pro/TRT
    Given user runs "/best-of-n N=3 model=flash,pro,trt 'Add OAuth2 PKCE'"
    When 3 worktrees created in parallel
    And each runs with different model/variant
    Then comparison view shows 3 columns: tests, lint, tokens, time
    When user selects best (Pro: 12/12 tests, 0 lint)
    Then that worktree changes cherry-picked to main
    And other worktrees cleaned up

  Scenario: Pre-push review
    Given user runs "/review --staged"
    When local review runs on staged diff
    Then findings: 1 security (hardcoded secret), 2 maintainability
    When user clicks [Fix] on security finding
    Then new agent session fixes it, runs tests, verifies
    And finding marked resolved in review panel

  Scenario: Memory persistence across sessions
    Given user said "Remember: this project uses NestJS v10"
    When new VS Code window opened
    Then memory "framework: NestJS v10" auto-injected in system prompt
    And agent answers framework questions correctly

  Scenario: MCP server integration
    Given user adds GitHub MCP server with PAT
    When user asks "Create issue for bug #123"
    Then agent calls mcp_github_create_issue
    And issue created on GitHub with correct labels
```

---

## 4. Implementation Checklist

| 단계 | 작업 | 완료 기준 |
|------|------|-----------|
| 1 | Feature Module 레지스트리 + 기능 토글 UI | 설정에서 on/off, 의존성 순서대로 로드 |
| 2 | Browser + Design Mode (C7 본구현, `PRD-11`) + 설정 통합 | Playwright 풀, Design Mode 탭 |
| 3 | Side Chat 모듈 (독립 컨텍스트 + 아티팩트 + @side 멘션) | 메인 루프와 독립 병렬 실행 |
| 4 | Worktree Manager + Best-of-N 실행기 + 비교 UI | 3 worktree 병렬, 비교 테이블 |
| 5 | Review 엔진 + Finding UI + Fix 세션 + SARIF | `/review` 명령, GitHub 연동 |
| 5 | Memories 고도화 (C4 최소 기능 확장 + 패널 + 팀 동기화) | 세션 간 영속 |
| 6 | MCP Client (설정/동기화/지연로드/스트리밍) | GitHub/Filesystem 서버 연동 |
| 7 | Skills / 핀 스킬 (`PRD-28`) + 병렬 서브에이전트 | 핀 주입 · task 위임 |
| 8 | 통합 설정 패널 + 기능 토글 + 마이그레이션 | 기존 설정 보존 |
| 9 | 종합 E2E: 모든 기능 조합 시나리오 10개 | CI 그린 |

---


## Out of Scope

- 해당 Phase 밖 기능을 완료로 간주하지 말 것 (특히 Browser=C7)
- 상세: `00_Master_Context.md` Non-Goals

## 4. References

- `PRD-11_Browser_Design_Mode.md` — Browser/Design Mode 상세
- `PRD-12_Side_Chat.md` — Side Chat 상세
- `PRD-13_Worktree_BestOfN.md` — Worktree/Best-of-N 상세
- `PRD-14_Agent_Review_Bugbot.md` — Agent Review 상세
- `PRD-15_Memories.md` — Memories 상세
- `PRD-10_MCP_Client.md` — MCP Client 상세
- `PRD-C6_Debug_Mode.md` — Debug 계측·런타임 증거 (Browser/Design 본구현은 C7)
- `PRD-C4_Infrastructure.md` — 인프라 재사용 (체크포인트, 훅, 컴팩션)
- `PRD-Tools-D_Web_Browser_Media.md` — 브라우저 도구 카탈로그