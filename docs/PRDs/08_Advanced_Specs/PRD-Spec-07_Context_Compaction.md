# PRD-Spec-07: Context Compaction (컨텍스트 압축)

> **Category**: Advanced Specs  
> **Priority**: ⑦ (마지막)  
> **Phase**: C4 (긴 세션 대응, C3 멀티턴 완성 후)  
> **관련 PRD**: `PRD-Infra-02_Context_Assembly.md`, `PRD-Harness-07_Prompt_Turn_Structure.md`, `PRD-Harness-11_Context_Rules.md`

---

## 1. Overview

### 목적
긴 멀티턴 대화(50+ 턴)에서 **토큰 예산 초과 방지**를 위해, 오래된/중복된 컨텍스트를 **단계적으로 압축**한다. **핵심 정보(시스템, 규칙, 최근 6턴, 현재 목표, 메모리, 아티팩트)는 절대 삭제 안 함**을 보장.

### 비즈니스 가치
- **세션 연속성**: 100턴 넘어도 "지금 고치는 파일/에러" 항상 기억
- **비용 제어**: 토큰 예산 초과로 인한 강제 종료/에러 방지
- **중급 모델 보호**: Flash 모델도 50턴 세션 소화 가능

---

## 2. Compression Budget & Trigger

### 2.1 예산 설정 (128k 컨텍스트 기준)

| 슬롯 | 비율 | 토큰 | 보호 |
|------|------|------|------|
| System + Mode | 5% | 6,400 | ✅ 절대 보호 |
| Rules | 5% | 6,400 | ✅ 보호 |
| Tool Schemas | 8% | 10,240 | ✅ 보호 |
| Sticky Context | 12% | 15,360 | ✅ 보호 |
| Conversation + Tool Results | 60% | 76,800 | 🔄 압축 대상 |
| Response Reserve | 10% | 13,312 | ✅ 보호 |

### 2.2 압축 트리거
| 트리거 | 조건 | 액션 |
|--------|------|------|
| **사전 예방** | 예상 토큰 > 90% 예산 (115k) | 다음 턴 전 자동 실행 |
| **강제** | 실제 토큰 > 95% 예산 (121k) | 즉시 실행 (턴 중간이라도) |
| **수동** | 사용자 `/compact` 명령 | 즉시 실행 |
| **주기적** | 매 20턴마다 | 백그라운드 실행 |

---

## 2. Compression Pipeline (4단계 순차 적용)

| 단계 | 동작 | 비용 | 보호 구간 |
|------|------|------|-----------|
| **1. Truncate** | 오래된 tool_result 본문 절단 (32KB 캡) | 무료 | System, Rules, Sticky, 최근 6턴 |
| **2. Drop** | 중복 read/grep 결과 제거 (동일 경로/쿼리) | 무료 | 동일 |
| **3. Micro-summary** | 오래된 구간 → bullet 요약으로 치환 (소형 모델/휴리스틱) | 저 | 동일 |
| **4. Full compact** | 대화 전체 → 요약 1블록으로 치환 (대형 모델) | 고 | System, Rules, 최근 6턴, 현재 목표, Memories, Artifacts |

**각 단계 후 토큰 수 재계산 → 목표(≤ 90%) 달성 시 중단**

---

## 3. Technical Spec

### 3.1 보호 구간 식별 (`src/infra/contextProtection.ts`)

```typescript
function identifyProtectedIndices(messages: ChatMessage[]): Set<number> {
  const protected = new Set<number>();
  
  // 0. System messages (항상 첫 번째)
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'system') protected.add(i);
    else break;
  }

  // 1. Rules block (## Active Rules 헤더 다음 메시지)
  // 2. Sticky Context (## Sticky Context 헤더)
  // 3. Memories (## Active Memories 헤더)
  // 4. Artifacts (## Pinned Artifacts 헤더)
  // → 헤더 기반 탐지 + 메타데이터 `source: 'sticky'|'memory'|'artifact'`

  // 4. Recent 6 turns (from end)
  let turnCount = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' || messages[i].role === 'assistant') {
      if (turnCount < 6) protected.add(i);
      turnCount++;
      if (turnCount >= 6) break;
    }

  // 5. Current user goal (last user message)
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      protected.add(i);
      break;
    }
  }

  return protected;
}
```

