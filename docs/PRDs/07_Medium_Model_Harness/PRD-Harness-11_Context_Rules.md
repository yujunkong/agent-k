# PRD-Harness-11: Context Rules (컨텍스트 규칙) — A티어 숫자 예시

> **Category**: Medium Model Harness  
> **Phase**: C3~C4 (멀티턴 루프 안정화 후)  
> **관련 PRD**: `PRD-Harness-07_Prompt_Turn_Structure.md`, `PRD-Infra-02_Context_Assembly.md`, `PRD-Infra-10_Context_Compaction.md`, `PRD-Harness-01_Model_Tiers.md`

---

## 1. Overview

### 목적
**A티어(Flash급) 모델이 안정적으로 돌아가게 하는 구체적 숫자·규칙**을 고정한다. "감으로"가 아닌 **측정 가능한 임계값**으로 하네스 동작을 결정한다.

### 비즈니스 가치
- **재현 가능**: 같은 설정이면 같은 동작 보장
- **튜닝 가능**: 숫자만 바꾸면 동작 강도 조절
- **디버깅 용이**: 로그에 `tier=A, tools=8, prefetch=3` 찍혀 원인 분석 쉬움

---

## 2. A티어 출력·컨텍스트 규칙 (숫자 예시)

| 항목 | 값 | 비고 |
|------|-----|------|
| **활성 도구 수** | ≤ 8~12 | 화이트리스트 10개 + `ask_question`, `todo_write`, `switch_mode` |
| **턴당 tool_calls** | ≤ 4 | 읽기 도구는 배치로 1개로 카운트, 쓰기 1개 = 1회 |
| **read 기본 줄 수** | ≤ 250 | `offset`/`limit` 필수, 전체 파일 읽기 금지 |
| **tool result 상한** | ≤ 8k tokens (≈ 32KB) | 초과 시 truncate + `(truncated, path=...)` |
| **maxTurns** | 15 | 강모델(B)는 25+ |
| **temperature** | 0~0.3 | 도구 턴에서는 0 권장 |
| **패치 방식** | Search–Replace only | unified diff / whole file 금지 |
| **실패 재시도** | JSON 1회 + 패치 2회 + lint-fix 2회 | 총 5회 내 복구 목표 |

---

## 3. Context Budget (128k 컨텍스트 기준)

| 슬롯 | 비율 | 토큰 | 내용 | 보호 |
|------|------|------|------|------|
| **System + Mode Prompt** | ~5% | 6,400 | Agent/Ask/Plan/Debug 모드 프롬프트 | ✅ 절대 보호 |
| **Rules** | ~5% | 6,400 | 매칭된 규칙만 (경로 매칭) | ✅ 보호 |
| **Tool Schemas** | ~8% | 10,240 | 현재 모드+티어 화이트리스트만 | ✅ 보호 |
| **Sticky Context** | ~12% | 15,360 | 열린 탭(상위 5), @멘션, 선택 영역, 현재 진단 | ✅ 보호 |
| **Conversation + Tool Results** | ~60% | 76,800 | 최근 턴 우선 (도구 결과 포함) | 🔄 압축 대상 |
| **Response Reserve** | ~10% | 13,312 | `max_output_tokens` 확보 | ✅ 보호 |

**총합**: 128,000 tokens (128k 컨텍스트)

---

## 4. 컴팩션 트리거·단계 (A티어)

| 트리거 | 조건 | 액션 |
|--------|------|------|
| **사전 예방** | 예상 토큰 > 90% 예산 (115k) | 다음 턴 전 자동 실행 |
| **강제** | 실제 토큰 > 95% 예산 (121k) | 즉시 실행 (턴 중간이라도) |
| **수동** | 사용자 `/compact` 명령 | 즉시 실행 |
| **주기적** | 매 20턴마다 | 백그라운드 실행 |

| 단계 | 동작 | 비용 | 보호 구간 |
|------|------|------|-----------|
| **1. Truncate** | 오래된 tool_result 본문 절단 (32KB 캡) | 무료 | System, Rules, 최근 6턴 |
| **2. Drop** | 중복 read/grep 결과 제거 (동일 경로/쿼리) | 무료 | 동일 |
| **3. Micro-summary** | 오래된 구간을 bullet 요약으로 치환 (소형 모델/휴리스틱) | 저 | 동일 |
| **4. Full compact** | 대화 전체를 요약 1블록으로 치환 (대형 모델) | 고 | System, Rules, 최근 6턴, 현재 목표 |

**보호 구간 (Never Compact)**:
- System + Mode Prompt
- Active Rules
- Sticky Context (열린 탭, @멘션, 선택 영역, 현재 진단)
- Recent 6 Turns
- Current User Goal
- Active Memories
- Pinned Artifacts

---

## 4. Prefetch Limits (A티어)

| 항목 | 값 | 비고 |
|------|-----|------|
| **최대 파일 읽기** | 20개 | `@mention` + 스택 + 심볼 + import + 키워드 합산 |
| **최대 grep 결과** | 50개 | 상위 50개만 모델 전달 |
| **프리페치 타임아웃** | 2초 | 초과 시 빈 컨텍스트로 진행 |
| **동시성** | 16 | `p-limit(16)` |
| **LSP 정의 동시** | 5개 | 심볼당 1개 |

