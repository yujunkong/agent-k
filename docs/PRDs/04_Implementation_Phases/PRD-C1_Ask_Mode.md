# PRD-C1: Ask 모드 (Ask Mode - Read-Only Exploration)

> **Priority**: 구현 순서 1단계 (C1)  
> **Phase**: C1 (C0 채팅 UI 완료 직후)  
> **관련 PRD**: `PRD-C0_Chat_UI_Streaming.md`, `PRD-06_Workspace_Tools.md` (읽기 도구), `PRD-Harness-06_A_Tier_Whitelist.md`, `PRD-Infra-04_Tool_Registry.md`, `PRD-Infra-08_Parallel_Serial_Policy.md`, `PRD-Harness-09_Prefetch_Pattern.md`

---

## 1. Overview

### 목적
**읽기 전용 탐색 모드**를 구현한다. 모델은 파일 읽기/검색 도구만 사용해 코드베이스를 설명하고, **디스크 변경은 절대 하지 않는다**. Cursor Ask 모드와 동등한 안전성 확보.

### 비즈니스 가치
- **신뢰성**: "이 함수 뭐해?" 질문 시 수정 위험 0%
- **학습 도구**: 주니어가 코드베이스 탐색하며 익히기 최적
- **하네스 검증**: 중급 모델(Flash)이 도구 호출·컨텍스트 조립·스트리밍을 안정적으로 도는지 첫 검증

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, "이 모듈 어떻게 돌아?" 물으면 파일 읽고 설명만 해주고 파일 안 건드리게 하고 싶다 |
| US-02 | 팀 리더로, 신입이 Ask 모드로만 일주일 쓰게 해서 코드베이스 익히게 하고 싶다 |
| US-03 | 보안 담당자로, Ask 모드에선 `edit_file`/`write_file`/`run_terminal_cmd` 도구가 아예 안 보이게 하고 싶다 |

---

## 2. Functional Requirements

### 2.1 도구 화이트리스트 (Ask 모드)
| 도구 | 허용 | 비고 |
|------|------|------|
| `grep` | ✅ | 정규식 내용 검색 |
| `glob` / `file_search` | ✅ | 경로 패턴 매칭 |
| `list_dir` | ✅ | 디렉터리 트리 탐색 |
| `read_file` | ✅ | 파일 내용 읽기 (offset/limit 필수) |
| `codebase_search` | ✅ | 의미 검색 (임베딩 인덱스 있으면) |
| `lsp_*` | ✅ | 정의/참조/진단 (읽기 전용) |
| `ask_question` | ✅ | 사용자 확인 질문 |
| `todo_write` | ✅ | 진행 상황 가시화 |
| `edit_file` / `write_file` / `delete_file` | ❌ | **완전 차단** |
| `run_terminal_cmd` | ❌ | **완전 차단** |
| `browser_*` / `web_*` | ❌ | **완전 차단** |

### 2.2 시스템 프롬프트 (Ask 모드)
```text
당신은 코드베이스 탐색 어시스턴트입니다.
규칙:
1. 파일 읽기/검색 도구만 사용하세요. 수정·삭제·실행 도구는 사용 금지입니다.
2. 사용자 질문에 답하려면 반드시 관련 코드를 먼저 읽으세요. 추측으로 답하지 마세요.
3. 확신이 없으면 ask_question으로 사용자에게 물어보세요.
4. 답변엔 반드시 읽은 파일 경로와 라인 번호를 인용하세요.
5. todo_write로 진행 상황을 기록하세요.
```

### 2.3 동작 제약
| FR-ID | 제약 | 구현 |
|-------|------|------|
| FR-01 | 쓰기 도구 호출 시 즉시 거절 | ToolRegistry에서 `isWriteTool(name)` 체크 → `permission denied` ToolResult 반환 |
| FR-02 | 시스템 프롬프트 주입 | 모드 전환 시 `systemPrompt` 교체, 히스토리 초기화 |
| FR-03 | 도구 스키마 필터링 | `ToolRegistry.getSchemas(mode)` 호출 시 읽기 도구만 반환 |
| FR-04 | UI 표시 | 도구 호출 패널에 🔒 아이콘 + "Read-only mode" 배지 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 도구 호출 지연 | 읽기 도구 P99 < 200ms |
| NFR-02 | 메모리 누수 없음 | 100턴 대화 후 메모리 증가 < 10MB |
| NFR-03 | 모드 전환 지연 | Ask ↔ Agent 전환 < 100ms (히스토리 클리어 포함) |

