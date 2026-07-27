# PRD-Spec-03: Context Budget (컨텍스트 조립 예산)

> **Category**: Advanced Specs  
> **Priority**: ③ (Provider/JSON → Patch → Context Budget)  
> **Phase**: C3 (멀티턴 시작 전)  
> **관련 PRD**: `PRD-Infra-02_Context_Assembly.md`, `PRD-Harness-07_Prompt_Turn_Structure.md`, `PRD-Infra-10_Context_Compaction.md`

---

## 1. Overview

### 목적
매 턴 `messages`를 **토큰 예산 내로 최적 조립**한다. 128k 컨텍스트 기준 **슬롯별 비율 고정**, **보호 구간 절대 보존**, **4단계 압축**으로 오버플로 방지.

### 비즈니스 가치
- **비용 제어**: 출력 토큰 예산 확보로 과금/지연 방지
- **연속성**: 50턴 넘어도 "지금 고치는 파일/에러" 항상 기억
- **예측 가능**: 슬롯별 예산 고정으로 디버깅 용이

---

## 2. Token Budget Table (128k 기준)

| 슬롯 | 비율 | 토큰 | 내용 | 보호 |
|------|------|------|------|------|
| **System + Mode Prompt** | ~5% | 6,400 | 모드별 시스템 프롬프트 (Agent/Ask/Plan/Debug) | ✅ 절대 보호 |
| **Rules** | ~5% | 6,400 | 매칭된 규칙 블록 (경로 매칭) | ✅ 보호 |
| **Tool Schemas** | ~8% | 10,240 | 현재 모드+티어 화이트리스트만 (MCP deferred) | ✅ 보호 |
| **Sticky Context** | ~12% | 15,360 | 열린 탭 요약(상위 5), @멘션, 선택 영역, 현재 진단 | ✅ 보호 |
| **Conversation + Tool Results** | ~60% | 76,800 | 최근 턴 우선 (도구 결과 포함) | 🔄 압축 대상 |
| **Response Reserve** | ~10% | 13,312 | `max_output_tokens` 확보 | ✅ 보호 |

**총합**: 131,072 tokens (128k 컨텍스트 + 여유)

---

## 3. Assembly Order (조립 순서 - 중요도 높은 것 유지)

```
1. System + Mode Prompt          (고정)
2. Active Rules                  (규칙 엔진 결과)
3. Tool Schemas                  (모드+티어 화이트리스트)
4. Sticky Context                (열린 탭, @멘션, 선택 영역, 진단)
5. User Latest Message           (필수)
6. Recent Tool Results (역순)    (예산 내 최대)
7. Older Conversation (역순)     (예산 내 최대)
8. [Compression]                 (예산 초과 시 4단계 압축)
```

---

## 4. Hard Rules (하드 제약)

| 규칙 | 값 | 비고 |
|------|-----|------|
| **단일 Tool Result 상한** | 32KB / 8k tokens | 초과 시 truncate + `(truncated, path=...)` |
| **read_file 기본** | 250줄 캡 | `offset`/`limit` 파라미터 필수 |
| **이미지** | Vision 모델만 | 해상도/장수 캡 |
| **모드 전환 시** | Sticky Context 초기화 | Cursor 방식 |
| **Compression 보호 구간** | System, Rules, Sticky, Recent 6 Turns, Goal, Memories, Artifacts | 절대 압축 안 함 |

---

## 5. Assembly Algorithm (`src/agent/contextAssembler.ts`)

```typescript
export class ContextAssembler {
  constructor(
    private tokenizer: Tokenizer,
    private budget: ContextBudget,
    private rulesEngine: RulesEngine,
    private stickyProvider: StickyContextProvider
  ) {}

  async assemble(
    messages: ChatMessage[],
    mode: Mode,
    sticky: StickyContext,
    activeRules: RuleFile[]
  ): Promise<ChatMessage[]> {
    // 1. 고정 헤더
    const header = this.buildHeader(mode, activeRules);
    let tokens = this.countTokens(header);
    
    // 2. 스티키 컨텍스트
    const stickyBlock = this.buildStickyContext(sticky);
    const stickyTokens = this.countTokens(stickyBlock);
    if (tokens + stickyTokens > this.budget.system + this.budget.rules + this.budget.tools + this.budget.sticky) {
      stickyBlock.truncate(); // 스티키도 예산 초과 시 절단
    }
    tokens += this.countTokens(stickyBlock);

    // 3. 최신 사용자 메시지 (항상 포함)
    const lastUser = messages.filter(m => m.role === 'user').pop()!;
    tokens += this.countTokens(lastUser);

    // 4. 도구 결과 (역순, 예산 내)
    const toolResults = messages.filter(m => m.role === 'tool').reverse();
    const recentResults: ChatMessage[] = [];
    for (const tr of toolResults) {
      const t = this.countTokens(tr);
      if (tokens + t > this.budget.total - this.budget.responseReserve) break;
      recentResults.unshift(tr);
      tokens += t;
    }

    // 4. 대화 이력 (역순, 예산 내)
    const conversations = messages.filter(m => m.role !== 'tool').reverse();
    const recentConv: ChatMessage[] = [];
    for (const msg of conversations) {
      if (msg === lastUser) continue; // 이미 포함
      const t = this.countTokens(msg);
      if (tokens + t > this.budget.total - this.budget.responseReserve) break;
      recentConv.unshift(msg);
      tokens += t;
    }

    // 5. 압축 필요 시
    if (tokens > this.budget.total - this.budget.responseReserve) {
      return this.compact([...header, stickyBlock, ...recentConv, ...recentResults, lastUser], this.budget);
    }

    return [...header, stickyBlock, ...recentConv, ...recentResults, lastUser];
  }

  private buildHeader(mode: Mode, rules: RuleFile[]): ChatMessage[] {
    return [
      { role: 'system', content: MODE_SYSTEM_PROMPTS[mode] },
      { role: 'system', content: this.rulesEngine.formatForInjection(rules) },
      { role: 'system', content: this.formatToolSchemas(this.registry.getSchemas(WHITELISTS[mode])) },
    ];
  }
}
```

