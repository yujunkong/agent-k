# PRD-Harness-15: Acceptance Criteria (A티어 수용 테스트)

> **Category**: Medium Model Harness  
> **Phase**: C4 완료 시점 (MVP 완료 기준)  
> **관련 PRD**: `PRD-Harness-01_Model_Tiers.md` ~ `PRD-Harness-14_Dont_Do_Medium.md`

---

## 1. Overview

### 목적
**A티어(Flash급 중급 모델) 환경이 "실무 투입 가능"한지 검증하는 4가지 핵심 수용 테스트**를 정의한다. 이 4개가 통과하면 **하네스 MVP 완료**로 간주한다.

### 통과 기준
**4개 테스트 모두 통과** → A티어 하네스 MVP 완료  
**1개라도 실패** → 해당 영역 재작업 후 재테스트

---

## 2. Acceptance Test 1: Single File Bug Fix (단일 파일 버그 픽스)

### 목적
**"한 파일 버그 고쳐줘"** 요청을 프리페치 → 수정 → 린트 자동 검증 → 사용자 Diff 승인 1회로 완료하는지 검증.

### 시나리오
1. **준비**: `src/auth.ts`에 의도적 버그 주입 (null 체크 누락 → `user.name` 접근 시 NPE)
2. **실행**: 사용자 입력: `"src/auth.ts 로그인 함수 null 체크 추가해줘"`
3. **기대 흐름**:
   - 프리페치: `@file:src/auth.ts` → 모델 호출 전 파일 내용 읽기 완료
   - 모델: `edit_file` 호출 (Search-Replace, 유일 매칭)
   - Diff 프리뷰 → 사용자 승인
   - 적용 후 **자동 `read_lints` 실행** → 에러 0개
   - 턴 종료, 사용자 추가 액션 불필요

### 통과 기준 (Checklist)
| # | 기준 | 통과 조건 |
|---|------|-----------|
| 1.1 | 프리페치 완료 | 모델 첫 호출 전 `read_file` 결과가 컨텍스트에 주입됨 |
| 1.2 | Search-Replace 정확성 | `edit_file` 패치가 유일 매칭(0회/2회+ 매칭 시 거부) |
| 1.3 | 자동 린트 검증 | `read_lints` 자동 실행 → 에러 0개 확인 |
| 1.4 | 사용자 승인 1회만 | Diff 승인 1회로 전체 플로우 완료 (재시도 없음) |
| 1.5 | 소요 시간 | 전체 플로우 ≤ 30초 (로컬 Flash 기준) |

---

## 3. Acceptance Test 2: "Fix Failing Test" Loop (테스트 실패 고치기 루프)

### 목적
**"테스트 실패 고쳐줘"** → 실패 로그 분석 → 수정 → **동일 테스트 재실행 → 통과**까지 자율 루프 완료 검증.

### 시나리오
1. **준비**: `tests/auth.test.ts`에 실패하는 테스트 1개 (`expect(login('a','b')).toBeTruthy()` → `false` 반환)
2. **실행**: 사용자 입력: `"tests/auth.test.ts 실패하는 테스트 고쳐줘"`
3. **기대 흐름**:
   - 프리페치: 테스트 파일 + 실패 로그(`npm test -- auth.test.ts`) 읽기
   - 모델: 실패 원인 분석 → `edit_file`로 수정 (`src/auth.ts` 로직 보정)
   - 적용 후 **자동 `run_terminal_cmd("npm test -- auth.test.ts")`** 실행
   - 테스트 통과 → 턴 종료
   - (실패 시) **최대 2회 재시도** → 2회 내 통과

### 통과 기준 (Checklist)
| # | 기준 | 통과 조건 |
|---|------|-----------|
| 2.1 | 실패 로그 프리페치 | 테스트 실행 명령어 + 실패 로그가 모델 호출 전 컨텍스트에 포함 |
| 3.2 | 수정 → 재실행 루프 | 수정 → `read_lints` + `run_terminal_cmd(test)` 자동 실행 → 통과 시 종료 |
| 3.3 | 최대 2회 재시도 | 실패 시 동일 턴/다음 턴에서 최대 2회 재시도 후 통과 |
| 3.4 | 2회 초과 시 에스컬레이션 | 2회 실패 후 `ask_question`: "자동 수정 실패. 힌트 주시거나 수동으로 고치시겠습니까?" |
| 3.5 | 소요 시간 | 전체 루프 ≤ 60초 (로컬 Flash + 로컬 테스트 러너) |