---

## 4. Technical Spec

### 4.1 모드 레지스트리 (`src/agent/modeRegistry.ts`)

```typescript
export type Mode = 'ask' | 'agent' | 'plan' | 'debug';

export const MODE_CONFIG: Record<Mode, ModeConfig> = {
  ask: {
    label: 'Ask',
    description: 'Read-only exploration',
    systemPrompt: ASK_SYSTEM_PROMPT,
    toolWhitelist: ASK_WHITELIST,
    maxTurns: 10,
    allowWrite: false,
    allowTerminal: false,
    allowNetwork: false,
    contextBudget: 60000,  // 60k tokens for Ask
  },
  agent: { /* ... */ },
  plan: { /* ... */ },
  debug: { /* ... */ },
};

export const ASK_WHITELIST = [
  'grep', 'glob', 'file_search', 'list_dir', 'read_file',
  'codebase_search', 'lsp_definition', 'lsp_references', 'lsp_diagnostics',
  'ask_question', 'todo_write',
] as const;

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}
const WRITE_TOOLS = new Set(['edit_file', 'write_file', 'delete_file', 'run_terminal_cmd', 'apply_patch']);
```

### 4.2 ToolRegistry 필터링 (`src/tools/registry.ts`)

```typescript
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(def: ToolDefinition) { this.tools.set(def.name, def); }

  getSchemas(mode: Mode): ToolSchema[] {
    const config = MODE_CONFIG[mode];
    return config.toolWhitelist
      .map(name => this.tools.get(name)?.schema)
      .filter((s): s is ToolSchema => !!s);
  }

  async execute(name: string, args: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { error: `Unknown tool: ${name}` };

    // 쓰기 도구 가드 (이중 안전장치)
    if (context.mode === 'ask' && isWriteTool(name)) {
      return { error: `Tool ${name} not allowed in Ask mode (read-only)` };
    }

    return tool.handler(args, context);
  }
}
```

### 4.3 AgentLoop 모드 주입 (`src/agent/loop.ts`)

```typescript
export class AgentLoop {
  constructor(
    private registry: ToolRegistry,
    private provider: LLMProvider,
    private contextAssembler: ContextAssembler,
    private mode: Mode
  ) {}

  async *run(initialMessages: ChatMessage[]): AsyncGenerator<TurnEvent> {
    const config = MODE_CONFIG[this.mode];
    let messages = [...initialMessages];

    // 시스템 프롬프트 주입
    messages.unshift({ role: 'system', content: config.systemPrompt });

    for (let turn = 0; turn < config.maxTurns; turn++) {
      const schemas = this.registry.getSchemas(this.mode);
      const stream = this.provider.chatCompletionStream({
        model: config.defaultModel,
        messages,
        tools: schemas,
        tool_choice: 'auto',
        temperature: 0.1,
      });

      const toolCalls = await this.collectToolCalls(stream);
      if (toolCalls.length === 0) {
        yield { type: 'done', finalMessage: stream.accumulatedContent };
        break;
      }

      // 도구 실행 (병렬 읽기 / 직렬 쓰기 - Ask 모드는 읽기만)
      const results = await this.executeTools(toolCalls, config);
      messages.push(...results.map(r => ({ role: 'tool', content: r.output, tool_call_id: r.id })));
      yield { type: 'turn_complete', turn, toolCalls, results };
    }
  }
}
```

### 4.4 컨텍스트 조립기 Ask 모드 최적화 (`src/agent/contextAssembler.ts`)

