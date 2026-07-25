# PRD-Harness-10: Verification Micro-Loop (검증 마이크로루프)

> **Category**: Medium Model Harness  
> **Phase**: C2 (첫 쓰기부터) ~ C4 (자동화 완성)  
> **관련 PRD**: `PRD-Harness-02_Verification_First.md`, `PRD-Infra-06_Hooks.md`, `PRD-Infra-13_Error_Recovery.md`, `PRD-C2_Agent_SingleTurn.md`, `PRD-Harness-06_A_Tier_Whitelist.md`

---

## 📋 Quick Reference

| 항목 | 값 |
|------|-----|
| **구현 단계** | C2~C4 |
| **예상 소요** | 2-3일 |
| **핵심 파일** | `src/hooks/autoVerificationHook.ts`, `src/verification/`, `src/tools/lint/` |
| **테스트 명령** | `npm test -- src/hooks/autoVerificationHook.test.ts`, `npm run test:e2e -- tests/e2e/verification-microloop.spec.ts` |
| **완료 기준** | Tier A에서 edit 후 자동 lint → 에러 주입 → 재시도 → 통과, 1회 재시도 성공률 80%+ |

---

## 1. Overview

### 목적
`edit_file`/`write_file` **즉시 직후** 자동으로 `read_lints` (선택적 테스트) 실행 → **에러 있으면 tool_result로 모델에 재주입** → 모델이 **같은 턴 또는 다음 턴에서 즉시 재시도** → 통과할 때까지 **최대 N회** 반복.

### 비즈니스 가치
- **자동 품질 게이트**: "고치고 테스트 돌리고 다시 고치는" 루프를 사람이 아닌 하네스가 담당
- **중급 모델 보완**: Flash가 "고쳤으니까 됐겠지" 하고 넘어가는 것 방지
- **회귀 방지**: 수정 후 즉시 검증으로 회귀 버그 즉시 감지

---

## 2. Sequence Diagram: Verification Micro-Loop Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Loop as AgentLoopController
    participant Executor as ToolExecutor
    participant Applier as PatchApplier
    participant Hooks as HookSystem
    participant Lint as LintRunner
    participant Test as TestRunner
    participant Provider as LLM Provider
    participant ChatUI as Chat Webview
    
    User->>Loop: "Fix the login bug"
    Loop->>Provider: chatCompletionStream(tools=[edit_file, read_file...])
    Provider-->>Loop: tool_call: edit_file(src/auth.ts, ...)
    Loop->>Executor: execute(edit_file)
    Executor->>Applier: apply(patch)
    Applier-->>Executor: ApplyResult {success: true, diff}
    Executor-->>Loop: ToolResult {success: true, output}
    
    Loop->>Hooks: runPostToolUse(edit_file, result, ctx)
    
    par Auto-Verification (PostToolUse Hook)
        Hooks->>Lint: runLints(touchedFiles)
        Lint-->>Hooks: LintResult {errors: [...]}
        alt Lint Errors Found
            Hooks->>Hooks: injectVerificationError(errors, retryCount=1, 'lint')
            Hooks-->>Loop: Modified ToolResult with lint errors appended
            Loop->>ChatUI: tool_result (with lint errors)
            ChatUI->>ChatUI: show verification badge in timeline
            
            Loop->>Provider: chatCompletionStream(messages + lint errors)
            Provider-->>Loop: tool_call: edit_file (fix attempt)
            Loop->>Executor: execute(edit_file fix)
            Executor->>Applier: apply(fixPatch)
            Applier-->>Executor: success
            Executor-->>Loop: ToolResult {success: true}
            
            Loop->>Hooks: runPostToolUse(edit_file, fixResult, ctx)
            Hooks->>Lint: runLints(touchedFiles)
            Lint-->>Hooks: LintResult {errors: []}
            Hooks-->>Loop: allow: true
            Loop->>ChatUI: tool_result (clean)
            ChatUI->>ChatUI: timeline "✓ Verified" badge
        else No Lint Errors
            Hooks-->>Loop: allow: true
        end
    end
    
    alt Auto-Test Enabled (Tier B)
        Hooks->>Test: findRelatedTestCommand(file)
        Test-->>Hooks: "npm test -- tests/auth.test.ts"
        Hooks->>Test: runTest(cmd, timeout=60s)
        Test-->>Hooks: TestResult {failed: true, output}
        alt Test Failed
            Hooks->>Hooks: injectVerificationError(testOutput, retryCount, 'test')
            Hooks-->>Loop: Modified ToolResult
            Loop->>Provider: next turn with test failure
            ... (retry loop)
        end
    end
    
    Loop->>ChatUI: final response
    ChatUI->>User: "Fixed! Lint verified ✓"
