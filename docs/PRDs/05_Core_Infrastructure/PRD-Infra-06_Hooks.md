# PRD-Infra-06: Hooks (Pre/Post Tool Hooks)

> **Category**: Core Infrastructure  
> **Phase**: C4 (인프라 완성 단계)  
> **관련 PRD**: `PRD-Infra-04_Tool_Registry.md`, `PRD-Infra-05_Permission_Autorun.md`, `PRD-Harness-10_Verification_MicroLoop.md`, `PRD-14_Agent_Review_Bugbot.md`

---

## 1. Overview

### 목적
도구 실행 전후에 **횡단 관심사(Cross-cutting concerns)**를 처리하는 훅 파이프라인을 제공한다. 보안 스캔, 시크릿 마스킹, 로깅, 캐시 무효화, 자동 검증 등을 도구 코드 수정 없이 플러그인 방식으로 추가한다.

### 비즈니스 가치
- **보안**: 시크릿 유출 방지, 위험 명령 차단을 모든 도구에 일괄 적용
- **관찰가능성**: 모든 도구 호출/결과 중앙 로깅, 성능 메트릭 수집
- **자동화**: 수정 후 린트/테스트 자동 실행, 캐시 무효화 등 반복 작업 제거
- **확장성**: 팀/프로젝트별 커스텀 훅 플러그인 가능

---

## 2. Functional Requirements

### 2.1 훅 타입 및 실행 시점
| 훅 타입 | 실행 시점 | 용도 | 중단 가능 |
|---------|-----------|------|-----------|
| `PreToolUse` | 도구 실행 직전 (인자 검증 후) | 차단/인자 수정/시크릿 스캔/권한 재확인 | ✅ `allow: false`로 중단 |
| `PostToolUse` | 도구 실행 직후 (결과 반환 전) | 결과 검증/로깅/캐시 무효화/자동 검증 트리거 | ❌ (결과 수정만 가능) |
| `PreModelCall` | 모델 호출 직전 | 컨텍스트 조립 감시/토큰 카운트/프롬프트 주입 | ✅ 컨텍스트 수정 가능 |
| `PostModelCall` | 모델 응답 수신 직후 | 파싱 검증/토큰 사용량 기록/툴콜 사전 검증 | ✅ 툴콜 보정 가능 |

### 2.2 훅 실행 순서 및 체인
```
PreToolUse 훅들 (우선순위 순)
  → 하나라도 allow=false 면 중단 → tool_result: {error: "blocked by hook"}
  → 모두 allow=true 면 도구 실행
    → 실행 성공/실패
    → PostToolUse 훅들 (우선순위 순)
      → 결과 수정 가능 (metadata 추가, 에러 보정 등)
      → 최종 tool_result 반환
```

### 2.3 내장 훅 (Built-in Hooks)
| 훅 ID | 타입 | 우선순위 | 기능 |
|-------|------|----------|------|
| `secret-scan` | PreToolUse | 10 | edit/write 도구에서 시크릿 패턴(API 키, JWT, 비밀번호) 탐지 → 차단 |
| `staleness-check` | PreToolUse | 20 | edit_file 전 마지막 read 이후 mtime/hash 변경 확인 → 스테일 에러 |
| `permission-gate` | PreToolUse | 30 | 권한 게이트 연동 (이미 구현됨, 훅으로도 호출 가능) |
| `auto-lint` | PostToolUse | 10 | edit/write 후 `read_lints` 자동 실행 → 에러 시 모델에 재주입 |
| `auto-test` | PostToolUse | 20 | 테스트 파일 변경 시 관련 테스트 자동 실행 (옵션) |
| `cache-invalidate` | PostToolUse | 30 | 파일 수정 시 관련 캐시(인덱스, 임베딩, LSP) 무효화 |
| `secret-mask` | PostToolUse | 5 | 도구 결과(로그, 에러 메시지)에서 시크릿 마스킹 (`sk-***`) |
| `usage-logger` | PostToolUse | 50 | 모든 도구 호출/결과/지연시간 구조화 로깅 (JSONL) |
| `token-counter` | PreModelCall | 10 | 컨텍스트 토큰 수 계산, 예산 초과 경고 |
| `toolcall-validator` | PostModelCall | 10 | 모델 응답의 tool_calls JSON 파싱 검증, 실패 시 재시도 유도 |