---

## 4. Compression Pipeline (4단계 압축) - `src/infra/compaction.ts`

```typescript
export class CompactionEngine {
  async compact(messages: ChatMessage[], budget: CompactionBudget): Promise<ChatMessage[]> {
    let tokens = this.countTokens(messages);
    if (tokens <= budget.target) return messages;

    // 1단계: Truncate - 오래된 tool_result 본문 절단 (32KB 캡)
    messages = this.truncateToolResults(messages, 32 * 1024);
    if ((tokens = this.countTokens(messages)) <= budget.target) return messages;

    // 2단계: Drop - 중복 read/grep 결과 제거 (동일 경로/쿼리)
    messages = this.dropDuplicateResults(messages);
    if ((tokens = this.countTokens(messages)) <= budget.target) return messages;

    // 3단계: Micro-summary - 오래된 구간을 bullet 요약으로 치환 (소형 모델/휴리스틱)
    messages = await this.microSummarize(messages, budget);
    if ((tokens = this.countTokens(messages)) <= budget.target) return messages;

    // 4단계: Full compact - 대화 전체를 요약 1블록으로 치환 (대형 모델)
    return await this.fullCompact(messages, budget);
  }

  private identifyProtectedIndices(messages: ChatMessage[]): Set<number> {
    const protectedIdx = new Set<number>();
    
    // System messages (always first)
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'system') protected.add(i);
      else break;
    }

    // Rules, Sticky, Memories, Artifacts (헤더 기반 탐지)
    // Recent 6 turns (from end)
    let turnCount = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' || messages[i].role === 'assistant') {
        if (turnCount < 6) protected.add(i);
        turnCount++;
        if (turnCount >= 6) break;
      }
    }

    // Current user goal (last user message)
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        protected.add(i);
        break;
      }
    }

    return protected;
  }
}
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Context Budget Assembly

  Scenario: Budget respected with all slots
    Given 128k context window
    And system+rules+tools+sticky = 30k tokens
    And conversation history = 150k tokens
    When assembling context
    Then total tokens <= 115k (response reserve 13k kept)
    And system, rules, tools, sticky, recent 6 turns preserved
    And older turns summarized into 1 block

  Scenario: Single tool result truncated at 32KB
    Given a tool_result with 100KB content
    When assembling context
    Then tool_result truncated to 32KB
    And "(truncated, path=src/large.ts)" appended
    And token count reflects truncated version

  Scenario: Read file respects 250-line cap
    Given user asks "read src/large.ts" (1000 lines)
    When read_file executes
    Then returns first 250 lines
    And metadata includes "totalLines: 1000, showing: 1-250"

  Scenario: Mode switch resets sticky context
    Given Agent mode with 3 open tabs in sticky
    When user switches to Plan mode
    Then sticky context cleared (open tabs reset)
    And new Plan mode system prompt injected

  Scenario: Compaction preserves protected zones
    Given 50-turn session at 95% budget
    When compaction runs
    Then system prompt identical
    And active rules identical
    And recent 6 turns verbatim
    And current user goal identical
    And memories/artifacts intact
    And only older turns summarized
```

---


## Out of Scope

- Spec 범위를 넘는 제품 기능 (Feature PRD로 위임)
- 상세: Canonical Owner Matrix

## 5. References

- `PRD-Infra-02_Context_Assembly.md` — 예산/슬롯 상세
- `PRD-Harness-07_Prompt_Turn_Structure.md` — 프롬프트/턴 구조
- `PRD-Infra-10_Context_Compaction.md` — 컴팩션 파이프라인 상세
- Tiktoken: https://github.com/openai/tiktoken