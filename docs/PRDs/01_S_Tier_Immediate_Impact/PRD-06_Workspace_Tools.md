# PRD-06: 워크스페이스 도구 세트 (Workspace Tool Set)

> **Priority**: S급 (에이전트 실력 = 도구)  
> **Phase**: C1~C4 (MVP → 풀세트 단계적 확장)  
> **관련 PRD**: `PRD-Tools-A_Search_Explore.md` ~ `PRD-Tools-G_Debug_Tools.md`, `PRD-Infra-04_Tool_Registry.md`, `PRD-Harness-08_Harness_Duties.md`

---

## 1. Overview

### 목적
에이전트가 코드베이스를 **탐색·읽기·수정·실행·검증**할 수 있는 **표준 도구 세트**를 확장 내부에 구축한다. Cursor/Claude Code/OpenCode와 **역할은 동일하되 이름만 통일**한 레지스트리.

### 비즈니스 가치
- 모델이 "어떤 도구를 쓸지" 고민하지 않게 스키마 통일
- 중급 모델(Flash급)은 도구 8~10개만 줘도 충분 → 스키마 토큰 절약
- 확장이 직접 병렬 실행 제어 → 모델보다 빠르고 예측 가능

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 에이전트로서, "이 함수 어디서 쓰여?"라고 물으면 `lsp_references`로 즉시 찾아주고 싶다 |
| US-02 | 에이전트로서, 테스트 실패 로그를 보고 `run_terminal_cmd`로 재실행하고 `read_lints`로 에러 확인하고 싶다 |
| US-03 | 개발자로서, 에이전트가 `grep` 10개를 동시에 돌려 500ms 만에 전체 코드베이스에서 패턴을 찾길 원한다 |

---

## 2. Functional Requirements

### 2.1 도구 카테고리 및 MVP 우선순위

| 카테고리 | 도구 (권장 이름) | MVP | C4 일상 | C7 풀세트 | 비고 |
|----------|------------------|-----|---------|-----------|------|
| **A. 검색·탐색** | `grep` | ✅ | ✅ | ✅ | ripgrep 병렬 |
| | `glob` / `file_search` | ✅ | ✅ | ✅ | `findFiles` |
| | `list_dir` | ✅ | ✅ | ✅ | `fs.readDirectory` |
| | `read_file` | ✅ | ✅ | ✅ | offset/limit 필수 |
| | `codebase_search` | | | ✅ | 임베딩 인덱스 (A급) |
| | `lsp_*` (정의/참조/진단) | | ✅ | ✅ | Language Features API |
| **B. 편집·파일** | `edit_file` (Search-Replace) | ✅ | ✅ | ✅ | Diff 승인 연동 |
| | `write_file` | ✅ | ✅ | ✅ | 신규 파일만 |
| | `delete_file` | | ✅ | ✅ | 항상 승인 |
| | `reapply` | | ✅ | ✅ | 실패 패치 재시도 |
| | `notebook_edit` | | | ✅ | Jupyter 지원 |
| **C. 터미널·프로세스** | `run_terminal_cmd` | ✅ | ✅ | ✅ | 세션 셸 1개 + 백그라운드 |
| | `run_background` | | ✅ | ✅ | PID 반환, 로그 스트림 |
| | `await_terminal` / `monitor` | | | ✅ | 서버 기동·테스트 대기 |
| **D. 웹·브라우저** | `web_search` | | ✅ | ✅ | 문서·API 최신화 |
| | `web_fetch` | | ✅ | ✅ | HTML→Markdown |
| | `browser_*` | | | ✅ | Playwright (Design Mode) |
| **E. 사용자·세션** | `ask_question` | ✅ | ✅ | ✅ | 객관식 UI |
| | `todo_write` | | ✅ | ✅ | 진행 가시화 |
| | `fetch_rules` | | ✅ | ✅ | 동적 규칙 로드 |
| | `switch_mode` | | ✅ | ✅ | Plan/Ask 전환 |
| **F. 오케스트레이션** | `task` / `subagent` | | | ✅ | 별도 컨텍스트 위임 |
| | `mcp_*` | | | ✅ | MCP 브리지 |
| | `worktree` | | | ✅ | 격리 병렬 시도 |

