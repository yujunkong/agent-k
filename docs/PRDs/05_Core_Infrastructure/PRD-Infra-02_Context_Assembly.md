# PRD-Infra-02: Context Assembly (컨텍스트 조립)

> **Category**: Core Infrastructure  
> **Phase**: C1~C3 (멀티턴 시작 전 필수)  
> **관련 PRD**: `PRD-C1_Ask_Mode.md`, `PRD-C3_Agent_MultiTurn.md`, `PRD-Harness-09_Prefetch_Pattern.md`, `PRD-Infra-01_Instructions_Rules.md`

---

## 1. Overview

### 목적
매 턴 모델에 전달할 **`messages` 배열을 예산 내로 최적 조립**한다. 시스템 프롬프트, 규칙, 도구 스키마, 스티키 컨텍스트, 대화 이력, 도구 결과를 **우선순위 기반**으로 패킹한다.

### 비즈니스 가치
- **토큰 효율**: 128k 컨텍스트에서 핵심 정보만 유지
- **연속성**: 긴 세션에서도 "지금 고치는 파일/에러" 항상 기억
- **비용 제어**: 출력 토큰 예산 확보로 과금/지연 방지

---

## 2. Functional Requirements

### 2.1 컨텍스트 슬롯 및 예산 (128k 기준 예시)
| 슬롯 | 비율 | 토큰 | 내용 | 보호 여부 |
|------|------|------|------|-----------|
| **System + Mode Prompt** | ~5% | 6.4k | 모드별 시스템 프롬프트 | ✅ 절대 보호 |
| **Active Rules** | ~5% | 6.4k | 매칭된 규칙 블록 | ✅ 보호 |
| **Tool Schemas** | ~8% | 10k | 현재 모드 화이트리스트 도구만 | ✅ 보호 |
| **Sticky Context** | ~12% | 15k | 열린 탭 요약, @멘션, 선택 영역 | ✅ 보호 |
| **Conversation + Tool Results** | ~60% | 77k | 최근 턴 우선 (도구 결과 포함) | 🔄 압축 대상 |
| **Response Reserve** | ~10% | 13k | `max_output_tokens` | ✅ 보호 |

### 2.2 조립 순서 (중요도 높은 것 유지)
1. **System + Mode Prompt** (고정)
2. **Active Rules** (규칙 엔진 결과)
3. **Tool Schemas** (현재 모드 화이트리스트)
4. **User Latest Message** (현재 목표)
5. **Sticky Context** (열린 탭 요약, @멘션, 선택 영역)
6. **Recent Tool Results** (역순, 예산 내)
7. **Older Conversation** (뒤에서부터 채우기, 예산 초과 시 압축)

### 2.3 하드 규칙
| 규칙 | 값 | 비고 |
|------|-----|------|
| 단일 Tool Result 상한 | 32KB / 8k tokens | 초과 시 truncate + `…(truncated, path=…)` |
| `read_file` 기본 | 250줄 캡 | `offset`/`limit` 파라미터로 제어 |
| 이미지 | Vision 모델만 | 해상도/장수 캡 |
| 모드 전환 시 | Sticky Context 초기화 | Cursor 방식 |
| 압축 보호 구간 | System, Rules, 최근 6턴 | 절대 압축 안 함 |

---

## 3. Technical Spec

### 3.1 Context Assembler (`src/agent/contextAssembler.ts`)