---

## 4. Acceptance Test 3: Ask Mode Accuracy (Ask 모드 정확성)

### 목적
**Ask 모드(읽기 전용)**에서 **쓰기 0회**, **인용 코드가 실제 파일과 100% 일치**하는지 검증.

### 시나리오
1. **준비**: `src/auth.ts`, `src/token.ts`, `src/user.ts` 등 10개 파일 존재
2. **실행**: Ask 모드에서 사용자 질문 5가지 연속:
   - `"src/auth.ts 로그인 플로우 설명해줘"`
   - `"UserService 인터페이스 어디 정의돼?"`
   - `"token.ts의 refreshToken 함수 시그니처 뭐야?"`
   - `"로그인 관련 파일 다 찾아줘"`
   - `"이 코드에서 버그 가능성 있어?"`
3. **검증**:
   - **쓰기 도구 호출 0회** (`edit_file`, `write_file`, `delete_file`, `run_terminal_cmd` 미호출)
   - **인용 코드 정확성**: 모델이 인용한 코드 조각이 실제 파일 내용과 **문자 단위 100% 일치**
   - **파일 경로 정확성**: 인용한 파일 경로가 실제 존재

### 통과 기준 (Checklist)
| # | 기준 | 통과 조건 |
|---|------|-----------|
| 4.1 | 쓰기 도구 0회 | 5개 질문 전체에서 `edit_file`/`write_file`/`delete_file`/`run_terminal_cmd` 호출 0회 |
| 4.2 | 인용 코드 정확도 | 모델이 인용한 모든 코드 조각이 원본 파일과 **바이트 단위 100% 일치** |
| 4.3 | 경로 존재성 | 인용된 모든 파일 경로가 워크스페이스에 실제 존재 |
| 4.3 | 프리페치 정확성 | `@file:` 멘션된 파일 내용이 모델 응답에 정확히 반영 |
| 4.4 | 모드 전환 없음 | Ask → Agent 자동 전환 없음 (사용자 명시적 전환만) |

---

## 4. Acceptance Test 4: JSON Recovery (고의적 깨진 Tool JSON 10건 중 ≥8건 복구)

### 목적
**모델이 깨진 JSON을 내도** 하네스가 **펜스 추출·재파싱·1회 재요청**으로 **≥80% 복구**하는지 검증.

### 시나리오
1. **준비**: 10가지 의도적 JSON 파손 케이스 준비:
   1. Trailing comma: `{"name":"read_file","arguments":{"path":"x.ts",}}`
   2. Missing quote: `{"name":"read_file","arguments:{path:"x.ts"}}`
   3. Single quote: `{'name':'read_file','arguments':{'path':'x.ts'}}`
   4. Truncated: `{"name":"read_file","arguments":{"path":"x.ts"  (잘림)`
   5. Fence inside text: `Here is the call: \`\`\`json\n{"name":"read_file"...}\n\`\`\``
   6. Double encoding: `"{\"name\":\"read_file\",\"arguments\":{}}"` (문자열 이중 인코딩)
   7. Empty args: `{"name":"read_file","arguments":}`
   8. Wrong type: `{"name":"read_file","arguments":"not an object"}`
   9. Missing id: `{"name":"read_file","arguments":{}}` (id 누락)
   10. Extra text: `Sure! {"name":"read_file","arguments":{}} Let me read it.`

2. **실행**: 각 케이스를 모델 응답으로 시뮬레이션 → 파서 통과율 측정
3. **복구 프로세스**:
   1. 네이티브 `tool_calls` 파싱 시도
   2. 실패 시 펜스(`````json` ` ```) 추출 → 재파싱
   3. 실패 시 텍스트 내 JSON 객체 스캔 → 재파싱
   4. 실패 시 `"Fix JSON only"` 프롬프트로 1회 재요청 (temp=0)
   5. 최종 실패 시 `tool_result: {error: "Invalid tool call JSON"}` 반환