---

## 3. Technical Spec

### 3.1 훅 레지스트리 (`src/infra/hooks.ts`)

```typescript
export type HookType = 'PreToolUse' | 'PostToolUse' | 'PreModelCall' | 'PostModelCall';

export interface Hook {
  id: string;
  type: HookType;
  priority: number;              // 낮을수록 먼저 실행 (10, 20, 30...)
  condition?: (ctx: HookContext) => boolean;  // 선택적 실행 조건
  execute: (ctx: HookContext) => Promise<HookResult>;
}

export interface HookContext {
  type: HookType;
  tool?: ToolCall;               // Pre/PostToolUse
  toolResult?: ToolResult;       // PostToolUse
  messages?: ChatMessage[];      // Pre/PostModelCall
  modelResponse?: ChatCompletionChunk; // PostModelCall
  mode: Mode;
  turn: number;
  metadata: Record<string, unknown>;
}

export interface HookResult {
  allow: boolean;                // false면 파이프라인 중단 (PreToolUse만)
  modifiedArgs?: unknown;        // PreToolUse: 도구 인자 수정
  modifiedResult?: ToolResult;   // PostToolUse: 결과 수정/보정
  modifiedMessages?: ChatMessage[]; // PreModelCall: 메시지 배열 교체
  modifiedToolCalls?: ToolCall[];   // PostModelCall: 툴콜 보정
  metadata?: Record<string, unknown>;
}

export class HookRegistry {
  private hooks: Hook[] = [];

  register(hook: Hook): void {
    this.hooks.push(hook);
    this.hooks.sort((a, b) => a.priority - b.priority);
  }

  async run(type: HookType, ctx: HookContext): Promise<HookResult> {
    const relevant = this.hooks.filter(h => h.type === type && (!h.condition || h.condition(ctx)));
    let result: HookResult = { allow: true };
    
    for (const hook of relevant) {
      const ctxCopy = { ...ctx, metadata: { ...ctx.metadata } };
      const r = await hook.execute(ctxCopy);
      
      if (!r.allow) return r;  // 중단
      if (r.modifiedArgs) result.modifiedArgs = r.modifiedArgs;
      if (r.modifiedResult) result.modifiedResult = r.modifiedResult;
      if (r.modifiedMessages) result.modifiedMessages = r.modifiedMessages;
      if (r.modifiedToolCalls) result.modifiedToolCalls = r.modifiedToolCalls;
      Object.assign(result.metadata, r.metadata);
    }
    return result;
  }
}
```

### 3.2 내장 훅 구현 예시 (`src/hooks/builtins.ts`)

