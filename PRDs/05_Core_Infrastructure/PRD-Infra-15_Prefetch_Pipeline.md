# PRD-Infra-15: Prefetch Pipeline (프리패치 파이프라인)

> **Category**: Core Infrastructure  
> **Priority**: P0 (중간 모델 필수)  
> **Phase**: C4  
> **관련 PRD**: `PRD-Harness-09_Prefetch_Pattern.md`, `PRD-Harness-12_Routing_Heuristics.md`, `PRD-Infra-03_Indexing_SemanticSearch.md`

---

## 1. Overview

### 목적
에이전트가 **다음에 필요할 도구/컨텍스트를 예측하여 백그라운드로 미리 가져온다**. 중간 모델(Flash-tier)이 "다음 턴 예측 실패"로 인한 지연/실패를 줄이기 위한 핵심 인프라.

### 핵심 가치
- **지연 숨기기**: 사용자 입력 대기 중 백그라운드 프리패치 → 다음 턴 즉시 실행
- **중간 모델 보호**: Flash 모델이 "다음 도구 예측" 실패해도 프리패치된 컨텍스트로 커버
- **토큰 예산 보호**: 미리 가져온 컨텍스트는 압축 예산에서 제외 (sticky budget 사용)

---

## 2. Architecture

### 2.1 프리패치 파이프라인 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    PREFETCH PIPELINE                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │  PREDICTOR   │───▶│  SCHEDULER   │───▶│  FETCHERS    │   │
│  │  (LLM/Heur)  │    │  (Priority)  │    │  (Parallel)  │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│         │                   │                   │             │
│         ▼                   ▼                   ▼             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              PREFETCH CACHE (LRU + TTL)               │   │
│  │  • Tool results (grep, read, search)                 │   │
│  │  │  • Index shards (semantic, symbol)                 │   │
│  │  │  • Context snippets (rules, memories)              │   │
│  │  └────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 핵심 인터페이스

```typescript
// src/infra/prefetch/PrefetchPipeline.ts
export interface PrefetchPipeline {
  predict(context: PredictContext): Promise<PrefetchPlan>;
  execute(plan: PrefetchPlan): Promise<PrefetchResult>;
  getCached(key: PrefetchKey): PrefetchEntry | null;
}

export interface PredictContext {
  sessionId: string;
  turnNumber: number;
  recentMessages: ChatMessage[];      // 최근 6턴
  currentGoal: string;                // 현재 목표 (플랜/사용자 입력)
  activeFiles: string[];              // 현재 열린/편집 중인 파일
  recentTools: ToolCall[];            // 최근 5개 도구 호출
  memories: Memory[];                 // 활성 메모리
  budget: TokenBudget;
}

export interface PrefetchPlan {
  items: PrefetchItem[];
  priority: 'critical' | 'high' | 'normal' | 'low';
  deadlineMs: number;                 // 사용자 다음 입력 예상 전까지
  budgetTokens: number;               // sticky budget에서 차감
}

export interface PrefetchItem {
  key: PrefetchKey;
  type: 'tool_result' | 'index_shard' | 'context_snippet' | 'symbol_def';
  predictor: 'llm' | 'heuristic' | 'pattern';
  confidence: number;                 // 0-1
  estimatedTokens: number;
  fetchFn: () => Promise<PrefetchEntry>;
}
```

---

## 3. Predictors (예측기)

### 3.1 휴리스틱 예측기 (빠름, 비용 0)

