# PRD-Infra-13: Error Recovery (에러 복구)

> **Category**: Core Infrastructure  
> **Phase**: C3~C4 (멀티턴 루프 안정화)  
> **관련 PRD**: `PRD-C3_Agent_MultiTurn.md`, `PRD-Infra-11_Doom_Loop_Detection.md`, `PRD-Infra-12_MaxTurns_Timeout_Stop.md`, `PRD-Harness-10_Verification_MicroLoop.md`

---

## 1. Overview

### 목적
도구 실행 실패·모델 출력 파싱 실패·네트워크 오류 등을 **루프 중단 없이 복구**해, 에이전트가 **"실수 → 수정 → 재시도"** 사이클을 자율 완수하게 한다.

### 비즈니스 가치
- **자율성 향상**: 에러 나면 멈추는 게 아니라 스스로 고쳐 다시 시도
- **중급 모델 보완**: Flash급 모델이 JSON 파싱/도구 인자 실수해도 루프 유지
- **사용자 개입 최소화**: "에러 나서 멈췄네" 대신 "잠깐 고치고 다시 해볼게" UX

---

## 2. Functional Requirements

### 2.1 복구 대상 에러 분류
| 에러 유형 | 감지 지점 | 복구 전략 | 최대 재시도 |
|-----------|-----------|-----------|-------------|
| **도구 실행 에러** | `toolResult.error === true` | 에러 메시지 모델 주입 → 모델이 인자 수정 재시도 | 2회 |
| **JSON 파싱 실패** | 모델 응답에서 `tool_calls` 파싱 실패 | `Spec-01` 파서: 펜스 추출 → 재파싱 → 1회 재요청 | 1회 |
| **도구 인자 검증 실패** | `zod.safeParse` 실패 | 검증 에러 메시지 모델 주입 → 재시도 | 2회 |
| **툴콜 파싱 실패(펜스/불완전 JSON)** | 스트리밍 중 `tool_calls` 파싱 실패 | 펜스 추출 → 재파싱 → 1회 재요청 | 1회 |
| **네트워크/타임아웃** | 도구 실행 중 `TimeoutError`, `ECONNREFUSED` | 지수 백오프(1s, 2s, 4s) 후 재시도 | 3회 |
| **파일 시스템 에러** | `ENOENT`, `EACCES`, `EISDIR` | 에러 메시지 모델 주입 → 경로 수정/권한 확인 재시도 | 2회 |

### 2.2 복구 플로우
```
도구 실행 / 모델 응답
    │
    ├─ 성공 → 다음 단계
    │
    └─ 실패
        │
        ├─ 복구 가능 에러?
        │     │
        │     ├─ Yes → 재시도 카운트 < 최대?
        │     │         │
        │     │         ├─ Yes → 에러 메시지 주입 → 같은 턴에서 재시도
        │     │         │
        │     │         └─ No → 사용자 개입 유도 (ask_question) / 턴 종료
        │     │
        │     └─ No → 치명적 에러 → 턴 중단 → 사용자 알림
        │
        └─ 재시도 루프 (최대 N회)
```

---

## 3. Technical Spec

### 3.1 에러 분류 & 복구 정책 (`src/infra/errorRecovery.ts`)

