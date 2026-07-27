# PRD-Harness-05: Design Slogans (설계 슬로건) — 핵심 원칙 5개

> **Category**: Medium Model Harness  
> **Phase**: Design-time (아키텍처 결정 시 참고)  
> **관련 PRD**: `PRD-Harness-01_Model_Tiers.md` ~ `PRD-Harness-06_A_Tier_Whitelist.md`

---

## 5대 설계 슬로건

| # | 슬로건 | 의미 | 적용 영역 |
|---|--------|------|-----------|
| **1** | **탐색은 코드, 판단은 모델** | grep/glob/read_file/코드베이스 검색은 확장이 직접 병렬 실행, 모델은 요약·판단만 | Tool Registry, Prefetch, Parallel Policy |
| **2** | **한 턴 한 일** | 한 턴 = 한 도구 호출(또는 읽기 배치) → 결과 확인 → 다음 결정. "한 번에 다 하기" 금지 | Agent Loop, Max Tool Calls/Turn |
| **3** | **실패를 값으로** | 도구 에러·파싱 실패·린트 에러를 예외가 아닌 `tool_result`로 주입 → 모델이 스스로 수정 | Error Recovery, Verification Micro-loop |
| **4** | **스키마를 좁게** | 모델이 보는 도구 스키마 = 현재 모드/티어에서 **허용된 것만**. 불필요한 도구·인자 숨김 | Tool Registry, Tier Whitelist, Mode Whitelist |
| **5** | **검증 우선, 제한 나중** | "못 하게 막기"보다 "하고 나서 확인해서 고치게". 수정 후 자동 린트/테스트 → 실패 시 재시도 | Verification Micro-loop, PostToolUse Hooks |

---

## 슬로건별 상세 해설

### 1. 탐색은 코드, 판단은 모델
> **"도구는 확장이 하고, 모델은 생각한다."**

| 탐색(코드) | 판단(모델) |
|------------|------------|
| `grep`/`glob`/`read_file`/`codebase_search` 병렬 실행 | "이 함수가 어디 쓰이지?" → 탐색 결과 보고 판단 |
| `lsp_definition`/`references` 동시 호출 | "이 인터페이스 누가 구현하나?" → 결과 보고 설계 결정 |
| `codebase_search` 의미 검색 | "결제 흐름 관련 파일 다 찾아줘" → 결과 요약 후 다음 단계 결정 |
| **병렬 실행** (`p-limit(16)`) | **순차 판단** (한 턴 한 번 모델 호출) |

**구현 포인트**: `ParallelSerialPolicy`에서 `readonly: true` 도구는 `Promise.all`로 병렬 실행, `readonly: false`는 직렬 + 승인.

---

### 2. 한 턴 한 일
> **"한 번에 하나씩, 확인하고 간다."**

| 안 좋은 예 (한 턴에 다 하기) | 좋은 예 (한 턴 한 일) |
|------------------------------|----------------------|
| `read_file` 5개 + `edit_file` 3개 + `run_terminal` 1개 한 턴에 | 1턴: `read_file` 5개 병렬 → 결과 보고<br>2턴: `edit_file` 1개 → 린트 검증<br>3턴: `edit_file` 1개 → 테스트<br>... |

| 규칙 | 구현 |
|------|------|
| **턴당 도구 호출 상한** | Tier A: 4개, Tier B: 8개 (`maxToolCallsPerTurn`) |
| **쓰기 도구는 1턴 1개** | `edit_file`/`write_file`/`delete_file`/`run_terminal_cmd`는 턴당 1개만 |
| **읽기 도구는 배치** | `grep`/`glob`/`read_file`/`lsp_*`는 한 턴에 여러 개 병렬 허용 |
| **계획 강제** | `todo_write` 필수 (Tier A) / Plan 모드 강제 (복잡도 ≥ 3 파일) |

---

### 3. 실패를 값으로
> **"에러는 예외가 아니라 데이터다."**

| 실패 유형 | 기존(예외) | 하네스(값) |
|-----------|------------|------------|
| 도구 실행 에러 (파일 없음, 권한, 타임아웃) | `throw` → 루프 중단 | `tool_result: { error: true, output: "File not found: ..." }` → 모델이 다음 턴에서 재시도 |
| JSON 파싱 실패 | `throw` → 루프 중단 | 펜스 추출 → 재파싱 → 1회 재시도 → `tool_result: { error: "Invalid JSON, retrying..." }` |
| 스키마 검증 실패 (Zod) | `throw` | `tool_result: { error: "Invalid args: missing required field 'replace'" }` |
| 린트/테스트 실패 | 예외 → 중단 | `read_lints` 결과 → `tool_result`에 에러 리스트 주입 → 모델이 재시도 |
| 네트워크 타임아웃 | 예외 | 지수 백오프(1s, 2s, 4s) 후 재시도, 3회 실패 시 모델에 에러 전달 |