```typescript
// src/infra/prefetch/HeuristicPredictor.ts
export class HeuristicPredictor implements Predictor {
  async predict(ctx: PredictContext): Promise<PrefetchItem[]> {
    const items: PrefetchItem[] = [];
    
    // 1. 최근 읽은 파일 → 관련 심볼/정의 프리패치
    for (const file of ctx.activeFiles.slice(0, 3)) {
      items.push({
        key: { type: 'symbol_def', file },
        type: 'symbol_def',
        predictor: 'heuristic',
        confidence: 0.8,
        estimatedTokens: 500,
        fetchFn: () => this.indexer.getSymbolDefinitions(file)
      });
    }

    // 2. 최근 grep/search 쿼리 → 관련 파일 프리패치
    const lastSearch = ctx.recentTools.find(t => t.name === 'grep' || t.name === 'search');
    if (lastSearch) {
      const results = await this.getCachedSearchResults(lastSearch.args.query);
      for (const file of results.slice(0, 5)) {
        items.push({
          key: { type: 'tool_result', tool: 'read_file', path: file },
          type: 'tool_result',
          predictor: 'heuristic',
          confidence: 0.7,
          estimatedTokens: 2000,
          fetchFn: () => this.tools.readFile(file)
        });
      }
    }

    // 3. 현재 목표 키워드 → 인덱스 샤드 프리패치
    const keywords = this.extractKeywords(ctx.currentGoal);
    for (const kw of keywords.slice(0, 3)) {
      items.push({
        key: { type: 'index_shard', query: kw },
        type: 'index_shard',
        predictor: 'heuristic',
        confidence: 0.6,
        estimatedTokens: 1000,
        fetchFn: () => this.indexer.searchShard(kw)
      });
    }

    return items;
  }
}
```

### 3.2 LLM 예측기 (정확, 비용 있음) — 중간 모델용

```typescript
// src/infra/prefetch/LLMPredictor.ts
export class LLMPredictor implements Predictor {
  constructor(private model: LLMProvider) {}

  async predict(ctx: PredictContext): Promise<PrefetchItem[]> {
    const prompt = this.buildPrompt(ctx);
    const response = await this.model.complete(prompt, {
      model: 'flash',  // 저비용 모델
      max_tokens: 500,
      temperature: 0.1
    });

    return this.parsePrediction(response);
  }

  private buildPrompt(ctx: PredictContext): string {
    return `Predict next 3 tool calls for this agent session.

Recent conversation (last 6 turns):
${ctx.recentMessages.map(m => `${m.role}: ${m.content.slice(0,200)}`).join('\n')}

Current goal: ${ctx.currentGoal}
Active files: ${ctx.activeFiles.join(', ')}
Recent tools: ${ctx.recentTools.map(t => `${t.name}(${JSON.stringify(t.args).slice(0,100)})`).join(', ')}
Active memories: ${ctx.memories.map(m => m.title).join(', ')}

Output JSON array of predictions:
[
  {"tool": "read_file", "args": {"path": "src/auth.ts"}, "confidence": 0.9, "reason": "fixing auth bug"},
  {"tool": "grep", "args": {"query": "TODO"}, "confidence": 0.6, "reason": "finding todos"}
]`;
  }
}
```

---

## 4. Scheduler & Execution

### 4.1 우선순위 스케줄러

```typescript
// src/infra/prefetch/PriorityScheduler.ts
export class PriorityScheduler {
  execute(plan: PrefetchPlan): Promise<PrefetchResult> {
    // 1. 예산 체크
    const totalTokens = plan.items.reduce((sum, i) => sum + i.estimatedTokens, 0);
    if (totalTokens > plan.budgetTokens) {
      // 신뢰도 순으로 정렬 후 예산 내 맞춤
      plan.items.sort((a, b) => b.confidence - a.confidence);
      let used = 0;
      plan.items = plan.items.filter(item => {
        if (used + item.estimatedTokens <= plan.budgetTokens) {
          used += item.estimatedTokens;
          return true;
        }
        return false;
      });
    }

    // 2. 우선순위별 배치 실행
    const critical = plan.items.filter(i => i.priority === 'critical');
    const high = plan.items.filter(i => i.priority === 'high');
    const normal = plan.items.filter(i => i.priority === 'normal');

    // Critical: 즉시 병렬 실행
    const criticalResults = await this.runBatch(critical, plan.deadlineMs * 0.5);
    
    // High: 남은 시간의 30%
    const highResults = await this.runBatch(high, plan.deadlineMs * 0.3);
    
    // Normal: 백그라운드 (데드라인 넘겨도 됨)
    const normalResults = this.runBatchBackground(normal);

    return { criticalResults, highResults, normalResults };
  }

  private async runBatch(items: PrefetchItem[], deadlineMs: number): Promise<PrefetchEntry[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), deadlineMs);
    
    try {
      return await Promise.allSettled(
        items.map(item => item.fetchFn().then(r => ({ key: item.key, value: r })))
      ).then(results => results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
```