```typescript
export interface ContextBudget {
  system: number;           // 6400
  rules: number;            // 6400
  tools: number;            // 10240
  sticky: number;           // 15360
  conversation: number;     // 76800
  responseReserve: number;  // 13312
  total: number;            // 131072 (128k)
}

export interface StickyContext {
  openTabs: TabSummary[];      // 상위 5개 탭: 경로 + 첫 50줄 요약
  mentions: Mention[];         // @file, @folder, @symbol, @codebase
  selection: SelectionRange | null;  // 현재 선택 영역
  diagnostics: Diagnostic[];   // 현재 파일 린트 에러 상위 5개
}

export class ContextAssembler {
  constructor(
    private tokenizer: Tokenizer,
    private rulesEngine: RulesEngine,
    private toolRegistry: ToolRegistry,
    private budget: ContextBudget
  ) {}

  async assemble(
    messages: ChatMessage[],
    mode: Mode,
    sticky: StickyContext,
    activeRules: RuleFile[]
  ): Promise<ChatMessage[]> {
    // 1. 고정 헤더 구성
    const header = this.buildHeader(mode, activeRules);
    let tokens = this.countTokens(header);
    
    // 2. 스티키 컨텍스트
    const stickyBlock = this.buildStickyContext(sticky);
    const stickyTokens = this.countTokens(stickyBlock);
    if (tokens + stickyTokens > this.budget.system + this.budget.rules + this.budget.tools + this.budget.sticky) {
      // 스티키 예산 초과 시 요약/절단
    }
    tokens += stickyTokens;

    // 3. 최근 사용자 메시지 (항상 포함)
    const lastUser = messages.filter(m => m.role === 'user').pop()!;
    tokens += this.countTokens(lastUser);

    // 4. 도구 결과 + 대화 이력 (역순으로 예산 채우기)
    const toolResults = messages.filter(m => m.role === 'tool').reverse();
    const conversations = messages.filter(m => m.role !== 'tool' && m !== lastUser).reverse();
    
    const body: ChatMessage[] = [];
    
    // 도구 결과부터 채우기 (최신 우선)
    for (const tr of toolResults) {
      const t = this.countTokens(tr);
      if (tokens + t > this.budget.total - this.budget.responseReserve) break;
      body.unshift(tr);
      tokens += t;
    }
    
    // 대화 이력 채우기
    for (const msg of conversations) {
      const t = this.countTokens(msg);
      if (tokens + t > this.budget.total - this.budget.responseReserve) break;
      body.unshift(msg);
      tokens += t;
    }

    // 5. 압축 필요 시
    if (tokens > this.budget.total - this.budget.responseReserve) {
      return this.compact(header, stickyBlock, body, this.budget);
    }

    return [...header, stickyBlock, ...body, lastUser];
  }

  private buildHeader(mode: Mode, rules: RuleFile[]): ChatMessage[] {
    const systemPrompt = MODE_SYSTEM_PROMPTS[mode];
    const rulesBlock = this.rulesEngine.formatForInjection(rules);
    const toolSchemas = this.toolRegistry.getSchemas(MODE_CONFIG[mode].toolWhitelist);
    
    return [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: rulesBlock },
      { role: 'system', content: `## Available Tools\n${JSON.stringify(toolSchemas, null, 2)}` },
    ];
  }

  private buildStickyContext(sticky: StickyContext): ChatMessage {
    const parts: string[] = [];
    
    if (sticky.openTabs.length) {
      parts.push('## Open Tabs\n' + sticky.openTabs.map(t => `- ${t.path}: ${t.summary}`).join('\n'));
    }
    if (sticky.mentions.length) {
      parts.push('## Referenced\n' + sticky.mentions.map(m => `- @${m.type}:${m.path}`).join('\n'));
    }
    if (sticky.selection) {
      parts.push(`## Current Selection (${sticky.selection.path}:${sticky.selection.start}-${sticky.selection.end})\n\`\`\`${sticky.selection.lang}\n${sticky.selection.text}\n\`\`\``);
    }
    if (sticky.diagnostics.length) {
      parts.push('## Current Diagnostics\n' + sticky.diagnostics.map(d => `- ${d.severity}: ${d.message} at ${d.range}`).join('\n'));
    }
    
    return { role: 'system', content: `## Sticky Context\n\n${parts.join('\n\n')}` };
  }

  private async compact(header: ChatMessage[], sticky: ChatMessage, body: ChatMessage[], budget: ContextBudget): Promise<ChatMessage[]> {
    // 1단계: 오래된 tool_result 본문 절단 (32KB 캡)
    // 2단계: 중복 read/grep 결과 제거
    // 3단계: 마이크로 요약 (소형 모델로 구간 → bullet 치환)
    // 4단계: 풀 컴팩트 (대화 요약 1블록 생성 후 히스토리 교체)
    // 보호 구간: header, sticky, 최근 6턴 절대 건드리지 않음
  }
}
```

### 3.2 토큰 카운터 (`src/utils/tokenizer.ts`)

```typescript
export class Tokenizer {
  private encoder: TiktokenEncoder;  // cl100k_base (GPT-4/3.5 호환)
  
  constructor() {
    this.encoder = tiktoken.get_encoding('cl100k_base');
  }

  countTokens(text: string): number {
    return this.encoder.encode(text).length;
  }

  countTokensMessages(messages: ChatMessage[]): number {
    let tokens = 0;
    for (const msg of messages) {
      tokens += 4;  // role + content 오버헤드
      tokens += this.countTokens(msg.content);
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          tokens += this.countTokens(JSON.stringify(tc));
        }
      }
    }
    tokens += 2;  // assistant reply primer
    return tokens;
  }

  truncate(text: string, maxTokens: number): string {
    const tokens = this.encoder.encode(text);
    if (tokens.length <= maxTokens) return text;
    return this.encoder.decode(tokens.slice(0, maxTokens)) + '…(truncated)';
  }
}
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Context Assembly

  Scenario: Budget respected with all slots
    Given a 128k context window
    And system+rules+tools = 23k tokens
    And sticky context = 10k tokens
    And conversation history = 100k tokens
    When assembling context
    Then total tokens <= 115k (response reserve 13k kept)
    And system, rules, tools, sticky, recent 6 turns preserved
    And older conversation truncated/summarized

  Scenario: Single tool result truncated at 32KB
    Given a tool_result with 50KB content
    When assembling context
    Then tool_result truncated to 32KB + "(truncated, path=src/large.ts)"
    And token count reflects truncated version

  Scenario: Mode switch resets sticky context
    Given user in Agent mode with open tabs A, B, C
    When user switches to Plan mode
    Then sticky context reset (open tabs cleared)
    And new Plan mode system prompt injected

  Scenario: Read file respects 250-line cap
    Given user asks "read src/large.ts" (1000 lines)
    When read_file tool executes
    Then returns first 250 lines
    And metadata includes "totalLines: 1000, showing: 1-250"

  Scenario: Compaction preserves critical context
    Given 50-turn conversation at 95% budget
    When compaction triggers
    Then system prompt, rules, sticky, recent 6 turns intact
    And older turns replaced with single summary block
    And total tokens drop to < 70%
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 5. References

- `PRD-Harness-09_Prefetch_Pattern.md` — 프리페치 결과도 스티키 컨텍스트로 주입
- `PRD-Infra-10_Context_Compaction.md` — 컴팩션 상세 알고리즘
- `PRD-Harness-07_Prompt_Turn_Structure.md` — 프롬프트 구조
- Tiktoken: https://github.com/openai/tiktoken