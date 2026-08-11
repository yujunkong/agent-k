# PRD-17: 메시지 큐 (Message Queue — Cursor형 중단·종합·재시작)

> **Priority**: A급 (장시간 Agent UX)  
> **Phase**: C3~C4  
> **관련 PRD**: `PRD-C3_Agent_MultiTurn.md`, `PRD-Infra-12_MaxTurns_Timeout_Stop.md`, `PRD-Infra-09_Checkpoints_Rollback.md`, `PRD-12_Side_Chat.md`, `PRD-29_Settings_Hub.md`  
> **벤치마크**: Cursor — Agent 실행 중 전송 시 **기존 작업 중단 → 지시 종합 → 루프 재시작**

---

## 1. Overview

### 목적
Agent가 **멀티턴 실행 중**일 때 사용자가 후속 지시를 넣으면, Cursor처럼 **현재 실행을 끊고** 대기열·새 입력을 **한 덩어리로 종합**한 뒤 Tool Loop를 **다시 시작**한다.

### 비즈니스 가치
- “잠깐, 그거 말고 / 거기에 로그도”를 **지금** 반영 (끝날 때까지 기다리지 않음)
- 여러 후속 지시를 쌓아 두었다가 **한 번에 종합 재개**
- 부분 Review / Checkpoint는 유지해 되돌릴 여지 확보

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | Agent가 파일 고치는 중 “로그도 추가해”를내면 **하던 일 멈추고** 새 지시 반영해 다시 돌았으면 한다 |
| US-02 | 지시 2~3개를 먼저 쌓아 두고, 다시 전송하면 **전부 합쳐서** 재시작했으면 한다 |
| US-03 | 쌓아만 두고 Agent는 계속 돌게 할 수도 있었으면 한다 (Queue-only) |
| US-04 | 큐 항목을 드래그·삭제·편집할 수 있으면 한다 |

---

## 2. Functional Requirements

### 2.1 모드 정의 (Cursor-first)

| 모드 | 트리거 | 동작 |
|------|--------|------|
| **Interrupt & Resynthesize** (기본) | Agent **실행 중** `Enter` / Send / `Ctrl+Enter` / `Cmd+Enter` | Abort → 큐+새문구 **종합** → Tool Loop **재시작** |
| **Queue-only** | `Alt+Enter` 또는 UI “Queue” | enqueue만 · **Abort 없음** · 뱃지 `Queued: N` |
| **Idle Send** | Agent **대기** 중 Enter | 일반 새 user 턴 시작 (기존과 동일) |
| **Newline** | `Shift+Enter` | 입력창 줄바꿈 (전송 아님) |

> 원본 문서의 “Cmd+Enter=즉시 끼워넣기”는 본 PRD에서 **Interrupt & Resynthesize와 동일 계열**로 통일한다.  
> (구안: “턴 종료까지 큐만”은 Queue-only로 격하.)

### 2.2 큐 자료구조
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 용량 | 최대 50 · 초과 시 가장 오래된 항목 드롭 + 알림 |
| FR-02 | 타입 | `user_instruction` · (내부) `resynthesize_trigger` |
| FR-03 | 순서 | FIFO · UI에서 Reorder |
| FR-04 | 영속성 | 세션 종료 시 폐기 (기본) |
| FR-05 | Queue-only | Abort 없이 push만 |

### 2.3 Interrupt & Resynthesize 파이프라인
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-10 | Abort | `AbortController`로 모델 HTTP 스트림 취소 · 진행 중 셸은 Spec-04 취소 정책 |
| FR-11 | 도구 중 | in-flight readonly는 best-effort cancel · write는 원자성 보장 후 중단 · Pending Review 유지 |
| FR-12 | 종합(Synthesize) | `queued[0..n] + newText` → 단일 user 메시지 블록으로 병합 (아래 포맷) |
| FR-13 | 큐 drain | 종합에 넣은 항목은 큐에서 제거 |
| FR-14 | 재시작 | 새 user 턴으로 Tool Loop 재진입 · sticky context(@파일·Rules·활성 todo) 유지 |
| FR-15 | 시스템 노트 | assistant/system에 짧게: `User interrupted; continuing with updated instructions.` |
| FR-16 | Checkpoint | 이미 만든 Checkpoint는 유지 · Restore 가능 (Infra-09) |
| FR-17 | Stop과 구분 | Stop=루프 종료+큐 정책(폐기/유지) · Resynthesize=종료가 아니라 **재개** |