```typescript
export class ContextAssembler {
  assemble(messages: ChatMessage[], mode: Mode): ChatMessage[] {
    const budget = MODE_CONFIG[mode].contextBudget; // 예: 80k tokens
    let tokens = 0;
    const result: ChatMessage[] = [];

    // 1. 시스템 프롬프트 (고정)
    result.push(messages[0]); // system
    tokens += countTokens(messages[0].content);

    // 2. 최신 사용자 목표 (마지막 user 메시지)
    const lastUser = messages.filter(m => m.role === 'user').pop()!;
    result.push(lastUser);
    tokens += countTokens(lastUser.content);

    // 3. 최근 도구 결과 (역순, 예산 내)
    const toolResults = messages.filter(m => m.role === 'tool').reverse();
    for (const tr of toolResults) {
      const t = countTokens(tr.content);
      if (tokens + t > budget) break;
      result.unshift(tr); // 순서 보존 위해 unshift 후 마지막에 reverse
      tokens += t;
    }

    // 4. 이전 대화 턴 (역순)
    const conversations = messages.filter(m => m.role !== 'tool' && m.role !== 'system').reverse();
    for (const msg of conversations) {
      const t = countTokens(msg.content);
      if (tokens + t > budget) break;
      result.unshift(msg);
      tokens += t;
    }

    return result.reverse(); // 원래 순서 복원
  }
}
```

---

## 5. Sequence Diagram: Ask Mode Flow

```mermaid
sequenceDiagram
    participant User
    participant ChatUI as Chat UI (Webview)
    participant Loop as AgentLoop (Ask Mode)
    participant Registry as ToolRegistry
    participant Provider as LLM Provider
    participant Tools as Read Tools (grep/read/etc)
    participant Prefetch as PrefetchEngine
    
    User->>ChatUI: "Explain @file:src/auth.ts"
    ChatUI->>Loop: run(userMessage, mode='ask')
    Loop->>Prefetch: extract paths/symbols from message
    Prefetch->>Tools: parallel read (grep/read_file)
    Tools-->>Prefetch: file contents
    Prefetch-->>Loop: contextBlock (pre-fetched)
    Loop->>Loop: assemble context (system + user + prefetch)
    Loop->>Provider: chatCompletionStream(messages, tools=ASK_WHITELIST)
    Provider-->>Loop: streaming chunks
    Loop->>ChatUI: stream deltas (token by token)
    alt model calls tools
        Loop->>Registry: getSchemas('ask') → 10 read-only tools
        Loop->>Provider: tool_calls in stream
        Loop->>Tools: execute parallel (Promise.all + p-limit)
        Tools-->>Loop: tool results
        Loop->>Loop: append to messages
        Loop->>Provider: next turn (loop)
    else no tool_calls
        Loop->>ChatUI: final answer
    end
    ChatUI->>User: rendered explanation + timeline
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Ask Mode (Read-Only)

  Scenario: Ask mode only shows read tools
    Given mode is "Ask"
    When user asks "How does auth work?"
    Then model receives only grep, glob, read_file, codebase_search, lsp_*, ask_question, todo_write
    And edit_file, write_file, run_terminal_cmd are NOT in tool schemas

  Scenario: Write tool rejected in Ask mode
    Given mode is "Ask"
    When model calls edit_file (hallucination)
    Then tool returns error "Tool edit_file not allowed in Ask mode (read-only)"
    And loop continues (no crash)

  Scenario: System prompt enforces read-only
    Given Ask mode system prompt injected
    When model tries to answer without reading files
    Then model says "Let me first read the relevant files" and calls grep/read_file

  Scenario: Mode switch resets history
    Given 5-turn conversation in Agent mode
    When user switches to Ask mode
    Then new session starts with empty history
    And system prompt changes to Ask prompt

  Scenario: UI shows read-only badge
    Given Ask mode active
    Then chat header shows "🔒 Read-only mode"
    And tool call panel shows 🔒 next to each tool
```

---

## 7. Test Plan

