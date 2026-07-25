# PRD-19: 테스트 생성 · 실패 수정 루프 (Test Generation & Fix Loop)

> **Priority**: A급 (CI 전 로컬 자동화)  
> **Phase**: C7  
> **관련 PRD**: `PRD-Tools-C_Terminal_Process.md`, `PRD-Harness-10_Verification_MicroLoop.md`, `PRD-06_Workspace_Tools.md`

---

## 1. Overview

### 목적
에이전트가 **테스트 코드 생성 → 실행 → 실패 시 자동 수정 → 재실행** 루프를 로컬에서 완결한다. CI 피드백 대기 시간 제거, "빨간 테스트 → 초록 테스트" 사이클을 에이전트에게 위임.

### 비즈니스 가치
- **빠른 피드백**: 푸시 전 로컬에서 테스트 통과 보장
- **테스트 커버리지 향상**: "이 함수 테스트 써줘" → 생성 → 통과까지 자동
- **회귀 방지**: 기존 테스트 깨짐 시 즉시 감지·수정

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, "auth.ts 테스트 만들어줘"라고 하면 Jest/Vitest 테스트 파일이 생성되고 통과까지 되길 원한다 |
| US-02 | 개발자로서, CI에서 실패한 테스트 로그를 붙여넣으면 로컬에서 재현·수정·검증까지 끝내길 원한다 |
| US-03 | 팀 리더로서, 테스트 생성 가이드라인(네이밍, 모킹 패턴)을 `.agentk/test-rules.md`로 강제하고 싶다 |

---

## 2. Functional Requirements

### 2.1 테스트 생성 (`/test:generate`)
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 대상 지정 | 파일 경로, 심볼명, 또는 "전체 모듈" |
| FR-02 | 프레임워크 감지 | `package.json`에서 jest/vitest/mocha/pytest/go test 감지 |
| FR-03 | 기존 테스트 분석 | 인접 `*.test.ts` 읽어 패턴/모킹/유틸 학습 |
| FR-04 | 테스트 플랜 | Plan 모드로: 해피패스/에지케이스/에러케이스 시나리오 나열 → 사용자 승인 |
| FR-05 | 생성 실행 | Agent 모드로 테스트 파일 생성/수정 |
| FR-06 | 실행 검증 | `run_terminal_cmd`로 테스트 실행 → 통과 시 완료, 실패 시 수정 루프 |

### 2.2 실패 수정 루프 (`/test:fix`)
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-07 | 실패 로그 입력 | 사용자 붙여넣기 또는 `gh run view --log` 자동 수집 |
| FR-08 | 로컬 재현 | 동일 테스트 명령 실행 → 실패 재현 |
| FR-09 | 원인 분석 | 스택 트레이스 → 관련 소스 `read_file` → 가설 수립 |
| FR-10 | 최소 수정 | 프로덕션 코드 또는 테스트 코드 최소 패치 |
| FR-11 | 재실행 검증 | 같은 테스트 재실행 → 통과 시 루프 종료 |
| FR-12 | 최대 재시도 | 3회 실패 시 사용자에게 에스컬레이션 (Ask 모드 전환) |

### 2.3 테스트 실행 도구 통합
| FR-ID | 도구 | 상세 |
|-------|------|------|
| FR-13 | `run_terminal_cmd` | 테스트 명령 실행 (jest, vitest, pytest, go test, cargo test) |
| FR-14 | `read_lints` | 타입 에러·린트 에러 병행 체크 |
| FR-15 | 커버리지 리포트 | `--coverage` 파싱 → 미커버 라인 하이라이트 |