### 2.4 종합 메시지 포맷 (권장)
```text
[Updated instructions — previous agent run interrupted]

1. (queued) Add null checks to UserService
2. (queued) Also update the tests
3. (latest) And add request logging in middleware

Continue from current workspace state. Prefer minimal additional edits.
Honor Review/Checkpoint already created; do not blindly revert user-accepted Keep.
```

중급 하네스: 한 턴 한 일에 가깝게, 종합 블록은 **짧고 번호만** (장문 재서술 금지).

### 2.5 큐 UI
| FR-ID | 요구사항 |
|-------|----------|
| FR-20 | `Queued: N` 뱃지 · 드롭다운 목록 |
| FR-21 | ↑↓ · 편집 · 삭제 · Clear All |
| FR-22 | “Apply now” = 빈 입력이어도 Interrupt & Resynthesize (큐만으로 종합) |
| FR-23 | 실행 중 입력창 placeholder: `Enter = stop & continue with this · Alt+Enter = queue only` |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | Abort→재호출 | < 500ms (네트워크 제외) |
| NFR-02 | 큐 메모리 | 메시지당 < 10KB · 총 < 500KB |
| NFR-03 | 재진입 단일화 | 동시 Enter 연타는 debounce 300ms · 한 번에 하나의 Resynthesize |
| NFR-04 | 부분 적용 안전 | 디스크에 이미 apply된 edit는 Review Pending으로 남김 · 자동 Undo 금지 |

---

## 4. API & Technical Spec

### 4.1 핵심 타입

```typescript
// 의도: Cursor형 중단·종합·재시작
export type QueueSubmitMode = 'resynthesize' | 'queue_only';

export interface QueuedMessage {
  id: string;
  type: 'user_instruction';
  content: string;
  timestamp: number;
}

export interface ResynthesizePayload {
  items: QueuedMessage[];  // drain된 큐
  latest: string;          // 방금 입력 (빈 문자열이면 큐만)
  reason: 'user_enter' | 'apply_now' | 'cmd_enter';
}
```

### 4.2 MessageQueue + AgentLoop

```typescript
export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private readonly maxSize = 50;

  enqueue(content: string): QueuedMessage { /* FIFO push + trim + notify */ }

  /** 큐 스냅샷을 비우고 반환 — Resynthesize 직전 */
  drain(): QueuedMessage[] {
    const items = [...this.queue];
    this.queue = [];
    this.notify();
    return items;
  }

  // ... remove / reorder / subscribe
}

export class AgentLoop {
  private abort: AbortController | null = null;
  private running = false;

  /** Cursor 기본: 실행 중 Enter */
  async interruptAndResynthesize(latest: string, reason: ResynthesizePayload['reason']) {
    const items = this.queue.drain();
    if (!latest.trim() && items.length === 0) return;

    // 1) 중단
    this.abort?.abort();
    await this.cancelInFlightTools(); // readonly best-effort, write 안전 종료

    // 2) 종합
    const userBlock = synthesizeInstructions(items, latest);

    // 3) 재시작 (sticky context 유지, maxTurns 카운터는 정책에 따라 리셋 또는 유지)
    this.abort = new AbortController();
    await this.runFromUserMessage(userBlock, this.abort.signal);
  }
}

function synthesizeInstructions(items: QueuedMessage[], latest: string): string {
  const lines: string[] = [
    '[Updated instructions — previous agent run interrupted]',
    '',
  ];
  let n = 1;
  for (const it of items) {
    lines.push(`${n++}. (queued) ${it.content.trim()}`);
  }
  if (latest.trim()) {
    lines.push(`${n++}. (latest) ${latest.trim()}`);
  }
  lines.push(
    '',
    'Continue from current workspace state. Prefer minimal additional edits.',
  );
  return lines.join('\n');
}
```