### 3.2 압축 엔진 (`src/infra/compaction.ts`)

```typescript
export class CompactionEngine {
  constructor(
    private tokenizer: Tokenizer,
    private summarizer: Summarizer,  // 소형 모델 또는 휴리스틱
    private budget: CompactionBudget
  ) {}

  async compact(messages: ChatMessage[], budget: CompactionBudget): Promise<CompactionResult> {
    let tokens = this.countTokens(messages);
    if (tokens <= budget.target) return { messages, stats: { beforeTokens: tokens, afterTokens: tokens, stage: 0 } };
    
    let working = [...messages];
    let stats = { beforeTokens: tokens, afterTokens: 0, stage: 0, truncatedResults: 0, droppedResults: 0, summarizedTurns: 0 };

    // 1단계: Truncate tool results (32KB cap)
    working = this.truncateToolResults(working, 32 * 1024);
    stats.truncatedResults = this.countTruncated(working);
    if ((tokens = this.countTokens(working)) <= budget.target) return this.finalize(working, stats, 1);

    // 2단계: Drop duplicates
    working = this.dropDuplicateResults(working);
    stats.droppedResults = this.countDropped(working);
    if ((tokens = this.countTokens(working)) <= budget.target) return this.finalize(working, stats, 2);

    // 3단계: Micro-summary (heuristic/소형 모델)
    working = await this.microSummarize(working, budget);
    stats.summarizedTurns = this.countSummarized(working);
    if ((tokens = this.countTokens(working)) <= budget.target) return this.finalize(working, stats, 3);

    // 4단계: Full compact (최후 수단)
    working = await this.fullCompact(working, budget);
    stats.afterTokens = this.countTokens(working);
    return this.finalize(working, stats, 4);
  }

  private truncateToolResults(msgs: ChatMessage[], maxBytes: number): ChatMessage[] {
    return msgs.map(msg => {
      if (msg.role !== 'tool') return msg;
      const content = msg.content;
      if (Buffer.byteLength(content, 'utf8') <= maxBytes) return msg;
      
      const truncated = Buffer.from(content, 'utf8').subarray(0, maxBytes).toString('utf8');
      const omitted = Buffer.byteLength(content, 'utf8') - maxBytes;
      return {
        ...msg,
        content: truncated + `\n…(truncated, ${omitted} bytes omitted, path=${msg.metadata?.path || 'unknown'})`,
        metadata: { ...msg.metadata, truncated: true, originalBytes: Buffer.byteLength(content, 'utf8') }
      };
    });
  }

  private dropDuplicateResults(msgs: ChatMessage[]): ChatMessage[] {
    const seen = new Set<string>();
    return msgs.filter(msg => {
      if (msg.role !== 'tool') return true;
      const key = `${msg.metadata?.toolName}:${msg.metadata?.path || msg.metadata?.query}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async microSummarize(msgs: ChatMessage[], budget: CompactionBudget): Promise<ChatMessage[]> {
    // 보호 구간 이후, 압축 가능 구간에서 오래된 tool_result 구간을 bullet 요약으로 치환
    // 휴리스틱: "read_file(src/auth.ts) → 120 lines" 같은 1줄 요약
    // 또는 소형 모델(fast-summarizer)로 구간 요약 생성
  }

  private async fullCompact(msgs: ChatMessage[], budget: CompactionBudget): Promise<ChatMessage[]> {
    const protectedIdx = this.identifyProtectedIndices(msgs);
    const compressible = msgs.filter((_, i) => !protectedIdx.has(i));
    
    const summary = await this.summarizer.summarize(
      compressible.map(m => m.content).join('\n'),
      500  // 최대 500 토큰 요약
    );
    
    // 보호 구간 + 요약 블록으로 재구성
    const result: ChatMessage[] = [];
    for (let i = 0; i < msgs.length; i++) {
      if (protectedIdx.has(i)) result.push(msgs[i]);
      else if (i === Math.min(...Array.from(protectedIdx).filter(i => i > 0))) {
        // 첫 번째 보호 구간 직전에 요약 블록 삽입
        result.push({
          role: 'system',
          content: `## Conversation Summary (auto-compacted)\n${summary}`
        });
      }
    }
    return result;
  }
}
```

### 3.2 Summarizer Interface

```typescript
export interface Summarizer {
  summarize(text: string, maxTokens: number): Promise<string>;
}

