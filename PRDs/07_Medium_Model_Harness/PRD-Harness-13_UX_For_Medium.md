# PRD-Harness-13: UX For Medium Models (중급 모델이 '잘 도는 것처럼' 보이게)

> **Category**: Medium Model Harness  
> **Phase**: C4~C5 (인프라 + 티어 시스템 안정화 후)  
> **관련 PRD**: `PRD-Harness-01_Model_Tiers.md`, `PRD-Harness-02_Verification_First.md`, `PRD-C4_Infrastructure.md`

---

## 1. Overview

### 목적
중급 모델(Flash, 소형 instruct)이 **실제로는 하네스 덕분에 잘 돌아가는데**, 사용자도 **"어? 이 모델 꽤 잘하네?"**라고 느끼게 하는 **UX 레이어**를 제공한다.

### 비즈니스 가치
- **신뢰도 ↑**: "모델이 멍청하다" 인식 → "하네스가 잘 받쳐주네" 인식 전환
- **입문 장벽 낮춤**: Flash만 써도 실무 가능하다는 확신 부여
- **디버깅 용이**: 내부 상태(티어, 도구 수, 프리페치)가 보이면 직접 튜닝 가능

---

## 2. UX Components (UX 컴포넌트)

### 2.1 Todo 자동 분해·표시 (Auto Todo Breakdown)
| 기능 | 설명 |
|------|------|
| **자동 분해** | 사용자 목표("리팩터링 해줘") → 하네스가 `todo_write`로 5~8개 할 일 자동 생성 |
| **실시간 체크** | 에이전트 턴마다 해당 TODO 체크 → 진행률 바(████░░ 60%) 표시 |
| **분기 지원** | 특정 TODO 우클릭 → "Branch to new Agent" → 별도 세션에서 해당 TODO만 수행 |

### 2.2 Diff 승인 기본 On (Diff Approval Default On)
| 설정 | 기본값 | 설명 |
|------|--------|------|
| **Diff 승인** | `ask` (매번) | Tier A: 모든 쓰기/터미널 |
| **Tier B** | `accept_edits` (자동, delete는 ask) | 숙련 사용자용 |

### 2.3 "모델이 막힘" 시 프리페치 재실행 / 도구 축소 / Pro로 재실행 버튼
| 상황 | UI 액션 | 백엔드 액션 |
|------|---------|-------------|
| **도무 루프 감지** | 모달: "힌트 주기 / 계속 / 중단" | `DoomLoopDetector` → 사용자 힌트 주입 |
| **린트 2회 실패** | 배너: "자동 수정 실패. Pro로 재시도?" | Tier B로 승격 + 동일 태스크 재시도 |
| **프리페치 타임아웃** | 토스트: "프리페치 지연. 수동 탐색?" | 프리페치 비활성화 옵션 제공 |
| **도구 호출 3회 실패** | 버튼: "도구 축소(읽기만) / Pro로 재시도" | 화이트리스트 축소 / Tier B 승격 |

### 2.4 상태바에 티어·도구·프리페치 실시간 표시
```
Tier: A (Flash)  💰 $0.00  ⚡ 0.8s  Tools: 3/4  Prefetch: 3 files (45ms)  🟢
```
| 요소 | 색상 | 의미 |
|------|------|------|
| **Tier A** | 🟢 초록 | Flash (저가/고속) |
| **Tier B** | 🔵 파랑 | Pro (고성능) |
| **Tier C** | 🟡 노랑 | 채팅만 |
| **Tools: 3/4** | - | 현재 턴 사용/최대 |
| **Prefetch: 3 files (45ms)** | - | 프리페치 성능 |

### 2.5 로그에 `tier=A`, `tools=8`, `prefetch=3` 표시 (디버깅용)
```
[2024-01-15 14:32:10] turn=5 tier=A model=deepseek-v4-flash tools=3 prefetch=3 contextTokens=89432 verificationRetries=1 doomLoop=false latencyMs=2340
```

