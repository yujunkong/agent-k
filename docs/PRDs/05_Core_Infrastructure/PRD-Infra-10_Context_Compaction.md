# PRD-Infra-10: Context Compaction (컨텍스트 압축)

> **Category**: Core Infrastructure  
> **Phase**: C4 (긴 세션 대응)  
> **관련 PRD**: `PRD-Infra-02_Context_Assembly.md`, `PRD-C3_Agent_MultiTurn.md`, `PRD-Harness-04_Memories_Minimal.md`

---

## 1. Overview

### 목적
긴 멀티턴 대화(50+ 턴)에서 **토큰 예산 초과 방지**를 위해, 오래된/중복된 컨텍스트를 **단계적으로 압축**한다. 핵심 정보(시스템, 규칙, 최근 6턴, 현재 목표)는 **절대 삭제 안 함**을 보장.

### 비즈니스 가치
- **세션 연속성**: 100턴 넘어가도 "지금 고치는 파일/에러" 기억 유지
- **비용 제어**: 토큰 예산 초과로 인한 강제 종료/에러 방지
- **중급 모델 보호**: Flash 모델도 50턴 세션 소화 가능

---

## 2. Functional Requirements

### 2.1 압축 트리거
| 트리거 | 조건 | 액션 |
|--------|------|------|
| **사전 예방** | 예상 토큰 > 90% 예산 | 다음 턴 전 자동 실행 |
| **강제** | 실제 토큰 > 95% 예산 | 즉시 실행 (턴 중간이라도) |
| **수동** | 사용자 `/compact` 명령 | 즉시 실행 |
| **주기적** | 매 20턴마다 | 백그라운드 실행 |

### 2.2 압축 4단계 (순차 적용, 각 단계 후 예산 체크)
| 단계 | 동작 | 비용 | 보호 구간 |
|------|------|------|-----------|
| **1. Truncate** | 오래된 tool_result 본문 절단 (32KB 캡) | 무료 | System, Rules, 최근 6턴 |
| **2. Drop** | 중복 read/grep 결과 제거 (동일 경로/쿼리) | 무료 | 동일 |
| **3. Micro-summary** | 오래된 구간을 bullet 요약으로 치환 (소형 모델/휴리스틱) | 저 | 동일 |
| **4. Full compact** | 대화 전체를 요약 1블록으로 치환 (대형 모델) | 고 | System, Rules, 최근 6턴, 현재 목표 |

### 2.3 보호 구간 (Never Compact)
| 보호 대상 | 이유 |
|-----------|------|
| System + Mode Prompt | 에이전트 정체성/규칙 |
| Active Rules | 매칭된 규칙 블록 |
| Sticky Context | 열린 탭, @멘션, 선택 영역, 현재 진단 |
| Recent 6 Turns | 즉시 직전 맥락 |
| Current User Goal | 마지막 사용자 메시지 |
| Active Memories | 메모리 주입 블록 |
| Active Artifacts | 고정된 Diff/스크린샷/코드 블록 |

---

## 3. Technical Spec

### 3.1 압축 엔진 (`src/infra/compaction.ts`)