```typescript
export enum ErrorCategory {
  TOOL_EXECUTION = 'tool_execution',       // 도구 실행 중 에러
  JSON_PARSE = 'json_parse',               // 모델 응답 JSON 파싱 실패
  SCHEMA_VALIDATION = 'schema_validation', // 도구 인자 스키마 검증 실패
  NETWORK = 'network',                     // 네트워크/타임아웃
  FILE_SYSTEM = 'file_system',             // 파일 시스템 에러
  PERMISSION = 'permission',               // 권한 에러 (EACCES 등)
  UNKNOWN = 'unknown',
}

export interface RecoveryPolicy {
  category: ErrorCategory;
  maxRetries: number;
  backoffMs: number;           // 지수 백오프 기본값 (ms)
  retryable: boolean;          // 재시도 가능 여부
  injectErrorToModel: boolean; // 에러 메시지를 모델에 주입할지
  escalateToUser: boolean;     // 최대 재시도 초과 시 사용자 개입
}

export const RECOVERY_POLICIES: Record<ErrorCategory, RecoveryPolicy> = {
  tool_execution:     { category: 'tool_execution', maxRetries: 2, backoffMs: 1000, retryable: true,  injectErrorToModel: true,  escalateToUser: true },
  json_parse:         { category: 'json_parse',       maxRetries: 1, backoffMs: 500,   retryable: true,  injectErrorToModel: true,  escalateToUser: false },
  schema_validation:  { category: 'schema_validation',maxRetries: 2, backoffMs: 500,   retryable: true,  injectErrorToModel: true,  escalateToUser: true },
  network:            { category: 'network',          maxRetries: 3, backoffMs: 1000,  retryable: true,  injectErrorToModel: false, escalateToUser: true },
  file_system:        { category: 'file_system',      maxRetries: 2, backoffMs: 500,   retryable: true,  injectErrorToModel: true,  escalateToUser: true },
  permission:         { category: 'permission',       maxRetries: 1, backoffMs: 1000,  retryable: false, injectErrorToModel: true,  escalateToUser: true },
  unknown:            { category: 'unknown',          maxRetries: 1, backoffMs: 2000,  retryable: true,  injectErrorToModel: true,  escalateToUser: true },
};

export function categorizeError(err: Error, context: ErrorContext): ErrorCategory {
  if (err.name === 'TimeoutError' || err.name === 'AbortError' || err.message.includes('timeout')) return 'network';
  if (err.name === 'ZodError' || err.message.includes('validation')) return 'schema_validation';
  if (err.name === 'SyntaxError' || err.message.includes('JSON')) return 'json_parse';
  if (err.code && ['ENOENT', 'EACCES', 'EISDIR', 'EPERM', 'ENOTDIR'].includes(err.code)) return 'file_system';
  if (err.code === 'EACCES' || err.code === 'EPERM') return 'permission';
  if (err.message.includes('tool_calls') || err.message.includes('tool_call')) return 'json_parse';
  return 'tool_execution';
}
```

### 3.2 복구 실행기 (`src/agent/errorRecovery.ts`)

```typescript
export class ErrorRecoveryExecutor {
  constructor(
    private toolExecutor: ToolExecutor,
    private provider: LLMProvider,
    private config: RecoveryConfig
  ) {}

  async executeWithRecovery(
    toolCall: ToolCall,
    ctx: ToolContext
  ): Promise<ToolResult> {
    let lastError: Error | null = null;
    const policy = RECOVERY_POLICIES[this.categorizeError(null, { toolCall })];
    
    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      try {
        // 1. 도구 실행 시도
        const result = await this.toolExecutor.execute(toolCall, ctx);
        if (result.error) throw new Error(result.output);  // 도구 내부 에러도 에러로 처리
        return result;  // 성공
        
      } catch (err) {
        lastError = err as Error;
        const category = this.categorizeError(err, { toolCall });
        const policy = RECOVERY_POLICIES[category];
        
        // 재시도 불가능 또는 최대 재시도 초과
        if (!policy.retryable || attempt >= policy.maxRetries) {
          return this.createErrorResult(toolCall.id, err, category, attempt);
        }

        // 2. 백오프 대기
        await this.sleep(policy.backoffMs * Math.pow(2, attempt));

        // 3. 모델에 에러 주입하여 재시도 유도 (injectErrorToModel = true인 경우)
        if (policy.injectErrorToModel) {
          const errorMsg = this.formatErrorForModel(err, category, attempt + 1);
          // 현재 턴의 messages에 에러 주입하여 즉시 재시도 유도
          ctx.messages.push({
            role: 'tool',
            tool_call_id: `retry-${toolCall.id}-${attempt}`,
            content: `Previous attempt failed: ${err.message}\n\nPlease fix and retry. Attempt ${attempt + 1}/${policy.maxRetries}.`,
          });
          
          // 도구 인자 수정 유도: 스키마 검증 에러면 구체적 힌트 추가
          if (category === 'schema_validation') {
            ctx.messages.push({
              role: 'system',
              content: `Schema validation error: ${err.message}. Required fields: ${this.getRequiredFields(toolCall.name)}`
            });
          }
        }

        // 네트워크/파일시스템 에러면 백오프 후 단순 재시도 (메시지 주입 안 함)
        continue;
      }
    }

    // 최대 재시도 초과
    return this.createErrorResult(toolCall.id, lastError!, 'max_retries_exceeded', policy.maxRetries);
  }

  private formatErrorForModel(err: Error, category: ErrorCategory, attempt: number): string {
    const prefix = `[Recovery Attempt ${attempt}] `;
    switch (category) {
      case 'json_parse':
        return `${prefix}Your previous response had invalid JSON for tool_calls. Please output ONLY valid JSON for tool_calls. Error: ${err.message}`;
      case 'schema_validation':
        return `${prefix}Tool arguments failed validation. ${err.message}. Please check required fields and types.`;
      case 'tool_execution':
        return `${prefix}Tool execution failed: ${err.message}. Please check arguments and retry.`;
      case 'file_system':
        return `${prefix}File operation failed: ${err.message}. Check path exists and permissions.`;
      default:
        return `${prefix}Error: ${err.message}. Please adjust and retry.`;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 3.2 JSON 파싱 복구 (`src/infra/toolCallParser.ts`)

```typescript
export function parseToolCallsWithRecovery(text: string): ToolCall[] {
  // 1. 네이티브 tool_calls 파싱 시도
  try {
    return extractNativeToolCalls(text);
  } catch {}

  // 2. XML/펜스 형태 추출 시도
  const fenceMatches = text.matchAll(/```(?:json|tool_calls)?\n([\s\S]*?)\n```/g);
  for (const match of fenceMatches) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed) && parsed.every(isValidToolCall)) return parsed;
      if (isValidToolCall(parsed)) return [parsed];
    } catch {}
  }

  // 3. 텍스트 내 JSON 객체 스캔 (탐욕적)
  const jsonObjects = extractJsonObjects(text);
  for (const obj of jsonObjects) {
    if (isValidToolCall(obj)) return [obj];
    if (Array.isArray(obj) && obj.every(isValidToolCall)) return obj;
  }

  // 4. 완전 실패 → 빈 배열 (상위에서 에러 처리)
  return [];
}

