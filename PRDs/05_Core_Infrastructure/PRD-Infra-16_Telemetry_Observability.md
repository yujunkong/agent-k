# PRD-Infra-16: Telemetry & Observability (텔레메트리 & 관측가능성)

> **Category**: Core Infrastructure  
> **Priority**: P1  
> **Phase**: C5 (Production hardening)  
> **관련 PRD**: `PRD-Infra-14_Tool_Call_Orchestration.md`, `PRD-Infra-11_Doom_Loop_Detection.md`, `PRD-16_Chat_Search_Artifacts.md`

---

## 1. Overview

### 목적
에이전트 동작의 **가시성(Observability)**을 확보하여: 디버깅, 성능 튜닝, 비용 추적, 품질 메트릭 수집을 가능하게 한다.

### 핵심 메트릭 카테고리
| 카테고리 | 지표 | 용도 |
|----------|------|------|
| **Latency** | Tool latency (p50/p95/p99), Turn latency, Prefetch hit latency | 성능 병목 식별 |
| **Cost** | Tokens in/out per turn, Model cost per session, Tool call cost | 예산 관리 |
| **Quality** | Verification pass rate, Doom loop detection rate, Rollback rate | 품질 모니터링 |
| **Reliability** | Error rates by type, Retry rates, Timeout rates | 안정성 추적 |
| **Usage** | Tool usage distribution, Model tier distribution, Feature adoption | 제품 의사결정 |

---

## 2. Telemetry Schema

### 2.1 이벤트 스키마 (OpenTelemetry 호환)

```typescript
// src/telemetry/events.ts
export interface TelemetryEvent {
  // 공통
  timestamp: number;           // Unix ms
  sessionId: string;           // 세션 ID
  turnNumber: number;          // 턴 번호
  eventType: TelemetryEventType;
  
  // 컨텍스트
  modelTier: 'A' | 'B' | 'C';  // Flash/Pro/Base
  modelId: string;             // 예: "gemini-2.5-flash"
  
  // 페이로드 (이벤트 타입별)
  payload: TelemetryPayload;
}

export type TelemetryEventType = 
  | 'turn.start' | 'turn.end'
  | 'tool.call.start' | 'tool.call.end' | 'tool.call.error'
  | 'verification.start' | 'verification.end' | 'verification.failed'
  | 'prefetch.predict' | 'prefetch.execute' | 'prefetch.hit' | 'prefetch.miss'
  | 'compaction.triggered' | 'compaction.completed'
  | 'checkpoint.created' | 'checkpoint.restored' | 'rollback.executed'
  | 'doom_loop.detected' | 'doom_loop.recovered'
  | 'routing.decision' | 'routing.fallback'
  | 'permission.requested' | 'permission.granted' | 'permission.denied'
  | 'token.budget.exceeded' | 'token.budget.warning';

export type TelemetryPayload =
  | TurnStartPayload
  | TurnEndPayload
  | ToolCallPayload
  | VerificationPayload
  | PrefetchPayload
  | CompactionPayload
  | CheckpointPayload
  | DoomLoopPayload
  | RoutingPayload
  | PermissionPayload
  | BudgetPayload;

export interface TurnStartPayload {
  userMessageLength: number;
  contextTokens: number;
  activeTools: string[];
  activeMemories: number;
}

export interface TurnEndPayload {
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  toolCalls: number;
  verificationLoops: number;
  compactionStage: number;  // 0=none, 1-4
  success: boolean;
  error?: string;
}

export interface ToolCallPayload {
  toolName: string;
  argsHash: string;           // 인수 해시 (PII 방지)
  durationMs: number;
  success: boolean;
  errorType?: string;         // 'timeout' | 'permission' | 'schema' | 'execution'
  retryCount: number;
  verificationRequired: boolean;
  verificationPassed?: boolean;
  resultTokens: number;
  prefetched: boolean;
}

export interface VerificationPayload {
  toolName: string;
  attempt: number;
  passed: boolean;
  errorType?: string;
  fixSuggested?: boolean;
  fixApplied?: boolean;
}

export interface PrefetchPayload {
  predictor: 'llm' | 'heuristic' | 'pattern';
  itemsPredicted: number;
  itemsExecuted: number;
  cacheHits: number;
  cacheMisses: number;
  latencyMs: number;
  budgetUsed: number;
}

export interface CompactionPayload {
  trigger: 'preemptive' | 'forced' | 'manual' | 'periodic';
  stage: 1 | 2 | 3 | 4;
  beforeTokens: number;
  afterTokens: number;
  protectedZones: string[];   // ['system', 'rules', 'recent6', 'goal', 'memories', 'artifacts']
  durationMs: number;
}

export interface DoomLoopPayload {
  pattern: 'tool_oscillation' | 'verification_loop' | 'context_regression' | 'tool_failure_retry';
  iterations: number;
  turnsSinceStart: number;
  recoveryAction: 'checkpoint_rollback' | 'model_escalation' | 'user_intervention' | 'turn_limit';
  recovered: boolean;
}

export interface RoutingPayload {
  requestedTier: 'A' | 'B' | 'C';
  actualTier: 'A' | 'B' | 'C';
  reason: 'complexity' | 'tool_count' | 'verification_failures' | 'user_preference' | 'cost_budget';
  confidence: number;
}
```

---

## 3. Collection & Export

### 3.1 컬렉터 아키텍처