```typescript
// 시크릿 스캔 훅
export const secretScanHook: Hook = {
  id: 'secret-scan',
  type: 'PreToolUse',
  priority: 10,
  condition: ctx => ctx.tool && (ctx.tool.name === 'edit_file' || ctx.tool.name === 'write_file'),
  async execute(ctx) {
    const content = ctx.tool.args.content || ctx.tool.args.search || '';
    const secrets = detectSecrets(content);
    if (secrets.length > 0) {
      return { 
        allow: false, 
        metadata: { blockedReason: 'secret_detected', secrets: secrets.map(s => s.type) }
      };
    }
    return { allow: true };
  },
};

// 스테일니스 체크 훅
export const stalenessCheckHook: Hook = {
  id: 'staleness-check',
  type: 'PreToolUse',
  priority: 20,
  condition: ctx => ctx.tool?.name === 'edit_file',
  async execute(ctx) {
    const filePath = ctx.tool.args.path;
    const lastRead = fileReadCache.get(filePath);
    if (!lastRead) return { allow: true };
    
    const stat = await fs.stat(filePath);
    if (stat.mtimeMs > lastRead.mtimeMs) {
      return { 
        allow: false, 
        metadata: { blockedReason: 'stale_file', currentMtime: stat.mtimeMs, readMtime: lastRead.mtimeMs }
      };
    }
    return { allow: true };
  },
});

// 자동 린트 훅
export const autoLintHook: Hook = {
  id: 'auto-lint',
  type: 'PostToolUse',
  priority: 10,
  condition: ctx => ctx.tool && (ctx.tool.name === 'edit_file' || ctx.tool.name === 'write_file') && config.autoLint,
  async execute(ctx) {
    if (!ctx.toolResult.success) return { allow: true };
    
    const filePath = ctx.tool.args.path;
    const lints = await runLint(filePath);
    if (lints.errors.length > 0) {
      return {
        allow: true,
        modifiedResult: {
          ...ctx.toolResult,
          output: `${ctx.toolResult.output}\n\n## Lint Errors (auto-detected):\n${lints.errors.map(e => `${e.line}:${e.column} ${e.message}`).join('\n')}`,
          metadata: { ...ctx.toolResult.metadata, lintErrors: lints.errors }
        }
      };
    }
    return { allow: true };
  },
};
```

### 3.3 훅 설정 (`package.json` configuration)

```json
{
  "agentK.hooks": {
    "enabled": ["secret-scan", "staleness-check", "auto-lint", "cache-invalidate", "usage-logger"],
    "custom": [
      {
        "id": "my-security-scan",
        "type": "PreToolUse",
        "priority": 5,
        "script": ".agentk/hooks/security-scan.js",
        "condition": "tool.name === 'edit_file' || tool.name === 'write_file'"
      }
    ],
    "autoLint": true,
    "autoTest": false,
    "logLevel": "info"
  }
}
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Hooks Pipeline

  Scenario: Secret scan blocks API key commit
    Given user tries to edit_file with content containing "sk-1234567890abcdef"
    When PreToolUse hooks run
    Then secret-scan hook detects API key pattern
    And hook returns { allow: false }
    And tool execution blocked
    And model receives tool_result: { error: "Secret detected: API key" }

  Scenario: Staleness check prevents overwriting external changes
    Given agent read_file src/config.ts at 10:00
    And external process modifies config.ts at 10:01
    When agent calls edit_file on config.ts at 10:02
    Then staleness-check hook detects mtime mismatch
    And returns { allow: false, metadata: { blockedReason: "stale_file" } }
    And model prompted to re-read file

  Scenario: Auto-lint runs after edit and injects errors
    Given autoLint = true in config
    When agent applies edit_file introducing TypeScript error
    Then PostToolUse runs auto-lint hook
    And hook runs tsc --noEmit on file
    And tool_result modified to include lint errors
    And model sees errors in next turn

  Scenario: Hook chain stop on first rejection
    Given two PreToolUse hooks: A(priority=10), B(priority=20)
    When A returns { allow: false }
    Then B not executed
    And tool execution blocked immediately

  Scenario: PostToolUse modifies result
    Given tool returns { success: true, output: "done" }
    When PostToolUse hook adds metadata { cached: true }
    Then final tool_result includes metadata.cached = true

  Scenario: Custom hook loaded from workspace
    Given .agentk/hooks/security.js exports hook object
    When extension activates
    Then hook registered with priority 5
    And executes before built-in hooks
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 5. References

- `PRD-Infra-04_Tool_Registry.md` — 훅 실행 지점(도구 실행 전후)
- `PRD-Infra-05_Permission_Autorun.md` — 권한 게이트와 훅 연동
- `PRD-Harness-10_Verification_MicroLoop.md` — 자동 린트/테스트 훅과 검증 루프 연동
- `PRD-14_Agent_Review_Bugbot.md` — 리뷰 훅과의 연계