# PRD-Harness-07: Prompt & Turn Structure (프롬프트·턴 구조)

> **Category**: Medium Model Harness  
> **Phase**: C0~C1 (초기부터 적용)  
> **관련 PRD**: `PRD-Harness-05_Design_Slogans.md`, `PRD-C0_Chat_UI_Streaming.md`, `PRD-Harness-04_Memories_Minimal.md`

---

## 1. Overview

### 목적
모델이 **매 턴 일관된 구조**로 입력받고, **예측 가능한 형식**으로 출력하게 해, 중급 모델(Flash)도 안정적으로 도구 호출·응답 생성하게 한다.

### 핵심 원칙
| 원칙 | 구현 |
|------|------|
| **구조 고정** | 매 턴 동일한 슬롯 순서·형식 유지 |
| **예산 준수** | 128k 컨텍스트 내 슬롯별 토큰 예산 강제 |
| **보호 구간** | System/Rules/Sticky/Goal/최근 6턴/Goal/Memories는 절대 압축 안 함 |
| **출력 강제** | JSON 강제(`response_format: json_object`), 툴콜만 허용 |

---

## 2. Message Assembly Pipeline (매 턴 조립 순서)

```
1. System Prompt + Mode Prompt          (고정, ~5%)
2. Active Rules (matched)               (~5%)
3. Tool Schemas (mode+tier whitelist)   (~8%)
4. Sticky Context (open tabs, @mentions, selection) (~12%)
5. User Latest Message                  (필수)
5. Recent Tool Results (reverse, budget) (~60%)
6. Older Conversation (truncated/summarized)
7. Assistant Response Reserve           (~10%)
```

### 2.1 슬롯별 상세

| 슬롯 | 내용 | 토큰 예산 (128k 기준) | 보호 |
|------|------|----------------------|------|
| **System + Mode** | `You are...` + `Mode: Agent/Ask/Plan/Debug` | 5% (6.4k) | ✅ 절대 보호 |
| **Active Rules** | `.agentk/rules/*.md` + `.cursorrules` + 프로젝트별 매칭 | 5% (6.4k) | ✅ 보호 |
| **Tool Schemas** | 현재 모드+티어 화이트리스트만 (JSON Schema) | 8% (10k) | ✅ 보호 |
| **Sticky Context** | 열린 탭 요약(상위 5개, 50줄), @멘션 파일, 선택 영역, 현재 진단 | 12% (15k) | ✅ 보호 |
| **User Message** | 최신 사용자 입력 (첨부/멘션 포함) | 가변 | 필수 |
| **Recent Tool Results** | 최근 턴부터 역순, 32KB 캡/결과 | 60% (77k) | 🔄 압축 대상 1순위 |
| **Older Conversation** | 오래된 턴 → 요약 블록 1개로 치환 | 나머지 | 🔄 압축 대상 |
| **Response Reserve** | `max_output_tokens` 확보 | 10% (13k) | ✅ 보호 |

---

## 3. Message Format (JSON Schema)

### 3.1 입력 메시지 (Model Input)

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;                    // 마크다운 가능
  tool_calls?: ToolCall[];            // assistant만
  tool_call_id?: string;              // tool role만
  name?: string;                      // tool role만 (도구명)
  metadata?: {
    tokens?: number;                  // 토큰 수 (디버그용)
    truncated?: boolean;              // 잘렸는지
    source?: 'sticky' | 'history' | 'tool_result' | 'summary';
    turn?: number;                    // 턴 번호
  };
}
```

### 3.2 도구 호출 (Model Output) — JSON 강제

```json
{
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "read_file",
        "arguments": { "path": "src/auth.ts", "offset": 0, "limit": 200 }
      }
    }
  ]
}
```

**강제 사항**:
- `response_format: { type: "json_object" }` 강제 (Provider 레벨)
- `tool_calls` 배열만 허용, 자유 텍스트 금지 (스트리밍 중에도 `tool_calls` 델타만)
- `arguments`는 **이미 파싱된 객체**여야 함 (문자열 이중 인코딩 금지)

---

## 3.3 도구 결과 (Tool Result) — 표준 포맷

```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "File content here...",
  "metadata": {
    "tokens": 1234,
    "truncated": false,
    "file": "src/auth.ts",
    "lines": "1-200"
  }
}
```

**에러 시**:
```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "Error: File not found: src/missing.ts",
  "error": true,
  "metadata": { "errorCode": "ENOENT", "path": "src/missing.ts" }
}
```

---

## 4. Context Assembly Algorithm (`src/agent/contextAssembler.ts`)

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
    tier: ModelTier,
    sticky: StickyContext
  ): Promise<ChatMessage[]> {
    // 1. 고정 헤더
    const header = [
      { role: 'system', content: SYSTEM_PROMPTS[mode] },
      { role: 'system', content: this.rulesEngine.formatForInjection(await this.rulesEngine.getActive()) },
      { role: 'system', content: this.formatToolSchemas(this.getSchemasForMode(mode)) },
    ];

    // 2. Sticky Context
    const stickyBlock = this.buildStickyContext(sticky);
    
    // 3. 예산 계산
    let tokens = this.countTokens(header) + this.countTokens(stickyBlock);
    const reserve = this.budget.responseReserve;
    const available = this.budget.total - reserve - this.countTokens(header) - this.countTokens(stickyBlock);

    // 4. 최근 도구 결과 (역순, 예산 내)
    const toolResults = this.extractToolResults(messages);
    const recentResults = this.fitWithinBudget(toolResults.reverse(), available * 0.6);

    // 5. 대화 이력 (역순, 예산 내)
    const conversation = messages.filter(m => m.role !== 'tool').reverse();
    const recentConv = this.fitWithinBudget(conversation, available * 0.4);

    // 6. 오래된 대화 압축 (요약 블록 1개)
    const olderConv = conversation.slice(recentConv.length);
    const summaryBlock = olderConv.length > 0 
      ? await this.summarizeOldTurns(olderConv) 
      : null;

    // 6. 조립 (순서 중요: System → Rules → Tools → Sticky → Summary → Recent Conv → Recent Tool Results → User)
    return [
      ...header,
      stickyBlock,
      ...(summaryBlock ? [summaryBlock] : []),
      ...recentConv.reverse(),      // 시간순 복원
      ...recentResults.reverse(),   // 시간순 복원
      messages[messages.length - 1], // 최신 유저 메시지
    ];
  }

  private fitWithinBudget(msgs: ChatMessage[], budget: number): ChatMessage[] {
    let tokens = 0;
    const result: ChatMessage[] = [];
    for (const msg of msgs) {
      const t = this.countTokens(msg);
      if (tokens + t > budget) break;
      result.push(msg);
      tokens += t;
    }
    return result;
  }
}
```

