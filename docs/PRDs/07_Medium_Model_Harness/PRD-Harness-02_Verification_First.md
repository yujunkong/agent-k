# PRD-Harness-02: Verification First (검증 우선 — 제한보다 먼저)

> **Category**: Medium Model Harness  
> **Phase**: C1~C4 (초기부터 적용)  
> **관련 PRD**: `PRD-Harness-01_Model_Tiers.md`, `PRD-Harness-08_Harness_Duties.md`, `PRD-Harness-10_Verification_MicroLoop.md`, `PRD-Infra-06_Hooks.md`

---

## 1. Overview

### 목적
**"못 하게 막기"보다 "추측하기 전에 한 번 더 확인하게" 만드는 것**이 핵심. 중급 모델(Flash, 소형 instruct)은 **도구 호출 전 검증 루프**를 강제해 실수를 줄인다.

### 핵심 원칙
| 기존 접근 (제한) | 하네스 접근 (검증) |
|------------------|-------------------|
| 도구 개수 제한, 위험 도구 금지 | **도구 호출 전**: "이 파일을 읽었나?" "확신이 있는가?" |
| 권한 레벨로 차단 | **도구 호출 후**: "린트 통과했나?" "테스트 통과했나?" |
| 모델 자율성 제한 | **모델 자율성 유지** + **검증 게이트**로 안전성 확보 |

### 비즈니스 가치
- **중급 모델 실용화**: Flash급도 검증 루프 덕분에 실무 투입 가능
- **오류 조기 발견**: 수정 후 즉시 린트/테스트로 회귀 방지
- **사용자 신뢰**: "고치고 테스트 돌리고 다시 고치는" 루프가 자동

---

## 2. Functional Requirements

### 2.1 검증 단계별 강제 게이트
| 단계 | 강제 사항 | 중급 모델(A 티어) | 강모델(B 티어) |
|------|-----------|-------------------|----------------|
| **조사 (Pre-edit)** | `edit_file` 전 해당 파일 **최근 읽기 필수** | ✅ 강제 (스테일니스 체크) | ✅ 강제 |
| **생각 (Pre-edit)** | `todo_write`로 "다음 한 줄 계획" 기록 필수 | ✅ 강제 (한 턴 한 계획) | 권장 |
| **확인 (Ambiguity)** | 불확실 시 `ask_question` 강제 (객관식) | ✅ 강제 (임계값 미달 시) | 선택 |
| **수정 (Edit)** | Search-Replace만 허용, 유일 매칭 검증 | ✅ 강제 | ✅ 강제 |
| **검증 (Post-edit)** | `read_lints` **자동 실행** → 에러 시 모델 재주입 | ✅ 강제 (최대 2회 재시도) | ✅ 강제 (1회) |
| **선택적 테스트** | 관련 테스트 자동 실행 (옵션) | 옵션 (설정) | ✅ 강제 (관련 테스트 1개) |

### 2.2 검증 마이크로 루프 (Verification Micro-loop)
```
edit_file 성공
    │
    ▼
read_lints 자동 실행 (PostToolUse 훅)
    │
    ├─ 에러 없음 → 턴 계속/종료
    │
    └─ 에러 있음
        │
        ▼
    에러 메시지 모델 주입 (tool_result로 주입)
        │
        ▼
    모델이 edit_file 재시도 (최대 N회)
        │
        ├─ 성공 → 턴 계속
        └─ N회 실패 → 사용자 개입 유도 (ask_question) / 턴 종료
```

---

## 3. Technical Spec

### 3.1 검증 훅 (`src/hooks/verificationHooks.ts`)

```typescript
// PreToolUse: 수정 전 검증
export const preEditVerificationHook: Hook = {
  id: 'pre-edit-verification',
  type: 'PreToolUse',
  priority: 15,
  condition: ctx => ctx.tool.name === 'edit_file' || ctx.tool.name === 'write_file',
  async execute(ctx) {
    const filePath = ctx.tool.args.path;
    
    // 1. 최근 읽기 확인 (Staleness check)
    const lastRead = fileReadCache.get(filePath);
    if (!lastRead || lastRead.mtime !== (await fs.stat(filePath)).mtimeMs) {
      return { 
        allow: false, 
        reason: `File ${filePath} not read recently or modified externally. Read it first.`,
        metadata: { missingRead: true, filePath }
      };
    }

    // 2. TODO 작성 강제 (A 티어)
    if (ctx.modeConfig.tier === 'A' && !ctx.hasTodoForCurrentEdit) {
      return {
        allow: false,
        reason: 'Tier A requires todo_write before edit. Plan the change first.',
        metadata: { requireTodo: true }
      };
    }

    // 3. 모호함 감지 → ask_question 강제
    if (ctx.tool.name === 'edit_file' && isAmbiguousEdit(ctx.tool.args)) {
      return {
        allow: false,
        reason: 'Edit is ambiguous (e.g., multiple matches). Ask user to clarify.',
        metadata: { requireClarification: true }
      };
    }

    return { allow: true };
  },
};

// PostToolUse: 수정 후 자동 린트/테스트
export const postEditVerificationHook: Hook = {
  id: 'post-edit-verification',
  type: 'PostToolUse',
  priority: 10,
  condition: ctx => ctx.tool.name === 'edit_file' || ctx.tool.name === 'write_file',
  async execute(ctx) {
    if (!ctx.toolResult.success) return { allow: true }; // 실패면 검증 건너뜀

    const config = getVerificationConfig(ctx.tier);
    if (!config.autoLint) return { allow: true };

    const filePath = ctx.tool.args.path;
    const lintResult = await runLints(filePath);
    
    if (lintResult.errors.length > 0) {
      // 린트 에러를 tool_result로 주입 → 모델이 다음 턴에서 수정
      return {
        allow: true,
        modifiedResult: {
          ...ctx.toolResult,
          output: `${ctx.toolResult.output}\n\n## Lint Errors (auto-detected):\n${lintResult.errors.map(e => `${e.line}:${e.column} ${e.message}`).join('\n')}`,
          metadata: { 
            ...ctx.toolResult.metadata, 
            lintErrors: lintResult.errors,
            verificationRetryCount: (ctx.toolResult.metadata?.verificationRetryCount || 0) + 1
          }
        }
      };
    }
    return { allow: true };
  },
};
```

### 3.2 검증 설정 (`src/config/verification.ts`)

```typescript
export interface VerificationConfig {
  autoLint: boolean;           // 수정 후 자동 린트
  autoTest: boolean;           // 수정 후 관련 테스트 실행
  maxVerificationRetries: number; // 최대 재시도 횟수
  requireTodoBeforeEdit: boolean; // 수정 전 todo 강제
  requireReadBeforeEdit: boolean; // 수정 전 읽기 강제
  ambiguityThreshold: number;   // 모호함 임계값 (0~1)
}