### 2.2 도구별 상세 스펙 (핵심 10개 MVP)

#### `grep` — 정규식 내용 검색
```typescript
interface GrepArgs {
  pattern: string;           // PCRE 정규식
  path?: string;             // 워크스페이스 상대 경로 (기본: 루트)
  include?: string;          // glob 패턴 (예: "*.ts")
  exclude?: string;          // 제외 glob
  maxResults?: number;       // 기본 100
  contextLines?: number;     // 매칭 전후 줄 수 (기본 2)
}
```
- 구현: `child_process.spawn('rg', [...])` + `Promise.all`로 다중 패턴 병렬
- 결과: `{ file, line, column, match, contextBefore[], contextAfter[] }[]`

#### `glob` / `file_search` — 경로·이름 패턴
```typescript
interface GlobArgs {
  pattern: string;           // "**/*.test.ts"
  path?: string;
}
```
- 구현: `vscode.workspace.findFiles(pattern, excludeGlob)`

#### `list_dir` — 디렉터리 목록
```typescript
interface ListDirArgs {
  path: string;              // 상대 경로
  depth?: number;            // 기본 1
}
```
- 구현: `vscode.workspace.fs.readDirectory` 재귀

#### `read_file` — 파일 읽기 (구간 필수)
```typescript
interface ReadFileArgs {
  path: string;
  offset?: number;           // 시작 바이트/라인 (기본 0)
  limit?: number;            // 최대 라인/바이트 (기본 250줄)
  encoding?: 'utf8' | 'base64';
}
```
- **중요**: 전체 파일 읽기 금지. 기본 250줄, 최대 1000줄 캡.
- 이미지: `base64` 반환, Vision 모델만 처리

#### `edit_file` (Search-Replace) — 부분 수정
```typescript
interface EditFileArgs {
  path: string;
  edits: SearchReplaceEdit[];  // 동일 파일 다중 hunk 허용
}
interface SearchReplaceEdit {
  search: string;              // 기존 코드 (최소 3줄, 유일 매칭)
  replace: string;             // 새 코드
  expectMatchCount?: 1;        // 기본 1, 0/2+ 시 에러
}
```
- 파서: `Spec-02_Patch_Format.md`
- Staleness 체크: read 후 mtime/hash 비교

#### `write_file` — 신규/전체 덮어쓰기
```typescript
interface WriteFileArgs {
  path: string;
  content: string;
  overwrite?: boolean;         // 기본 false (신규만)
}
```
- 기존 파일 덮어쓰기 시 `edit_file` 권장 (Diff 승인 유리)

#### `run_terminal_cmd` — 셸 실행
```typescript
interface RunTerminalCmdArgs {
  cmd: string;                 // 단일 명령 (파이프/리다이렉트 허용)
  cwd?: string;                // 기본 워크스페이스 루트
  timeoutMs?: number;          // 기본 30s, 빌드/테스트 시 10m까지 인자로 연장
  isBackground?: boolean;      // 백그라운드 잡 (PID 반환)
  env?: Record<string, string>; // 추가 환경변수
}
```
- 출력: stdout+stderr 병합, **끝 32KB**만 반환 (head+tail)
- Exit code 필수 포함
- Allowlist: `git`, `npm`, `pnpm`, `yarn`, `pytest`, `jest`, `go test`, `cargo test`, `make`, `docker compose`

#### `ask_question` — 중간 확인 질문
```typescript
interface AskQuestionArgs {
  question: string;
  options: string[];           // 객관식 (2~5개)
  allowFreeText?: boolean;     // 기본 false
}
```
- UI: 모달 드롭다운 + 자유 텍스트 토글
- 응답: `{ selectedIndex: number, freeText?: string }`

#### `read_lints` — 진단 읽기 (자동 검증용)
```typescript
interface ReadLintsArgs {
  paths?: string[];            // 기본: 최근 수정된 파일들
  severity?: 'error' | 'warning' | 'info' | 'hint';
}
```
- 구현: `vscode.languages.getDiagnostics(uri)` 집계
- 반환: `{ file, range, severity, code, message, source }[]`

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 도구 호출 지연 | 로컬 도구 (grep/read) P99 < 200ms |
| NFR-02 | 병렬 읽기 처리량 | 동시 16개 파일 읽기 < 500ms (SSD) |
| NFR-03 | 도구 스키마 토큰 | 전체 도구 세트 < 8k tokens (MCP deferred로 확장) |
| NFR-04 | 권한 일관성 | 읽기=자동, 쓰기=Diff승인, 터미널=Allowlist/승인 |
| NFR-05 | 에러 복구 | 도구 실패 → tool_result로 반환 → 모델이 재시도 |