```typescript
// src/telemetry/TelemetryCollector.ts
export class TelemetryCollector {
  private buffer: TelemetryEvent[] = [];
  private readonly flushInterval = 5000;  // 5초
  private readonly maxBufferSize = 1000;
  
  constructor(
    private exporters: TelemetryExporter[],
    private config: TelemetryConfig
  ) {
    this.startPeriodicFlush();
  }

  record(event: TelemetryEvent): void {
    // PII 스크러빙
    const sanitized = this.sanitize(event);
    this.buffer.push(sanitized);
    
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  private sanitize(event: TelemetryEvent): TelemetryEvent {
    // 파일 경로 → 해시, 사용자 입력 → 길이만, API 키 → 마스킹
    return {
      ...event,
      payload: this.sanitizePayload(event.payload)
    };
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    
    const events = this.buffer.splice(0, this.buffer.length);
    await Promise.all(
      this.exporters.map(exp => exp.export(events).catch(err => 
        console.error('Telemetry export failed:', err)
      ))
    );
  }
}
```

### 3.2 익스포터 구현체

```typescript
// 로컬 개발용: 콘솔 + 파일
export class ConsoleExporter implements TelemetryExporter {
  async export(events: TelemetryEvent[]): Promise<void> {
    for (const event of events) {
      console.log('[TELEMETRY]', JSON.stringify(event));
    }
  }
}

// 프로덕션: OTLP (OpenTelemetry Protocol)
export class OTLPExporter implements TelemetryExporter {
  constructor(private endpoint: string, private apiKey?: string) {}
  
  async export(events: TelemetryEvent[]): Promise<void> {
    await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
      },
      body: JSON.stringify({ events })
    });
  }
}

// VS Code 출력 채널
export class VSCodeOutputExporter implements TelemetryExporter {
  constructor(private channel: vscode.OutputChannel) {}
  
  async export(events: TelemetryEvent[]): Promise<void> {
    for (const event of events) {
      this.channel.appendLine(`[${new Date(event.timestamp).toISOString()}] ${event.eventType}: ${JSON.stringify(event.payload)}`);
    }
  }
}
```

---

## 4. Dashboards & Alerts (권장)

### 4.1 핵심 대시보드 패널

| 패널 | 쿼리 | 임계값 알림 |
|------|------|-------------|
| **Turn Latency P95** | `histogram_quantile(0.95, rate(turn_duration_ms_bucket[5m]))` | > 30s |
| **Verification Pass Rate** | `rate(verification_passed_total[5m]) / rate(verification_total[5m])` | < 80% |
| **Doom Loop Rate** | `rate(doom_loop_detected_total[5m])` | > 0.1/min |
| **Token Cost per Session** | `sum(session_tokens_out) / count(session_id)` | > $0.50 |
| **Prefetch Hit Rate** | `rate(prefetch_hit_total[5m]) / rate(prefetch_total[5m])` | < 50% |
| **Rollback Rate** | `rate(rollback_executed_total[5m]) / rate(turn_total[5m])` | > 5% |
| **Model Tier Distribution** | `count by (model_tier) (turn_start_total)` | Tier C > 50% |

### 4.2 알림 규칙

```yaml
# alerts.yml
groups:
  - name: agent-quality
    rules:
      - alert: HighDoomLoopRate
        expr: rate(doom_loop_detected_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Doom loop detection rate high"
          
      - alert: VerificationPassRateLow
        expr: rate(verification_passed_total[5m]) / rate(verification_total[5m]) < 0.8
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Verification pass rate below 80%"
          
      - alert: TurnLatencyHigh
        expr: histogram_quantile(0.95, rate(turn_duration_ms_bucket[5m])) > 30000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P95 turn latency exceeds 30s"
```

---

## 5. Privacy & Compliance

| 데이터 유형 | 처리 방식 |
|-------------|-----------|
| **사용자 코드/파일 내용** | 절대 수집 안 함 (해시만) |
| **사용자 입력 텍스트** | 길이만 수집, 내용 마스킹 |
| **파일 경로** | 프로젝트 상대 경로만, 홈 디렉토리 마스킹 |
| **API 키/시크릿** | 텔레메트리 진입점에서 완전 제거 |
| **세션 ID** | 해시화된 익명 ID 사용 |

---

## 6. Acceptance Criteria

```gherkin
Feature: Telemetry & Observability

  Scenario: Turn lifecycle events emitted
    Given a new agent session starts
    When user sends a message
    Then turn.start event emitted with context tokens
    And turn.end event emitted with duration, tokens, tool count
    And all events have sessionId, turnNumber, modelTier

  Scenario: Tool call telemetry captured
    Given agent calls read_file tool
    When tool executes
    Then tool.call.start emitted
    And tool.call.end emitted with duration, success, resultTokens
    And if verification required, verification events emitted

  Scenario: Prefetch telemetry tracked
    Given prefetch pipeline runs
    When prediction and execution complete
    Then prefetch.predict, prefetch.execute events emitted
    And cache hit/miss recorded
    And budget usage tracked

  Scenario: Doom loop detection logged
    Given doom loop detector triggers
    When pattern detected
    Then doom_loop.detected event with pattern, iterations, recoveryAction
    And if recovered, doom_loop.recovered event

  Scenario: PII never exported
    Given user inputs "password=secret123" in chat
    And file path "/home/user/.ssh/id_rsa" read
    When telemetry exported
    Then password value not in any payload
    And file path hashed or truncated to "id_rsa"

  Scenario: Local development console output
    Given telemetry enabled in dev mode
    When events occur
    Then formatted JSON logged to VS Code Output Channel "Agent-K Telemetry"
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 7. References

- `PRD-Infra-14_Tool_Call_Orchestration.md` — 도구 호출 이벤트 소스
- `PRD-Infra-11_Doom_Loop_Detection.md` — 둠 루프 이벤트
- `PRD-Harness-10_Verification_MicroLoop.md` — 검증 이벤트
- `PRD-Spec-03_Context_Budget.md` — 예산 이벤트
- OpenTelemetry Specification — 익스포트 프로토콜 표준