---

## 4. Compression Pipeline (`src/infra/compaction.ts`)

```typescript
export class CompactionEngine {
  async compact(messages: ChatMessage[], budget: CompactionBudget): Promise<ChatMessage[]> {
    let tokens = this.countTokens(messages);
    if (tokens <= budget.target) return messages;

    // 1. Truncate: tool_result 본문 32KB 캡
    messages = this.truncateToolResults(messages, 32 * 1024);
    if ((tokens = this.countTokens(messages)) <= budget.target) return messages;

    // 2. Drop: 중복 read/grep 결과 제거 (동일 경로/쿼리)
    messages = this.dropDuplicateResults(messages);
    if ((tokens = this.countTokens(messages)) <= budget.target) return messages;

    // 3. Micro-summary: 오래된 tool_result 구간 → bullet 1줄 요약
    messages = await this.microSummarize(messages);
    if ((tokens = this.countTokens(messages)) <= budget.target) return messages;

    // 4. Full compact: 대화 구간 → 요약 1블록으로 치환
    return await this.fullCompact(messages, budget);
  }

  private async fullCompact(msgs: ChatMessage[], budget: CompactionBudget): Promise<ChatMessage[]> {
    // 보호 구간 인덱스 계산
    const protected = this.identifyProtectedIndices(msgs);
    
    // 압축 대상 추출
    const compressible = msgs.filter((_, i) => !protected.has(i));
    
    // 소형 모델로 요약 (또는 휴리스틱)
    const summary = await this.summarizer.summarize(compressible.map(m => m.content).join('\n'), 500);
    
    // 보호 구간 + 요약 블록으로 재구성
    const result = msgs.filter((_, i) => protected.has(i));
    const summaryIdx = msgs.findIndex((_, i) => protected.has(i) && i > 0);
    result.splice(summaryIdx, 0, { 
      role: 'system', 
      content: `## Conversation Summary (auto-compacted)\n${summary}` 
    });
    
    return result;
  }
}
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Prompt & Turn Structure

  Scenario: Context assembly respects budget
    Given 128k context window
    And system+rules+tools+sticky = 30k tokens
    And conversation history = 150k tokens
    When assembling context
    Then total tokens <= 115k (response reserve 13k kept)
    And system, rules, tools, sticky, recent 6 turns preserved
    And older turns summarized into 1 block

  Scenario: Tool result truncation at 32KB
    Given a tool_result with 100KB content
    When assembling context
    Then tool_result truncated to 32KB + "(truncated, path=...)"
    And token count reflects truncated version

  Scenario: Duplicate tool results dropped
    Given two identical `grep("TODO")` results in history
    When compaction runs
    Then second occurrence dropped
    And first retained with note "(duplicate omitted)"

  Scenario: JSON output forced
    Given model configured with `response_format: json_object`
    When model generates tool_calls
    Then output is valid JSON object with `tool_calls` array
    And no free-text outside JSON

  Scenario: Tool call parsing recovers from malformed JSON
    Given model outputs tool_calls with trailing comma
    When parser runs
    Then fence extraction recovers valid JSON
    And tool calls executed successfully
```

---


## Out of Scope

- 프론티어 모델 전용 ‘자율 만능’ 설계를 Tier A에 그대로 적용
- 상세: `00_Master_Context.md` + Harness-14

## 6. References

- `PRD-Infra-02_Context_Assembly.md` — 예산/슬롯 상세
- `PRD-Harness-05_Design_Slogans.md` — 슬로건 3·5번과 연계
- `PRD-C0_Chat_UI_Streaming.md` — 스트리밍 중 툴콜 파싱
- `PRD-Infra-10_Context_Compaction.md` — 컴팩션 파이프라인 상세