---

## 4. API & Technical Spec

### 4.1 Tool Registry (`src/tools/registry.ts`)

```typescript
export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodSchema;           // Zod로 검증 + JSON Schema 생성
  handler: (args: unknown, ctx: ToolContext) => Promise<ToolResult>;
  metadata: ToolMetadata;
}

export interface ToolMetadata {
  category: 'readonly' | 'write' | 'exec' | 'network' | 'orchestrate';
  readonly: boolean;             // true면 병렬 실행 허용
  destructive?: boolean;         // delete, chmod 등
  allowlist?: string[];          // 터미널 명령어 허용 리스트
  requiresApproval?: boolean;    // 기본: write/destructive=true
  maxParallel?: number;          // 동시 실행 상한 (읽기 16, 쓰기 1)
  idempotent?: boolean;          // 재시도 안전 여부
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  
  register(def: ToolDefinition) {
    this.tools.set(def.name, def);
  }
  
  getSchema(whitelist: string[]): JSONSchema {
    return whitelist
      .map(name => this.tools.get(name))
      .filter(Boolean)
      .map(t => t!.schema);
  }
  
  async execute(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { error: `Unknown tool: ${name}` };
    
    // 1. 스키마 검증
    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) return { error: parsed.error.message };
    
    // 2. Pre-hook (보안 스캔, 시크릿 마스킹 등)
    await this.runPreHooks(tool, parsed.data);
    
    // 3. 실행
    const result = await tool.handler(parsed.data, ctx);
    
    // 4. Post-hook (로깅, 스티커 결과 캐싱)
    await this.runPostHooks(tool, result);
    
    return result;
  }
}
```

### 4.2 병렬/직렬 실행 정책 (`PRD-Infra-08_Parallel_Serial_Policy.md`)

```typescript
// 에이전트 루프에서 호출
async function executeToolCalls(calls: ToolCall[]): Promise<ToolResult[]> {
  const readonlyCalls = calls.filter(c => registry.isReadOnly(c.name));
  const writeCalls = calls.filter(c => !registry.isReadOnly(c.name));
  
  // 읽기: Promise.all (최대 16 동시)
  const readResults = await pLimit(16)(readonlyCalls.map(c => 
    () => registry.execute(c.name, c.args, ctx)
  ));
  
  // 쓰기/터미널: 직렬 (순서 보장)
  const writeResults = [];
  for (const call of writeCalls) {
    writeResults.push(await registry.execute(call.name, call.args, ctx));
  }
  
  return [...readResults, ...writeResults].sort((a,b) => a.callId - b.callId);
}
```

### 4.3 도구 결과 표준 포맷

```typescript
interface ToolResult {
  callId: string;
  output: string;           // 모델용 텍스트 (트렁케이트 32KB)
  structured?: unknown;     // 구조화 데이터 (UI용)
  error?: boolean;
  truncated?: boolean;
  metadata?: {
    durationMs: number;
    filesAffected?: string[];
    linesRead?: number;
  };
}
```

---

## 5. UI/UX Specification

### 5.1 도구 실행 인디케이터 (채팅 사이드바)
```
🔧 Running 3 tools in parallel...
  ├─ grep: "TODO" in src/**     ████████░░ 42/100 files
  ├─ read_file: src/auth.ts     ✓ Done (120 lines)
  └─ read_file: src/utils.ts    ████░░░░░░ 60%
```

### 5.2 터미널 출력 프리뷰
```
$ pytest tests/auth.test.ts -xvs
────────────────────────────────────────
FAILED tests/auth.test.ts::test_login
AssertionError: Expected 200, got 401
────────────────────────────────────────
[Truncated: 32KB of 45KB output]
```