```

---

## 3. Functional Requirements

### 3.1 마이크로 루프 플로우
```
edit_file 성공
    │
    ▼
PostToolUse 훅: auto-lint 실행 (read_lints on touched files)
    │
    ├─ 에러 없음 → 턴 계속/종료
    │
    └─ 에러 있음
        │
        ▼
    tool_result에 린트 에러 주입 (metadata.verificationRetryCount++)
        │
        ▼
    모델이 다음 턴에서 에러 보고 재시도 (edit_file 재호출)
        │
        ├─ 성공 + 린트 통과 → 턴 계속
        │
        └─ 실패 (재시도 횟수 < maxRetries)
            │
            ▼
            재귀 반복 (최대 N회)
            │
            └─ N회 초과 → ask_question으로 사용자 개입 유도 / 턴 종료
```

### 3.2 설정 (`package.json` configuration)

```json
{
  "agentK.verification.autoLint": { "type": "boolean", "default": true },
  "agentK.verification.autoTest": { "type": "boolean", "default": false },
  "agentK.verification.maxRetries": { "type": "integer", "default": 2, "minimum": 0, "maximum": 5 },
  "agentK.verification.allowedTestCommands": {
    "type": "array",
    "items": { "type": "string" },
    "default": ["npm test", "pytest", "go test", "cargo test"]
  },
  "agentK.verification.testTimeoutMs": { "type": "integer", "default": 60000 }
}
```

### 3.3 티어별 기본값

| 티어 | autoLint | autoTest | maxRetries | 비고 |
|------|----------|----------|------------|------|
| **A (Flash)** | `true` | `false` (옵션) | `2` | 강제 |
| **B (Pro)** | `true` | `true` (관련 테스트 1개) | `1` | 선택적 |
| **C (Base)** | `false` | `false` | `0` | 비활성 |

---

## 4. Technical Spec

### 4.1 PostToolUse 훅: 자동 검증 (`src/hooks/autoVerificationHook.ts`)

```typescript
export const autoVerificationHook: Hook = {
  id: 'auto-verification',
  type: 'PostToolUse',
  priority: 10,  // 린트/테스트 훅 중 가장 먼저
  condition: ctx => {
    const config = getVerificationConfig(ctx.tier);
    return (ctx.tool.name === 'edit_file' || ctx.tool.name === 'write_file') 
      && ctx.toolResult.success 
      && (config.autoLint || config.autoTest);
  },
  
  async execute(ctx) {
    const config = getVerificationConfig(ctx.tier);
    const filePath = ctx.tool.args.path;
    const retries = ctx.toolResult.metadata?.verificationRetryCount || 0;
    
    // 1. 자동 린트
    if (config.autoLint) {
      const lintResult = await runLints(filePath);
      if (lintResult.errors.length > 0) {
        return injectVerificationError(ctx, lintResult, retries + 1, 'lint');
      }
    }
    
    // 2. 자동 테스트 (옵션, Tier B만 기본)
    if (config.autoTest && retries < config.maxRetries) {
      const testCmd = findRelatedTestCommand(filePath, config.allowedTestCommands);
      if (testCmd) {
        const testResult = await runTest(testCmd, config.testTimeoutMs);
        if (testResult.failed) {
          return injectVerificationError(ctx, testResult, retries + 1, 'test');
        }
      }
    }
    
    return { allow: true };
  }
};