### 2.4 테스트 규칙 커스터마이징
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-16 | 규칙 파일 | `.agentk/test-rules.md` (네이밍, describe/it 구조, 모킹 라이브러리, 스냅샷 정책) |
| FR-17 | 프로젝트 템플릿 | `test/template.test.ts` 있으면 복사·변형 사용 |
| FR-18 | 공통 유틸 | `test/utils/*.ts` 자동 import |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 테스트 실행 타임아웃 | 단일 테스트 파일 60초, 전체 스위트 5분 |
| NFR-02 | 병렬 실행 | `jest --maxWorkers=4` 등 활용, 에이전트 레벨에서 병렬화 안 함(도구 레벨) |
| NFR-03 | 플러키 테스트 감지 | 동일 테스트 2회 실행해 비결정적 실패 감지 → 격리 권장 |
| NFR-04 | 스냅샷 업데이트 | `-u` 플래그 자동 감지 → 사용자 확인 후 적용 |

---

## 4. API & Technical Spec

### 4.1 테스트 실행 래퍼 (`src/testing/runner.ts`)

```typescript
export interface TestRunner {
  detectFramework(): Promise<TestFramework>;
  runTest(target: TestTarget): Promise<TestRunResult>;
  parseOutput(output: string): ParsedTestResult;
}

export interface TestTarget {
  type: 'file' | 'pattern' | 'all' | 'failed';
  path?: string;           // file: "src/auth.test.ts"
  pattern?: string;        // pattern: "**/*.test.ts"
}

export interface TestRunResult {
  passed: boolean;
  summary: { total: number; passed: number; failed: number; skipped: number; duration: number };
  failures: TestFailure[];
  coverage?: CoverageData;
  rawOutput: string;
}

export interface TestFailure {
  file: string;
  suite: string;
  test: string;
  message: string;
  stack?: string;
  line?: number;
}

export class JestRunner implements TestRunner {
  async detectFramework(): Promise<TestFramework> {
    const pkg = JSON.parse(await readFile('package.json'));
    if (pkg.devDependencies?.jest || pkg.dependencies?.jest) return 'jest';
    if (pkg.devDependencies?.vitest) return 'vitest';
    throw new Error('No test framework detected');
  }

  async runTest(target: TestTarget): Promise<TestRunResult> {
    const cmd = this.buildCommand(target);
    const result = await runTerminalCmd({ cmd, timeout: 300000, cwd: workspaceRoot });
    return this.parseOutput(result.output);
  }

  private buildCommand(target: TestTarget): string {
    const base = 'npx jest --json --outputFile=-';  // JSON 리포터로 파싱 용이
    switch (target.type) {
      case 'file': return `${base} ${target.path}`;
      case 'pattern': return `${base} --testPathPattern="${target.pattern}"`;
      case 'failed': return `${base} --onlyFailures`;
      default: return base;
    }
  }

  parseOutput(output: string): TestRunResult {
    const lines = output.trim().split('\n');
    const jsonLine = lines.find(l => l.startsWith('{'));
    if (!jsonLine) throw new Error('No JSON output from Jest');
    const report = JSON.parse(jsonLine);
    
    return {
      passed: report.success,
      summary: { total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests, duration: report.testResults.reduce((s,r)=>s+r.perfStats?.runtime||0,0) },
      failures: report.testResults.flatMap(r => r.testResults.filter(t => t.status === 'failed').map(t => ({
        file: r.name,
        suite: t.ancestorTitles.join(' > '),
        test: t.title,
        message: t.failureMessages.join('\n'),
        stack: t.failureMessages.join('\n'),
      }))),
      rawOutput: output,
    };
  }
}
```

### 4.2 테스트 생성 에이전트 (`src/agents/testAgent.ts`)

```typescript
export class TestGeneratorAgent {
  constructor(
    private loop: AgentLoop,
    private runner: TestRunner,
    private rules: TestRules
  ) {}

  async generateTests(target: string): Promise<GenerationResult> {
    // 1. 대상 분석
    const sourceFiles = await this.resolveTarget(target);
    const existingTests = await this.findExistingTests(sourceFiles);
    
    // 2. 플랜 수립 (Plan 모드)
    const planPrompt = `Generate test plan for ${sourceFiles.map(f=>f.path).join(', ')}.
    
Source code:
${sourceFiles.map(f => `\`\`\`${f.lang}\n${f.content}\n\`\`\``).join('\n\n')}