### 5.3 ask_question 모달
```
┌──────────────────────────────────────┐
│ ❓ 어떤 방식으로 리팩터링할까요?       │
├──────────────────────────────────────┤
│ ○ Strategy Pattern (추천)            │
│ ○ Factory Pattern                    │
│ ○ Simple Interface + Impl            │
│ [자유 텍스트 입력...]                 │
├──────────────────────────────────────┤
│           [제출]                     │
└──────────────────────────────────────┘
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Workspace Tool Set

  Scenario: Parallel grep + read_file
    Given a workspace with 500 TypeScript files
    When agent calls grep("handleError") and read_file on top 10 results in parallel
    Then all 10 files are read within 800ms
    And results contain matching lines with context

  Scenario: edit_file with Search-Replace
    Given a file "src/calc.ts" with function "add(a,b){return a+b}"
    When agent calls edit_file with search="add(a,b){return a+b}" replace="add(a,b){return a+b;}"
    Then diff preview shows single line change
    And after approval, file is modified atomically

  Scenario: run_terminal_cmd with allowlist
    Given allowlist includes "npm test"
    When agent calls run_terminal_cmd("npm test")
    Then command executes without approval prompt
    And output includes exit code and truncated stdout/stderr

  Scenario: ask_question blocks loop until answer
    Given agent calls ask_question with 3 options
    Then chat UI shows modal dropdown
    And loop pauses until user selects
    And selected option is returned as tool result

  Scenario: read_lints after edit triggers verification
    Given agent edits a file introducing a TypeScript error
    When agent calls read_lints on that file
    Then result contains the new diagnostic
    And model can retry fix in next turn
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-Infra-04_Tool_Registry.md` | 선행 | 레지스트리, 스키마, 훅 |
| `PRD-Infra-05_Permission_Autorun.md` | 선행 | 승인 게이트 |
| `PRD-Infra-07_Streaming_Tool_Executor.md` | 선행 | 스트리밍 중 도구 선실행 |
| `PRD-Infra-08_Parallel_Serial_Policy.md` | 선행 | 병렬/직렬 실행기 |
| `PRD-Spec-02_Patch_Format.md` | 선행 | edit_file 파서 |
| `PRD-Tools-A_Search_Explore.md` ~ `PRD-Tools-G_Debug_Tools.md` | 상세 | 각 도구별 상세 PRD |
| `PRD-Harness-08_Harness_Duties.md` | 병행 | 중급 모델 도구 화이트리스트 |

---

## 8. Implementation Phases

| 단계 | 도구 세트 | 완료 기준 |
|------|-----------|-----------|
| **MVP (C1~C3)** | `grep`, `glob`, `list_dir`, `read_file`, `edit_file`, `write_file`, `run_terminal_cmd`, `ask_question` | Ask 모드 탐색 + Agent 1턴 수정 |
| **일상 Agent (C4)** | + `delete_file`, `web_search`, `web_fetch`, `todo_write`, `read_lints`, permissions, checkpoints, doom loop | 대량 삭제·무한루프 방지 |
| **Cursor급 (C5~C7)** | + `codebase_search`, `browser_*`, Plan/Debug 도구, `task`(subagent), `mcp_*`, Rules/Skills, lints | 풀 제품급 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| 도구 스키마 토큰 초과 (MCP 많을 때) | 중간 | `ToolSearch` + Deferred loading (MCP stub만 먼저) |
| 로컬 모델 툴콜 인자 누락/타입 오류 | 높음 | Zod 런타임 검증 + 자동 보정(필수 필드 기본값) + 실패를 tool_result로 반환 |
| ripgrep 미설치 환경 | 낮음 | 내장 `vscode.workspace.findTextInFiles` 폴백 (느리지만 동작) |
| 터미널 출력 인코딩 깨짐 | 낮음 | UTF-8 강제, `chcp 65001` (Windows) |

---


## Out of Scope

- 네이티브 Ctrl+K 애니메이션 100% 복제
- Cloud Agents SaaS
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **S급: 워크스페이스 도구 세트**, **도구 카탈로그 (MVP→풀세트)**
- Cursor Tools: https://cursor.sh/docs/tools
- Claude Code Tools: https://docs.anthropic.com/claude-code/tools
- VS Code FileSystem API: https://code.visualstudio.com/api/references/vscode-api#workspace.fs