### 4.3 입력 핸들러

```typescript
// Agent 실행 중
// Enter / Send → interruptAndResynthesize(text) //
// Alt+Enter        → queue.enqueue(text)              // Queue-only
// Shift+Enter      → newline
// Idle + Enter     → normal startTurn(text)
```

---

## 5. UI/UX Specification

### 5.1 실행 중
```
Agent: Searching… / Editing… (turn 5)
┌─ Input ─────────────────────────────────────────────────────────┐
│ Also add request logging…                         [Send] [Queue]│
│ Enter = stop & continue with this · Alt+Enter / Queue = stack   │
│ 📨 Queued: 2  ▼                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Resynthesize 피드백
```
→ “Interrupted — combining 2 queued + 1 new…”
→ 타임라인에 Interrupted 노드
→ 새 Thought / Searching… 재개
```

### 5.3 Queue-only
```
Alt+Enter → Queued: 3 · Agent는 계속 실행
[Apply now] → 입력 비어 있어도 drain + Interrupt & Resynthesize
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Message Queue

  Scenario: Enter while running interrupts and resynthesizes
    Given agent is running turn 4
    And queue has "Add null checks"
    When user types "Also add logging" and presses Enter
    Then current stream and tools abort per policy
    And a single new user message contains both instructions
    And Tool Loop restarts with sticky context
    And queue is empty

  Scenario: Queue-only does not abort
    Given agent is running
    When user presses Alt+Enter with "Update tests"
    Then message appears in queue
    And agent continues uninterrupted

  Scenario: Apply now with queue only
    Given agent is running and Queued: 2
    When user clicks Apply now with empty input
    Then interrupt and resynthesize using only queued items

  Scenario: Idle Enter unchanged
    Given agent is idle
    When user presses Enter
    Then a normal new turn starts (no interrupt banner)

  Scenario: Review/Checkpoint preserved
    Given Pending Review has 1 file and a Checkpoint exists
    When Interrupt & Resynthesize runs
    Then Pending Review and Checkpoint remain available
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-C3_Agent_MultiTurn.md` | 선행 | 재진입 지점 |
| `PRD-Infra-12_MaxTurns_Timeout_Stop.md` | 병행 | Abort 공유 · Stop≠Resynthesize |
| `PRD-Infra-09` / Spec-06 | 병행 | Checkpoint 유지 |
| `PRD-09` Review UI | 병행 | Pending 유지 |
| `PRD-C0_Chat_UI_Streaming.md` | 병행 | 단축키·placeholder |

---

## 8. Implementation Phases

| 단계 | 작업 |
|------|------|
| 1 | MessageQueue drain/enqueue/reorder |
| 2 | AgentLoop `interruptAndResynthesize` + synthesize 포맷 |
| 3 | Webview: Enter=Resynthesize, Alt+Enter=Queue-only, Apply now |
| 4 | Interrupted 타임라인 노드 + 토스트 |
| 5 | 도구/셸 취소 정합 (Spec-04 · Infra-12) |

---

## 9. Risks & Mitigations

| 리스크 | 완화 |
|--------|------|
| write 중 Abort로 파일 반쯤 적용 | 도구 단위 커밋 · Pending Review · Checkpoint |
| 종합 지시가 장황해져 중급 모델 탈선 | 번호 리스트만 · Harness “한 턴 한 일” 프롬프트 |
| Enter 연타로 재시작 폭주 | 300ms debounce · running lock |
| Stop과 혼동 | UI 카피: Stop=멈춤 / Enter=멈추고 이어서 |

---

## Out of Scope

- Cloud Agents 원격 큐
- 멀티유저 공유 큐
- 네이티브 Cursor 애니메이션 100% 복제

## 10. References

- `Extension_high_impact.md` — 루프 **#8 Message queue** (Cursor형 Interrupt & Resynthesize)
- Cursor UX: 실행 중 전송 ≈ 중단 후 갱신된 지시로 재개