### 4.2 캐시 전략

```typescript
// src/infra/prefetch/PrefetchCache.ts
export class PrefetchCache {
  private cache = new Map<string, PrefetchEntry>();
  private accessOrder = new Set<string>();  // LRU
  private readonly maxSize = 500;           // 최대 500 항목
  private readonly ttlMs = 5 * 60 * 1000;   // 5분 TTL

  set(key: PrefetchKey, entry: PrefetchEntry): void {
    const k = this.keyToString(key);
    
    // LRU eviction
    if (this.cache.size >= this.maxSize) {
      const oldest = this.accessOrder.values().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    
    this.cache.set(k, { ...entry, timestamp: Date.now() });
    this.accessOrder.add(k);
  }

  get(key: PrefetchKey): PrefetchEntry | null {
    const k = this.keyToString(key);
    const entry = this.cache.get(k);
    if (!entry) return null;
    
    // TTL 체크
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(k);
      this.accessOrder.delete(k);
      return null;
    }
    
    // LRU 갱신
    this.accessOrder.delete(k);
    this.accessOrder.add(k);
    return entry;
  }
}
```

---

## 5. Integration Points

| 통합 지점 | 설명 |
|-----------|------|
| **Agent Loop (C3)** | 턴 종료 시 `prefetchPipeline.predict()` 호출 → 다음 턴 시작 전 `execute()` |
| **Context Assembly** | 프리패치된 컨텍스트 → Sticky Budget 슬롯에 우선 할당 |
| **Routing Heuristics** | 프리패치 성공률 높으면 → Flash 모델 라우팅 신뢰도 ↑ |
| **Verification Loop** | 프리패치된 툴 결과 → 검증 루프에서 즉시 사용 가능 |
| **Indexing** | 인덱스 샤드 프리패치 → 시맨틱 검색 지연 0에 수렴 |

---

## 6. Acceptance Criteria

```gherkin
Feature: Prefetch Pipeline

  Scenario: Heuristic predictor prefetches related files
    Given user just read "src/auth.ts"
    And current goal is "fix login bug"
    When turn ends and prefetch runs
    Then symbol definitions for auth.ts prefetched
    And grep("login") results prefetched
    And index shard for "auth" prefetched
    All within 200ms

  Scenario: LLM predictor used for medium model
    Given model tier = Flash (Tier A)
    And session > 5 turns
    When prefetch runs
    Then LLM predictor called with recent context
    And predictions cached with confidence scores
    And budget ≤ 2000 tokens from sticky budget

  Scenario: Prefetch cache hit eliminates tool latency
    Given "read_file(src/auth.ts)" prefetched in previous turn
    When agent calls read_file(src/auth.ts) in current turn
    Then result returned from cache instantly (<5ms)
    And tool executor not invoked

  Scenario: Budget enforcement
    Given sticky budget = 15000 tokens
    And prefetch plan estimates 20000 tokens
    When scheduler runs
    Then items trimmed by confidence to fit budget
    And critical items always included

  Scenario: TTL expiration
    Given prefetch entry cached 6 minutes ago
    When cache accessed
    Then entry expired and removed
    And fresh fetch triggered if needed
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 7. References

- `PRD-Harness-09_Prefetch_Pattern.md` — 프리패치 패턴 설계 철학
- `PRD-Harness-12_Routing_Heuristics.md` — 라우팅 휴리스틱과 연동
- `PRD-Infra-03_Indexing_SemanticSearch.md` — 인덱스 샤드 프리패치
- `PRD-Harness-04_Memories_Minimal.md` — 메모리도 프리패치 대상
- `PRD-Spec-03_Context_Budget.md` — Sticky Budget 슬롯