### 통과 기준 (Checklist)
| # | 기준 | 통과 조건 |
|---|------|-----------|
| 4.1 | 전체 복구율 | 10케이스 중 **≥ 8개 복구 성공** (≥ 80%) |
| 4.2 | 펜스 추출 | 펜스 내 JSON(케이스 5) 100% 복구 |
| 4.3 | 이중 인코딩 | 문자열 이중 인코딩(케이스 6) 100% 복구 |
| 4.4 | 트렁케이트 | 잘린 JSON(케이스 4) → 펜스/스캔으로 복구 또는 안전 에러 |
| 4.5 | 타입 에러 | 빈 객체/문자열/누락 필드(케이스 7,8,9) → 스키마 검증 에러로 `tool_result` 반환 |
| 4.6 | 재요청 성공 | 1회 재요청(케이스 10) 후 올바른 JSON 반환율 ≥ 50% |
| 4.7 | 안전 실패 | 복구 불가능 시 `tool_result.error=true` + 안전 메시지 (루프 중단 없음) |

---

## 4. 종합 수용 기준 (Summary)

| 테스트 | 통과 기준 | 우선순위 |
|--------|-----------|----------|
| **1. 단일 파일 버그 픽스** | 프리페치+수정+자동 린트+승인 1회 ≤ 30초 | **P0** (MVP 블로커) |
| **2. 테스트 실패 루프** | 실패 로그→수정→재실행→통과 ≤ 2회 재시도 | **P0** (MVP 블로커) |
| **3. Ask 모드 정확성** | 쓰기 0회, 인용 100% 정확, 경로 존재 | **P0** (MVP 블로커) |
| **4. JSON 복구율** | 10케이스 중 ≥ 8개 복구 (≥ 80%) | **P0** (MVP 블로커) |

> **모든 P0 통과 = A티어 하네스 MVP 완료**  
> 실패 시 → 실패한 테스트 영역 로그 분석 → 해당 모듈 재작업 → 재테스트

---

## 5. Test Execution Guide (실행 가이드)

### 4.1 자동화 테스트 스위트 (`tests/harness/acceptance.test.ts`)

```typescript
describe('A-Tier Harness Acceptance Tests', () => {
  test('AT-1: Single file bug fix', async () => {
    // 1. Inject bug into src/auth.ts
    // 2. Send user message with @file mention
    // 3. Verify: prefetch ran, edit_file called, auto-lint passed, diff approved
    // 4. Assert: total time < 30s, zero retries
  });

  test('AT-2: Test failure fix loop', async () => {
    // 1. Create failing test
    // 2. Send "fix failing test" message
    // 3. Verify: prefetch logs, edit_file → auto-test → pass within 2 retries
  });

  test('AT-3: Ask mode accuracy', async () => {
    // 1. Set mode = 'ask'
    // 4. Send 5 questions
    // 4. Assert: zero write tools, 100% quote accuracy
  });

  test('AT-4: JSON recovery rate', async () => {
    // 1. Feed 10 malformed JSON cases to parser
    // 2. Count recoveries >= 8
  });
});
```

### 4.2 수동 검증 체크리스트 (CI 통과 후 수동 확인)

| 항목 | 확인 방법 | 통과 |
|------|-----------|------|
| Diff UI 정상 표시 | `edit_file` 호출 시 Side-by-side Diff 모달 열림 | ☐ |
| 키보드 단축키 | `Ctrl+Enter`=적용, `Esc`=취소, `Ctrl+Shift+Enter`=전체 적용 | ☐ |
| 상태바 실시간 업데이트 | Tier/Tools/Prefetch/Latency 실시간 갱신 | ☐ |
| Doom Loop 모달 | 동일 도구 3회 → 모달 → 힌트/계속/중단 작동 | ☐ |
| 체크포인트 타임라인 | 첫 쓰기/5파일/수동 → 타임라인에 노드 생성 → Restore 작동 | ☐ |
| 메모리 패널 | 추가/편집/이동/삭제/Import/Export 작동 | ☐ |

---


## Out of Scope

- 프론티어 모델 전용 ‘자율 만능’ 설계를 Tier A에 그대로 적용
- 상세: `00_Master_Context.md` + Harness-14

## 5. References

- `PRD-Harness-01_Model_Tiers.md` — A티어 정의
- `PRD-Harness-09_Prefetch_Pattern.md` — 프리페치 검증
- `PRD-Harness-10_Verification_MicroLoop.md` — 검증 루프/자동 린트
- `PRD-Harness-07_Prompt_Turn_Structure.md` — JSON 파싱 복구
- `PRD-Infra-11_Doom_Loop_Detection.md` — 둠 루프 감지
- `PRD-C4_Infrastructure.md` — 체크포인트/컴팩션/둠루프 통합