export const VERIFICATION_CONFIG: Record<ModelTier, VerificationConfig> = {
  A: {  // Flash / 중급 모델
    autoLint: true,
    autoTest: false,           // 옵션
    maxVerificationRetries: 2,
    requireTodoBeforeEdit: true,
    requireReadBeforeEdit: true,
    ambiguityThreshold: 0.7,   // 낮게 = 더 엄격
  },
  B: {  // Pro / 강모델
    autoLint: true,
    autoTest: true,            // 관련 테스트 1개 자동 실행
    maxVerificationRetries: 1,
    requireTodoBeforeEdit: false, // 선택
    requireReadBeforeEdit: true,
    ambiguityThreshold: 0.5,
  },
  C: {  // Base / 채팅만
    autoLint: false,
    autoTest: false,
    maxVerificationRetries: 0,
    requireTodoBeforeEdit: false,
    requireReadBeforeEdit: false,
    ambiguityThreshold: 0.3,
  },
};
```

### 3.3 모호함 감지 (`src/utils/ambiguityDetector.ts`)

```typescript
function isAmbiguousEdit(args: EditArgs): boolean {
  const { search, replace } = args;
  
  // 1. Search 블록이 너무 짧음 (3줄 미만)
  if (search.split('\n').length < 3) return true;
  
  // 2. Search가 파일에서 여러 번 매칭됨
  const fileContent = readFileSync(args.path, 'utf8');
  const matches = countOccurrences(fileContent, search);
  if (matches > 1) return true;
  
  // 3. Replace가 Search와 거의 동일 (실질적 변경 없음)
  if (similarity(search, replace) > 0.95) return true;
  
  // 4. Replace가 빈 문자열 (삭제만 하는 경우) — 허용하지만 경고
  if (!replace.trim() && search.trim()) return false; // 삭제는 허용
  
  return false;
}
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Verification First

  Scenario: Tier A requires read before edit
    Given Tier A model
    When model calls edit_file on src/auth.ts without prior read_file
    Then pre-edit hook rejects with "File not read recently"
    And model must call read_file first

  Scenario: Tier A requires todo before edit
    Given Tier A model
    When model calls edit_file without todo_write in current turn
    Then pre-edit hook rejects with "todo_write required"
    And model must call todo_write first

  Scenario: Auto-lint triggers on edit error
    Given autoLint = true
    When model edits file introducing syntax error
    Then post-edit hook runs linter automatically
    And lint errors injected as tool_result
    And model retries edit (max 2 retries)

  Scenario: Max retries exceeded escalates to user
    Given maxVerificationRetries = 2
    And model fails lint 3 times
    Then ask_question injected: "Unable to fix lint errors after 3 attempts. Need guidance?"
    And turn ends

  Scenario: Ambiguous edit triggers ask_question
    Given edit_file with search block matching 3 locations
    When pre-edit hook runs
    Then hook rejects with "Ambiguous edit: 3 matches. Ask user to clarify."
    And ask_question tool suggested with options: [Fix first match, Fix all, Cancel]

  Scenario: Tier B gets auto-test
    Given Tier B model with autoTest = true
    When model edits test file
    Then related test automatically runs (e.g., jest src/auth.test.ts)
    And test failures injected as tool_result
```

---


## Out of Scope

- 프론티어 모델 전용 ‘자율 만능’ 설계를 Tier A에 그대로 적용
- 상세: `00_Master_Context.md` + Harness-14

## 4. References

- `PRD-Harness-08_Harness_Duties.md` — 하네스가 대신하는 일들
- `PRD-Harness-10_Verification_MicroLoop.md` — 수정 후 자동 검증 루프 상세
- `PRD-Infra-06_Hooks.md` — Pre/Post 훅 아키텍처
- `PRD-Harness-01_Model_Tiers.md` — 티어별 검증 강도 차이