function injectVerificationError(ctx: HookContext, result: LintResult | TestResult, retryCount: number, type: 'lint' | 'test'): HookResult {
  const errorBlock = type === 'lint' 
    ? `## Lint Errors (auto-detected after edit):\n${result.errors.map(e => `${e.file}:${e.line}:${e.column} ${e.message}`).join('\n')}`
    : `## Test Failure (auto-detected after edit):\n${result.output}`;
  
  return {
    allow: true,
    modifiedResult: {
      ...ctx.toolResult,
      output: `${ctx.toolResult.output}\n\n${errorBlock}`,
      metadata: {
        ...ctx.toolResult.metadata,
        verificationRetryCount: retryCount,
        verificationType: type,
        verificationErrors: type === 'lint' ? result.errors : result.failures,
      }
    }
  };
}
```

### 4.2 모델에 주입되는 에러 포맷

```markdown
## Lint Errors (auto-detected after edit):
src/auth.ts:42:15 Error: 'user' is declared but never used.
src/auth.ts:45:3 Error: Missing return type on function.

--- 
This is verification attempt 1/2. Please fix the errors and retry the edit.
```

### 4.3 테스트 명령 자동 탐지 (`src/verification/testFinder.ts`)

```typescript
export function findRelatedTestCommand(filePath: string, allowed: string[]): string | null {
  // 1. 같은 디렉터리 *.test.ts / *.spec.ts
  const testFiles = glob.sync(path.join(path.dirname(filePath), '*.{test,spec}.{ts,js}'));
  if (testFiles.length > 0) {
    return detectTestRunner(filePath); // npm test / jest / vitest / pytest 등
  }
  
  // 2. 미러 디렉터리 (src/ → test/, tests/, __tests__/)
  const mirrors = ['test', 'tests', '__tests__', 'spec'];
  for (const mirror of mirrors) {
    const mirrored = filePath.replace(/^src\//, `${mirror}/`);
    if (fs.existsSync(mirrored)) {
      return detectTestRunner(mirrored);
    }
  }
  
  // 3. 허용된 명령어 중 프로젝트 루트에서 실행 가능한 것
  for (const cmd of allowed) {
    if (canRunCommand(cmd)) return cmd;
  }
  
  return null;
}
```

---

## 5. Acceptance Criteria

```gherkin
Feature: Verification Micro-Loop

  Scenario: Auto-lint triggers on edit error and model retries
    Given autoLint = true, maxRetries = 2
    And user asks "Add null check to getUser function"
    When model edits src/auth.ts but introduces syntax error
    Then auto-lint hook runs after edit
    And lint error injected as tool_result
    And model retries edit with fix in next turn
    And lint passes on 2nd attempt

  Scenario: Max retries exceeded escalates to user
    Given maxRetries = 2
    And model fails lint 3 times consecutively
    When 3rd retry fails
    Then ask_question injected: "Unable to fix lint after 3 attempts. Need guidance?"
    And turn ends

  Scenario: Auto-test runs related test after edit (Tier B)
    Given Tier B model, autoTest = true
    And user asks "Fix the login bug"
    When model edits src/auth.ts
    Then related test (tests/auth.test.ts) automatically runs
    And test failure injected as tool_result
    And model retries until test passes

  Scenario: Auto-test skipped for Tier A
    Given Tier A model, autoTest = false (default)
    When model edits file
    Then no test runs automatically
    And only lint verification runs

  Scenario: Retry count tracked in metadata
    Given edit fails lint, model retries
    When 2nd attempt
    Then tool_result.metadata.verificationRetryCount = 2
    And model sees "verification attempt 2/2"
```

---

## 6. Test Plan

| 테스트 파일 | 설명 | 커버리지 목표 |
|------------|------|---------------|
| `src/hooks/autoVerificationHook.test.ts` | 훅 조건/실행/에러 주입 로직 | 95% |
| `src/verification/testFinder.test.ts` | 테스트 파일 탐지 (미러 디렉터리, 허용 명령어) | 90% |
| `src/verification/lintRunner.test.ts` | `read_lints` 실행, 결과 파싱 | 90% |
| `tests/e2e/verification-microloop.spec.ts` | E2E: edit → lint error → retry → pass | E2E |

### 실행 명령어
```bash
# 단위 테스트
npm test -- src/hooks/autoVerificationHook.test.ts
npm test -- src/verification/testFinder.test.ts
npm test -- src/verification/lintRunner.test.ts

# E2E 테스트
npm run test:e2e -- tests/e2e/verification-microloop.spec.ts

# 전체 테스트 + 커버리지
npm test -- --coverage
```

---

## 7. Implementation Checklist

| 단계 | 작업 | 파일 생성/수정 | 완료 기준 |
|------|------|----------------|-----------|
| 1 | `VerificationConfig` 타입 + 설정 기본값 | `src/verification/config.ts` (신규) | 타입스크립트 컴파일 통과 |
| 2 | `LintRunner` 구현 (`vscode.languages.getDiagnostics`) | `src/verification/lintRunner.ts` (신규) | 린트 에러 정확히 감지 |
| 3 | `TestFinder` + `TestRunner` 구현 | `src/verification/testFinder.ts`, `testRunner.ts` (신규) | 관련 테스트 파일 자동 탐지 |
| 4 | `autoVerificationHook` PostToolUse 훅 등록 | `src/hooks/autoVerificationHook.ts` (신규) | 훅 시스템에 등록, 우선순위 10 |
| 5 | `injectVerificationError` 헬퍼 | `src/hooks/autoVerificationHook.ts` | 에러 블록 정확히 주입, metadata 증가 |
| 6 | Tier별 설정 분기 (`getVerificationConfig`) | `src/verification/config.ts` | Tier A: lint만, Tier B: lint+test |
| 7 | 재시도 카운트 초과 시 `ask_question` 주입 | `src/hooks/autoVerificationHook.ts` | 3회 실패 시 사용자 개입 유도 |
| 8 | 통합 테스트: Tier A 5개 시나리오 통과 | `tests/e2e/verification-microloop.spec.ts` | CI 그린 |

---

## 8. Debugging Tips

```bash
# 1. 훅 실행 로그 확인
# Extension 콘솔 (F12 → Console):
[HOOK] auto-verification: condition=true, tool=edit_file, tier=A
[HOOK] auto-verification: running lint on src/auth.ts
[HOOK] auto-verification: lint errors found: 2
[HOOK] auto-verification: injecting verification error, retryCount=1

# 2. 모델에 주입된 메시지 확인
# Webview 콘솔:
verificationRetryCount: 1
verificationType: "lint"
verificationErrors: [{file: "src/auth.ts", line: 42, ...}]

# 3. 테스트 탐지 디버그
# Extension 콘솔:
[TEST-FINDER] mirrors checked: test/, tests/, __tests__/
[TEST-FINDER] detected runner: npm test -- tests/auth.test.ts
[TEST-RUNNER] running: npm test -- tests/auth.test.ts (timeout: 60000ms)
```

---

## Out of Scope

- 프론티어 모델 전용 '자율 만능' 설계를 Tier A에 그대로 적용
- 상세: `00_Master_Context.md` + Harness-14

## References

- `PRD-Harness-02_Verification_First.md` — 검증 우선 철학
- `PRD-Infra-06_Hooks.md` — PostToolUse 훅 아키텍처
- `PRD-Infra-13_Error_Recovery.md` — 에러 복구와 연동
- `PRD-Harness-06_A_Tier_Whitelist.md` — Tier A 강제 검증 설정
- `PRD-C2_Agent_SingleTurn.md` — C2 구현과 연동