---

## 5. Retry & Recovery Limits (A티어)

| 실패 유형 | 최대 재시도 | 백오프 | 비고 |
|-----------|-------------|--------|------|
| **JSON 파싱 실패** | 1회 | 500ms | 펜스 추출 → 재파싱 |
| **스키마 검증 실패** | 2회 | 500ms | 에러 메시지 모델 주입 |
| **도구 실행 에러** | 2회 | 1s → 2s | 지수 백오프 |
| **린트/테스트 실패** | 2회 | 즉시 | `auto-lint` 후 즉시 재시도 |
| **네트워크/타임아웃** | 3회 | 1s → 2s → 4s | 지수 백오프 |
| **둠 루프** | 감지 시 즉시 | - | 3회 연속 → 사용자 힌트 |

---

## 5. Prefetch Limits (A티어)

| 항목 | 값 | 비고 |
|------|-----|------|
| **최대 파일 읽기** | 20개 | `@mention` + 스택 + 심볼 + import + 키워드 합산 |
| **최대 grep 결과** | 50개 | 상위 50개만 모델 전달 |
| **프리페치 타임아웃** | 2초 | 초과 시 빈 컨텍스트로 진행 |
| **동시성** | 16 | `p-limit(16)` |
| **LSP 정의 동시** | 5개 | 심볼당 1개 |

---

## 6. Concurrency Limits (A티어)

| 도구 분류 | 동시성 | 큐 방식 |
|-----------|--------|---------|
| **readonly** (grep, read_file, lsp_*) | 16 | `p-limit(16)` |
| **network** (web_search, web_fetch) | 4 | `p-limit(4)` |
| **write** (edit_file, write_file) | 1 | 순차 (파일 락) |
| **exec** (run_terminal_cmd) | 1 | 순차 (CWD 유지) |
| **destructive** (delete_file) | 1 | 순차 + 추가 확인 |
| **orchestrate** (task, subagent) | 1 | 순차 |

---

## 7. Monitoring & Logging (A티어 필수 로그)

```json
{
  "timestamp": "2024-01-15T14:32:10.123Z",
  "turn": 5,
  "tier": "A",
  "model": "deepseek-v4-flash",
  "toolsUsed": ["grep", "read_file", "edit_file"],
  "toolCount": 3,
  "prefetchFiles": 3,
  "prefetchTimeMs": 45,
  "contextTokens": 89432,
  "compactionStage": 0,
  "verificationRetries": 1,
  "doomLoopDetected": false,
  "latencyMs": 2340,
  "tokensIn": 12450,
  "tokensOut": 387
}
```

---

## 7. Acceptance Criteria

```gherkin
Feature: A-Tier Context Rules (Numbers)

  Scenario: Tool count limit enforced
    Given Tier A model
    When model tries to call 5 tools in one turn (4 readonly + 1 write)
    Then turn stops at 4 tools
    And model receives "Max tool calls per turn (4) reached"

  Scenario: Read file respects 250-line cap
    Given user asks "read src/large.ts" (1000 lines)
    When read_file executes
    Then returns first 250 lines
    And metadata includes "totalLines: 1000, showing: 1-250"

  Scenario: Tool result truncated at 32KB
    Given a tool_result with 100KB content
    When assembling context
    Then tool_result truncated to 32KB + "(truncated, 68KB omitted)"
    And token count reflects truncated version

  Scenario: Compaction triggers at 90% budget
    Given context at 92% of 128k budget
    When next turn assembles context
    Then compaction runs automatically
    And total tokens reduced below 90%
    And protected zones (system, rules, recent 6 turns) intact

  Scenario: Max turns enforced
    Given maxTurns = 15 for Tier A
    When agent reaches turn 15 without finishing
    Then loop stops with "Max turns (15) reached. Type 'continue' to resume."

  Scenario: Doom loop detected at 3 repeats
    Given model calls read_file("config.json") 3 times same args
    When 3rd call recorded
    Then doom loop modal shown with "Give hint / Continue / Abort"

  Scenario: Temperature 0 for tool turns
    Given model calling tools
    When provider called
    Then temperature = 0 (or ≤ 0.3)
```

---


## Out of Scope

- 프론티어 모델 전용 ‘자율 만능’ 설계를 Tier A에 그대로 적용
- 상세: `00_Master_Context.md` + Harness-14

## 8. References

- `PRD-Harness-07_Prompt_Turn_Structure.md` — 컨텍스트 조립/예산 상세
- `PRD-Infra-02_Context_Assembly.md` — 예산/슬롯 상세
- `PRD-Infra-10_Context_Compaction.md` — 컴팩션 파이프라인 상세
- `PRD-Harness-01_Model_Tiers.md` — 티어별 정책 상세
- `PRD-Infra-08_Parallel_Serial_Policy.md` — 동시성 제한
- `PRD-Infra-11_Doom_Loop_Detection.md` — 둠 루프 상세
- `PRD-Harness-09_Prefetch_Pattern.md` — 프리페치 제한