Existing test patterns:
${existingTests.map(f => `\`\`\`${f.lang}\n${f.content.slice(0, 1000)}\n\`\`\``).join('\n\n')}

Rules: ${this.rules.content}

Output: Mermaid test matrix + TODO list (happy/edge/error cases per function).`;
    
    const planSession = await this.loop.createSession({ mode: 'plan', initialMessage: planPrompt });
    const plan = await planSession.runToCompletion();
    
    // 3. 사용자 승인 (UI)
    if (!await this.requestApproval(plan)) return { success: false, reason: 'Plan rejected' };
    
    // 4. 생성 실행 (Agent 모드, TODO 순회)
    const implPrompt = `Implement the approved test plan. Follow TODOs strictly.
- Write tests to ${sourceFiles[0].path}.test.ts
- Use existing patterns and utilities
- Run tests after each TODO to verify
- Stop when all TODOs done and tests pass.`;
    
    const implSession = await this.loop.createSession({ 
      mode: 'agent', 
      initialMessage: implPrompt,
      context: { plan, sourceFiles, existingTests },
      toolWhitelist: ['read_file', 'write_file', 'edit_file', 'run_terminal_cmd', 'read_lints', 'todo_write'],
      maxTurns: 20,
    });
    
    return await implSession.runToCompletion();
  }
}
```

### 4.3 실패 수정 루프 (`src/agents/testFixAgent.ts`)

```typescript
export class TestFixAgent {
  async fixFailures(failureLog: string): Promise<FixResult> {
    // 1. 실패 파싱
    const failures = this.parseFailures(failureLog);
    if (failures.length === 0) return { success: true, message: 'No failures found' };
    
    // 2. 로컬 재현
    const repro = await this.runner.runTest({ type: 'file', path: failures[0].file });
    if (repro.passed) return { success: false, message: 'Cannot reproduce locally (flaky?)' };
    
    // 3. 수정 루프 (최대 3회)
    for (let attempt = 1; attempt <= 3; attempt++) {
      const fixPrompt = `Fix failing test. Attempt ${attempt}/3.

FAILURE:
${JSON.stringify(failures[0], null, 2)}

RELEVANT SOURCE:
${await this.getRelevantSource(failures[0])}

INSTRUCTIONS:
1. Read the failing test and source code
2. Hypothesize root cause
3. Apply MINIMAL fix (edit_file)
4. Run the SAME test again
5. If passes, stop. If fails, retry with new hypothesis.`;
      
      const session = await this.loop.createSession({
        mode: 'agent',
        initialMessage: fixPrompt,
        toolWhitelist: ['read_file', 'edit_file', 'run_terminal_cmd', 'read_lints'],
        maxTurns: 5,
      });
      
      const result = await session.runToCompletion();
      const verify = await this.runner.runTest({ type: 'file', path: failures[0].file });
      
      if (verify.passed) return { success: true, attempts: attempt, fix: result };
    }
    
    return { success: false, message: 'Max retries exceeded', failures };
  }
}
```

---

## 5. UI/UX Specification

### 5.1 `/test:generate` 플로우
```
User: /test:generate src/auth/token.ts

🔍 Analyzing src/auth/token.ts...
📋 Found 3 functions: signJwt, verifyJwt, refreshToken
📖 Reading existing tests... (2 files, 45 tests)
📝 Generating test plan...

┌─ Test Plan: src/auth/token.ts ──────────────────────────────────────┐
│ ```mermaid                                                            │
│ graph TD                                                             │
│   signJwt --> Happy[Valid payload]                                   │
│   signJwt --> Edge[Empty payload]                                    │
│   signJwt --> Error[Invalid secret]                                  │
│   verifyJwt --> Happy[Valid token]                                   │
│   verifyJwt --> Edge[Expired token]                                  │
│   verifyJwt --> Error[Malformed token]                               │
│   refreshToken --> Happy[Valid refresh]                              │
│   refreshToken --> Error[Revoked token]                              │
│ ```                                                                   │
│                                                                       │
│ TODOs:                                                               │
│ ☐ signJwt: happy path                                                │
│ ☐ signJwt: edge cases (empty, long payload)                          │
│ ☐ signJwt: error cases (bad secret)                                  │
│ ☐ verifyJwt: happy path                                              │
│ ☐ verifyJwt: expired token                                           │
│ ☐ verifyJwt: malformed token                                         │
│ ☐ refreshToken: happy path                                           │
│ ☐ refreshToken: revoked token                                        │
│                                                                       │
│ [Approve & Generate]  [Modify Plan]  [Cancel]                        │
└───────────────────────────────────────────────────────────────────────┘

User clicks [Approve] → Agent generates → Runs tests → ✅ 8/8 passed
```