---

## 2. "모델이 막힘" 시 복구 버튼 플로우

```
┌─ Agent Stuck? ────────────────────────────────────────────┐
│  ⚠️ The agent seems stuck (3x read_file same file)       │
│                                                           │
│  💡 Give Hint    ▶ Continue Anyway    ⛔ Abort Agent      │
│                                                           │
│  🔧 Advanced:                                              │
│  [Reduce Tools (Read-only)]  [Upgrade to Pro]  [Restart]  │
└───────────────────────────────────────────────────────────┘
```

| 버튼 | 백엔드 액션 |
|------|-------------|
| **Give Hint** | `ask_question` 주입 → 모델이 힌트 보고 재시도 |
| **Continue Anyway** | Doom counter 리셋 → 계속 진행 |
| **Abort Agent** | `AbortController` → 체크포인트 제안 |
| **Reduce Tools** | 화이트리스트 → 읽기 전용 4개만 (`grep`, `read_file`, `glob`, `lsp_*`) |
| **Upgrade to Pro** | Tier B로 승격 → 동일 태스크 재시작 |
| **Restart** | 체크포인트에서 복원 → 새 세션 |

---

## 3. Acceptance Criteria

```gherkin
Feature: UX for Medium Models

  Scenario: Auto todo breakdown shown in real-time
    Given user asks "Refactor auth to Strategy pattern"
    When agent starts
    Then todo list appears with 6 items
    And progress bar updates each turn (1/6 → 2/6 → ...)
    And user can right-click TODO #3 → "Branch to new Agent"

  Scenario: Diff approval default on for Tier A
    Given Tier A model
    When model calls edit_file
    Then diff preview modal appears
    And buttons: [Allow Once] [Allow Session] [Deny]
    And no auto-apply without click

  Scenario: Doom loop modal appears at 3rd repeat
    Given agent calls read_file("config.json") 3 times same args
    When 3rd call detected
    Then modal appears: "Doom loop detected: read_file(config.json) 3x"
    And options: [Give Hint] [Continue] [Abort]
    And "Reduce Tools" button reduces whitelist to read-only 4 tools

  Scenario: Auto-lint failure shows "Retry with Pro" button
    Given Tier A, auto-lint enabled
    And edit fails lint 2 times
    When 2nd failure
    Then banner: "Auto-fix failed 2x. Upgrade to Pro for better fix?"
    And [Upgrade to Pro] button upgrades tier and restarts task

  Scenario: Status bar shows real-time metrics
    Given agent running
    Then status bar shows: "Tier: A | Tools: 3/4 | Prefetch: 3 files (45ms) | 🟢"
    And logs contain: "turn=5 tier=A tools=3 prefetch=3 contextTokens=89432"

  Scenario: Reduce Tools button works
    Given doom loop modal open
    When user clicks "Reduce Tools"
    Then tool whitelist reduced to: grep, glob, read_file, lsp_*
    And edit_file, run_terminal_cmd hidden
    And agent continues with read-only tools

  Scenario: Upgrade to Pro button works
    Given doom loop or lint failure banner
    When user clicks "Upgrade to Pro"
    Then tier switches to B (Pro)
    And task restarts with full toolset
    And chat header shows "Tier B (Upgraded)"
```

---


## Out of Scope

- 프론티어 모델 전용 ‘자율 만능’ 설계를 Tier A에 그대로 적용
- 상세: `00_Master_Context.md` + Harness-14

## 3. References

- `PRD-Harness-01_Model_Tiers.md` — 티어별 정책
- `PRD-Harness-02_Verification_First.md` — 검증 우선 UX
- `PRD-Harness-06_A_Tier_Whitelist.md` — 도구 축소/확장
- `PRD-Infra-11_Doom_Loop_Detection.md` — 둠 루프 모달
- `PRD-C4_Infrastructure.md` — 체크포인트/훅/컴팩션 UX
- `PRD-C4_Infrastructure.md` — 상태바/로그 포맷