function isValidToolCall(obj: any): boolean {
  return obj && typeof obj === 'object' && 
         typeof obj.name === 'string' && 
         typeof obj.arguments === 'object' &&
         obj.id && typeof obj.id === 'string';
}
```

### 3.3 에이전트 루프 통합 (`src/agent/loop.ts`)

```typescript
export class AgentLoop {
  private recoveryExecutor = new ErrorRecoveryExecutor(this.toolExecutor, this.provider);

  async *run(initialMessages: ChatMessage[]): AsyncGenerator<TurnEvent> {
    // ... 기존 루프 ...
    
    // 도구 실행 시 복구 실행기 사용
    const results = await this.recoveryExecutor.executeWithRecovery(
      toolCall, 
      { ...ctx, messages }
    );
    
    // 복구 결과 처리
    if (result.recovered) {
      yield { type: 'recovery', attempt: result.attempt, message: `Recovered after ${result.attempt} retries` };
    }
    if (result.escalated) {
      // 최대 재시도 초과 → 사용자 개입 유도
      const userGuidance = await this.askUserForGuidance(result.error, result.category);
      if (userGuidance) {
        messages.push({ role: 'user', content: userGuidance });
        continue; // 같은 턴에서 재시도
      }
    }
  }
}
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Error Recovery

  Scenario: Tool execution error triggers retry
    Given model calls edit_file with wrong search block
    When tool returns "Search block not found"
    Then error categorized as "tool_execution"
    And model receives error message in next turn
    And model retries with corrected search block
    And succeeds on 2nd attempt

  Scenario: JSON parse failure recovery
    Given model outputs malformed tool_calls JSON (trailing comma)
    When parser fails on first pass
    Then fence extraction attempted
    And valid JSON extracted from code fence
    And tool calls executed successfully
    And no user-facing error

  Scenario: Schema validation error triggers retry with hint
    Given model calls edit_file with missing required field "replace"
    When zod validation fails
    Then error categorized as "schema_validation"
    And model receives "Missing required field: replace"
    And model retries with correct schema
    And succeeds on 2nd attempt

  Scenario: Network timeout triggers backoff retry
    Given web_search tool times out after 30s
    When timeout error caught
    Then categorized as "network"
    And exponential backoff: 1s, 2s, 4s
    And retries up to 3 times
    And succeeds on 2nd retry

  Scenario: Max retries exceeded escalates to user
    Given edit_file fails 3 times (maxRetries=2)
    When 3rd attempt fails
    Then escalation to user: "Edit failed 3 times. What should I do?"
    And user can: give hint / abort / try different approach

  Scenario: Permission error not retried
    Given edit_file on read-only file
    When EACCES error
    Then categorized as "permission"
    And retryable = false
    And immediate escalation to user
    And no automatic retry
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 5. References

- `PRD-C3_Agent_MultiTurn.md` — 멀티턴 루프에서 복구 실행
- `PRD-Infra-11_Doom_Loop_Detection.md` — 재시도 카운터와 둠 루프 구분
- `PRD-Spec-01_Provider_ToolJSON.md` — JSON 파싱 복구 상세
- `PRD-Harness-10_Verification_MicroLoop.md` — 수정 후 자동 검증과 연동