| 테스트 파일 | 설명 | 커버리지 목표 |
|------------|------|---------------|
| `src/agent/modeRegistry.test.ts` | 화이트리스트/블랙리스트 정확성, 모드별 설정 | 100% |
| `src/tools/registry.test.ts` | Ask 모드에서 쓰기 도구 호출 시 에러 반환, 스키마 필터링 | 95% |
| `src/agent/loop.test.ts` | Ask 모드 10턴 내 정상 종료, 히스토리 초기화, 프리페치 연동 | 90% |
| `src/agent/contextAssembler.test.ts` | 예산 내 컨텍스트 조립, 시스템 프롬프트 항상 포함, 프리페치 블록 우선순위 | 90% |
| `tests/e2e/ask-mode.spec.ts` | "Explain this function" → read_file → 설명 완료, 디스크 변경 없음 | E2E |

### 실행 명령어
```bash
# 단위 테스트
npm test -- src/agent/modeRegistry.test.ts
npm test -- src/tools/registry.test.ts
npm test -- src/agent/loop.test.ts

# E2E 테스트 (VS Code Extension Test Host)
npm run test:e2e -- tests/e2e/ask-mode.spec.ts

# 전체 테스트 + 커버리지
npm test -- --coverage
```

---

## 8. Implementation Checklist

| 단계 | 작업 | 파일 생성/수정 | 완료 기준 |
|------|------|----------------|-----------|
| 1 | `ModeConfig` 타입 + `ASK_WHITELIST` 상수 정의 | `src/agent/modeRegistry.ts` (신규) | 타입스크립트 컴파일 통과 |
| 2 | `ToolRegistry.getSchemas(mode)` 구현 | `src/tools/registry.ts` (수정) | Ask 모드에서 10개 도구만 반환 |
| 3 | `AgentLoop`에 `mode` 주입 + 시스템 프롬프트 주입 | `src/agent/loop.ts` (수정) | 모드별 프롬프트 적용 확인 |
| 4 | `ContextAssembler`에 `mode` 파라미터 추가 + 예산 분리 | `src/agent/contextAssembler.ts` (수정) | Ask: 60k, Agent: 100k 토큰 |
| 5 | PrefetchEngine 연동 (메시지 → 경로/심볼 → 선독) | `src/prefetch/PrefetchEngine.ts` (신규) | 사용자 메시지 분석 후 모델 호출 전 컨텍스트 주입 |
| 6 | UI: 모드 셀렉터 + Ask 모드 배지 + 도구 🔒 아이콘 | `src/chat/components/ModeSelector.tsx`, `Timeline.tsx` | 시각적 구분 명확 |
| 7 | 통합 테스트: Ask 모드 10개 시나리오 통과 | `tests/e2e/ask-mode.spec.ts` | CI 그린 |

---

## 9. Debugging Tips

```bash
# 1. Ask 모드 도구 스키마 확인
# Webview 콘솔에서:
# > window.agentK.debug.getToolSchemas('ask')

# 2. 프리페치 로그 확인
# Extension 콘솔 (F12 → Console):
# [PREFETCH] extracted paths: ["src/auth.ts"]
# [PREFETCH] read 1 files, grep 3 symbols in 45ms

# 3. ToolRegistry 디버그
# > window.agentK.debug.registry.listTools()
```

---

## Out of Scope

- 해당 Phase 밖 기능을 완료로 간주하지 말 것 (특히 Browser=C7)
- 상세: `00_Master_Context.md` Non-Goals

## References

- `PRD-C0_Chat_UI_Streaming.md` — 채팅 UI 기반
- `PRD-Harness-06_A_Tier_Whitelist.md` — 중급 모델 도구 제한 철학
- `PRD-Harness-09_Prefetch_Pattern.md` — 프리페치 패턴 상세
- `PRD-Infra-04_Tool_Registry.md` — 도구 레지스트리 아키텍처
- `PRD-Infra-08_Parallel_Serial_Policy.md` — 병렬/직렬 실행 정책
- Cursor Ask Mode: https://cursor.sh/docs/ask-mode