// 구현체 1: 휴리스틱 (빠름, 비용 0)
export class HeuristicSummarizer implements Summarizer {
  async summarize(text: string, maxTokens: number): Promise<string> {
    // 도구 결과 라인만 추출 → "read_file(x.ts) 120L, grep(TODO) 3 hits" 형태
    const toolLines = text.match(/^\[tool:.*\]/gm) || [];
    const summary = toolLines.slice(0, 20).join('\n');
    return `## Conversation Summary (heuristic)\n${summary}\n... (${toolLines.length} tool calls total)`;
  }
}

// 구현체 2: 소형 모델 (정확, 비용 낮음)
export class ModelSummarizer implements Summarizer {
  constructor(private model: LLMProvider) {}
  
  async summarize(text: string, maxTokens: number): Promise<string> {
    const prompt = `Summarize this agent conversation in ${maxTokens} tokens, focusing on: goals, key findings, decisions made, current task.\n\n${text}`;
    return this.model.complete(prompt, { max_tokens: maxTokens, temperature: 0.1 });
  }
}
```

---

## 3. Acceptance Criteria

```gherkin
Feature: Context Compaction

  Scenario: Stage 1 truncates long tool results
    Given a tool_result with 100KB content
    And total tokens at 92% budget
    When compaction runs
    Then tool_result truncated to 32KB + "(truncated, 68KB omitted)"
    And token count reflects truncated version
    And total tokens drop below 90%

  Scenario: Stage 2 drops duplicate grep results
    Given two identical grep("TODO") tool_results in history
    And budget pressure
    When compaction runs
    Then second grep result dropped
    And first retained with "(duplicate omitted)" note

  Scenario: Stage 3 micro-summarizes old turns
    Given 20 turns of conversation at 95% budget
    When compaction runs stage 3
    Then turns 1-14 replaced with single summary block
    And turns 15-20 (recent 6) preserved verbatim
    And summary mentions: files read, key findings, current goal

  Scenario: Stage 4 full compact last resort
    Given 50 turns at 98% budget after stages 1-3
    When full compact runs
    Then entire compressible history → 1 summary block
    And protected zones (system, rules, recent 6, goal, memories) intact
    And token count drops to < 70%

  Scenario: Protected zones never touched
    Given compaction at any stage
    When checking output
    Then system prompt identical
    And active rules identical
    And recent 6 turns verbatim
    And current user goal identical
    And memories/artifacts intact

  Scenario: Manual /compact command
    Given user types "/compact"
    When command executes
    Then compaction runs immediately
    And stats toast shown: "Compacted: 145k → 89k tokens (Stage 3)"

  Scenario: Compaction stats logged
    Given compaction runs
    Then log entry: "compaction: before=142k after=87k stage=3 truncated=12 dropped=5 summarized=12"
```

---


## Out of Scope

- Spec 범위를 넘는 제품 기능 (Feature PRD로 위임)
- 상세: Canonical Owner Matrix

## 4. References

- `PRD-Infra-02_Context_Assembly.md` — 예산/슬롯 상세
- `PRD-Harness-07_Prompt_Turn_Structure.md` — 프롬프트/턴 구조
- `PRD-Harness-11_Context_Rules.md` — A티어 예산 수치
- `PRD-Harness-04_Memories_Minimal.md` — 메모리도 보호 구간
- `PRD-16_Chat_Search_Artifacts.md` — 아티팩트도 보호 구간