**구현**: `executeWithErrorRecovery` 래퍼 + `PostToolUse` 훅에서 `auto-lint`/`auto-test` 자동 실행 → 실패 시 `tool_result.error = true`로 모델에 반환.

---

### 4. 스키마를 좁게
> **"보지 말아야 할 건 안 보여준다."**

| 좁히는 대상 | 방법 | 효과 |
|-------------|------|------|
| **도구 개수** | Tier A: 10개, Tier B: 40개 | 토큰 70% 절약, 선택 혼란 방지 |
| **도구 인자** | `edit_file`: `search`/`replace`만, `run_terminal_cmd`: `cmd`만 | 불필요한 인자(`description`, `preview` 등) 제거 |
| **모드별** | Ask: 읽기만, Plan: 읽기+질문, Agent: 전체, Debug: 계측 도구 추가 | 모드 전환 시 스키마 교체 |
| **MCP 도구** | 지연 로드(`tool_search` 스텁) → 최초 호출 시 로드 | 스키마 토큰 90% 절약 |

**구현**: `ToolRegistry.getSchemas(mode, tier)` → 화이트리스트 기반 필터링 → JSON Schema 생성 시 `additionalProperties: false` 강제.

---

### 5. 검증 우선, 제한 나중
> **"막지 말고, 확인하게 하라."**

| 제한(나중) | 검증(우선) |
|------------|------------|
| `delete_file` 금지 | `edit_file` 후 `read_lints` 자동 → 에러면 재시도 |
| `run_terminal_cmd` Allowlist | 실행 후 `read_lints` + 허용 테스트 1개 자동 실행 |
| `delete_file` 금지 | `edit_file`로 내용 비우기 유도 → 린트 통과 시 허용 |
| `task`/`subagent` 금지 | `todo_write`로 분해 → 같은 세션에서 순차 실행 |
| `browser_*` 금지 | `web_search`/`web_fetch`로 대체 → 결과 요약 후 모델 판단 |

**구현**: `PostToolUse` 훅에서 `autoLint`/`autoTest` 자동 실행 → 실패 시 `tool_result`에 에러 주입 → 모델이 동일 턴/다음 턴에서 재시도.

---

## 6. 슬로건 간 관계도

```
┌─────────────────────────────────────────────────────────────┐
│  1. 탐색은 코드, 판단은 모델                                  │
│     → 병렬 읽기 도구 → 모델 판단 → 2. 한 턴 한 일             │
│                                                               │
│  2. 한 턴 한 일                                               │
│     → 도구 상한(4/8) → 실패 시 3. 실패를 값으로               │
│                                                               │
│  3. 실패를 값으로                                             │
│     → 에러를 tool_result로 → 모델이 재시도 → 4. 스키마 좁게   │
│                                                               │
│  4. 스키마를 좁게                                             │
│     → 필요 도구만 노출 → 토큰 절약 → 5. 검증 우선             │
│                                                               │
│  5. 검증 우선, 제한 나중                                      │
│     → PostToolUse 훅에서 자동 린트/테스트 → 실패 시 재시도    │
│     → 실패해도 루프 유지 → 1. 탐색은 코드... (순환)           │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. 구현 체크리스트 (슬로건별)

| 슬로건 | 구현 체크포인트 | 완료 |
|--------|-----------------|------|
| 1. 탐색은 코드 | `p-limit(16)` 병렬 읽기, `tool_registry` 읽기 도구 `readonly: true` | [ ] |
| 2. 한 턴 한 일 | `maxToolCallsPerTurn` (A:4, B:8), 쓰기 도구 턴당 1개 제한 | [ ] |
| 3. 실패를 값으로 | `executeWithErrorRecovery`, `PostToolUse` 훅 `auto-lint`, `auto-test` | [ ] |
| 4. 스키마 좁게 | `ToolRegistry.getSchemas(mode, tier)`, `additionalProperties: false` | [ ] |
| 5. 검증 우선 | `PostToolUse` 훅 `auto-lint`, `auto-test`, `verification-retry` | [ ] |

---


## Out of Scope

- 프론티어 모델 전용 ‘자율 만능’ 설계를 Tier A에 그대로 적용
- 상세: `00_Master_Context.md` + Harness-14

## 6. References

- `PRD-Harness-01_Model_Tiers.md` — 티어별 정책
- `PRD-Harness-06_A_Tier_Whitelist.md` — A티어 도구 화이트리스트
- `PRD-Infra-04_Tool_Registry.md` — 레지스트리 구현
- `PRD-Infra-06_Hooks.md` — Pre/Post 훅 구조
- `PRD-Harness-10_Verification_MicroLoop.md` — 검증 마이크로 루프 상세