### 5.2 `/test:fix` 플로우
```
User: /test:fix (pastes CI log)

🔍 Parsing failure log... Found 1 failure:
   auth.test.ts > verifyJwt > expired token
   Error: Expected "TokenExpiredError", received "JsonWebTokenError"

🔄 Reproducing locally... ✓ Failed (same error)

🛠 Fix attempt 1/3:
   Hypothesis: verifyJwt throws JsonWebTokenError for expired, not TokenExpiredError
   Reading src/auth/token.ts:45...
   Fix: Catch JsonWebTokenError and check err.name === 'TokenExpiredError'
   Running test... ✅ PASSED

✅ Fixed in 1 attempt!
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Test Generation and Fix Loop

  Scenario: Generate tests for a module
    Given a source file with 3 exported functions
    When user runs "/test:generate src/utils.ts"
    Then plan shows test matrix for each function
    And after approval, test file created with 8 tests
    And all tests pass on first run

  Scenario: Fix failing test from CI log
    Given a CI failure log with stack trace
    When user runs "/test:fix" and pastes log
    Then failure parsed, reproduced locally
    And agent applies fix in <= 3 attempts
    And test passes on verification run

  Scenario: Flaky test detection
    Given a test that passes 50% of the time
    When agent runs it twice during fix loop
    Then agent reports "Flaky test detected" and suggests isolation

  Scenario: Coverage gap highlighting
    Given generated tests cover 70% of lines
    When generation complete
    Then report shows uncovered lines with suggestion to add edge cases
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-Tools-C_Terminal_Process.md` | 선행 | `run_terminal_cmd` 테스트 실행 |
| `PRD-Harness-10_Verification_MicroLoop.md` | 병행 | 수정 후 자동 검증 루프 |
| `PRD-06_Workspace_Tools.md` | 선행 | `read_lints`, `read_file`, `edit_file` |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | 프레임워크 감지 + Jest/Vitest/PyTest/Go/Cargo 러너 | `TestRunner` 인터페이스 구현체 |
| 2 | 테스트 플랜 생성 (Plan 모드) + 사용자 승인 UI | Mermaid + TODO 리스트 |
| 3 | 생성 실행 (Agent 모드) + 순차 검증 | 테스트 파일 생성 + 통과 |
| 4 | 실패 파싱 + 재현 + 수정 루프 (3회) | `/test:fix` 명령 동작 |
| 5 | 커버리지 리포트 파싱 + 갭 하이라이트 | 미커버 라인 UI 표시 |
| 6 | 규칙 파일(`.agentk/test-rules.md`) + 템플릿 지원 | 팀 커스터마이징 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| 테스트 실행 시간 과다 (대형 스위트) | 중간 | 타겟 단위 실행(`--testPathPattern`), 타임아웃 설정, 병렬 워커 |
| 플러키 테스트로 무한 루프 | 중간 | 2회 실행 불일치 시 플러키 플래그, 사용자 에스컬레이션 |
| 모킹 복잡도(DB, HTTP, 시간) | 높음 | 기존 테스트 패턴 학습, `test/utils` 공통 모킹 유틸 강제 사용 |

---


## Out of Scope

- Team MCP 마켓 풀 복제 / Cloud 상시 에이전트
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **A급: 테스트 생성 · 실패 수정 루프**
- Jest JSON Reporter: https://jestjs.io/docs/cli#--json
- Vitest API: https://vitest.dev/guide/api.html