```typescript
export interface CompactionBudget {
  total: number;           // 131072 (128k)
  system: number;          // 6400
  rules: number;           // 6400
  tools: number;           // 10240
  sticky: number;          // 15360
  conversation: number;    // 76800
  responseReserve: number; // 13312
}

export interface CompactionResult {
  messages: ChatMessage[];
  stats: {
    beforeTokens: number;
    afterTokens: number;
    stage: 1 | 2 | 3 | 4;
    truncatedResults: number;
    droppedResults: number;
    summarizedTurns: number;
  };
}

export class CompactionEngine {
  constructor(
    private tokenizer: Tokenizer,
    private summarizer: Summarizer,  // 소형 모델 또는 휴리스틱
    private budget: CompactionBudget
  ) {}

  async compact(messages: ChatMessage[], budget: CompactionBudget): Promise<CompactionResult> {
    let currentTokens = this.countTokens(messages);
    if (currentTokens <= budget.conversation + budget.sticky + budget.tools + budget.rules + budget.system) {
      return { messages, stats: { beforeTokens: currentTokens, afterTokens: currentTokens, stage: 0 } };
    }

    // 보호 구간 분리
    const { protected: protectedMsgs, compressible: compressibleMsgs } = this.splitProtected(messages);
    let working = [...compressibleMsgs];
    let tokens = this.countTokens([...protectedMsgs, ...working]);
    let stage = 0;

    // 1단계: Truncate tool results
    if (tokens > this.targetTokens) {
      working = this.truncateToolResults(working, 32 * 1024);
      tokens = this.countTokens([...protectedMsgs, ...working]);
      stage = 1;
    }

    // 2단계: Drop duplicate reads/greps
    if (tokens > this.targetTokens) {
      working = this.dropDuplicates(working);
      tokens = this.countTokens([...protectedMsgs, ...working]);
      stage = 2;
    }

    // 3단계: Micro-summary (heuristic/소형 모델)
    if (tokens > this.targetTokens) {
      working = await this.microSummarize(working);
      tokens = this.countTokens([...protectedMsgs, ...working]);
      stage = 3;
    }

    // 4단계: Full compact (마지막 수단)
    if (tokens > this.targetTokens) {
      working = await this.fullCompact(working);
      tokens = this.countTokens([...protectedMsgs, ...working]);
      stage = 4;
    }

    return {
      messages: [...protectedMsgs, ...working],
      stats: { beforeTokens: this.countTokens(messages), afterTokens: tokens, stage, ... }
    };
  }

  private splitProtected(msgs: ChatMessage[]): { protected: ChatMessage[], compressible: ChatMessage[] } {
    const protectedIndices = new Set<number>();
    
    // System, Rules, Sticky, Recent 6, Current Goal, Memories, Artifacts 인덱스 수집
    // 구현: 메시지 타입/메타데이터/타임스탬프 기반 식별
    
    return {
      protected: msgs.filter((_, i) => protectedIndices.has(i)),
      compressible: msgs.filter((_, i) => !protectedIndices.has(i)),
    };
  }

  private truncateToolResults(msgs: ChatMessage[], maxBytes: number): ChatMessage[] {
    return msgs.map(msg => {
      if (msg.role !== 'tool') return msg;
      const content = msg.content;
      if (Buffer.byteLength(content, 'utf8') <= maxBytes) return msg;
      
      const truncated = Buffer.from(content, 'utf8').subarray(0, maxBytes).toString('utf8');
      return {
        ...msg,
        content: truncated + '\n…(truncated, ' + (Buffer.byteLength(content) - maxBytes) + ' bytes omitted)',
        metadata: { ...msg.metadata, truncated: true, originalBytes: Buffer.byteLength(content) }
      };
    });
  }

  private dropDuplicates(msgs: ChatMessage[]): ChatMessage[] {
    const seen = new Set<string>();
    return msgs.filter(msg => {
      if (msg.role !== 'tool') return true;
      const key = `${msg.tool_name}:${msg.args.path || msg.args.query || msg.args.pattern}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async microSummarize(msgs: ChatMessage[]): Promise<ChatMessage[]> {
    // 휴리스틱: tool_result 중 오래된 것들을 "read_file(src/auth.ts) → 120 lines" 같은 한 줄로 치환
    // 또는 소형 모델(fast-summarizer)로 구간 요약
    // 구현: 메시지 역순으로 순회하며 오래된 tool_result 구간 감지 → 요약 블록 1개로 치환
  }

  private async fullCompact(msgs: ChatMessage[]): Promise<ChatMessage[]> {
    // 대형 모델로 전체 대화 요약 1블록 생성
    // "User asked to fix auth bug. Agent explored auth module, found missing null check, applied fix, tests passed."
    // 이 1개 메시지로 전체 compressible 구간 대체
  }
}
```

### 3.2 보호 구간 식별 (`src/infra/contextProtection.ts`)

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
  // 3. Memories (## Active Memories)
  // 4. Artifacts (## Pinned Artifacts)

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

---

## 4. Acceptance Criteria

```gherkin
Feature: Context Compaction

  Scenario: Stage 1 truncates long tool results
    Given a tool_result with 100KB content
    And total tokens at 92% budget
    When compaction runs
    Then tool_result truncated to 32KB + "(truncated, 68KB omitted)"
    And total tokens reduced below 90%

  Scenario: Stage 2 drops duplicate grep results
    Given two identical grep tool_results for "TODO" in same turn
    And budget pressure
    When compaction runs
    Then second grep result dropped
    And first retained with "(duplicate omitted)" note

  Scenario: Stage 3 micro-summarizes old turns
    Given 15 turns of conversation at 95% budget
    When compaction runs
    Then turns 1-9 replaced with summary block
    And turns 10-15 (recent 6) preserved verbatim
    And summary: "Explored auth module, found 3 files, identified null check bug"

  Scenario: Stage 4 full compact last resort
    Given 50 turns at 98% budget after stages 1-3
    When full compact triggers
    Then entire compressible history → 1 summary block
    And protected segments (system, rules, recent 6, goal, memories) intact

  Scenario: Protection zones never touched
    Given compaction at any stage
    When checking output
    Then system prompt identical
    And active rules identical
    And recent 6 turns verbatim
    And current user goal identical
    And memories/artifacts intact

  Scenario: Manual /compact command
    When user types "/compact"
    Then compaction runs immediately
    And stats toast shown: "Compacted: 145k → 89k tokens (Stage 3)"
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 5. References

- `PRD-Infra-02_Context_Assembly.md` — 컨텍스트 조립 예산과 슬롯
- `PRD-C3_Agent_MultiTurn.md` — 멀티턴 루프에서 압축 트리거
- `PRD-Harness-04_Memories_Minimal.md` — 메모리도 보호 구간
- `PRD-Harness-11_Context_Rules.md` — 컨텍스트 예산 수치