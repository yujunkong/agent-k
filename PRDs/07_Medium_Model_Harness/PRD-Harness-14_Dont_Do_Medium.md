# PRD-Harness-14: Don't Do (중급에서 독) — 하지 말아야 할 것들

> **Category**: Medium Model Harness  
> **Phase**: Design-time (아키텍처 결정 시 참고)  
> **관련 PRD**: `PRD-Harness-01_Model_Tiers.md`, `PRD-Harness-05_Design_Slogans.md`, `PRD-Harness-06_A_Tier_Whitelist.md`

---

## 1. Overview

### 목적
**중급 모델(Flash, 7B~30B instruct) 환경에서 "이거 하면 망한다"는 안티패턴을 명문화**해, 구현·설정·프롬프트 작성 시 **절대 하지 말아야 할 것**을 체크리스트로 제공한다.

### 핵심 철학
> **"중급 모델에게 자율성을 주면 망한다. 하네스가 대신 해줘야 한다."**

---

## 2. 절대 금지 목록 (Don't Do List)

### 2.1 도구·스키마 관련
| ❌ 하지 말 것 | 이유 | 올바른 대안 |
|-------------|------|-------------|
| **도구 카탈로그 풀세트(40개) + MCP 20개를 한 번에 주입** | 토큰 40k 초과, 선택 혼란, 환각 ↑ | Tier A: 10개 화이트리스트, MCP는 `tool_search` 스텁으로 지연 로드 |
| **Unified Diff + 라인번호 의존** | 로컬 모델이 라인번호 자주 틀림 | **Search–Replace(정확 매칭)만 허용**, 유일 매칭 검증 |
| **읽지 않은 파일에 대한 자신만만한 패치 허용** | Staleness/환각으로 코드 망가뜨림 | `StalenessCheckHook`으로 `read_file` 선행 강제, `mtime/hash` 체크 |
| **긴 Agent 이력 전부를 매 턴 투입 (압축 없이)** | 컨텍스트 오버플로, 중요 정보 밀림 | 4단계 컴팩션(Truncate→Drop→Micro→Full), 보호구간 절대 보존 |

### 2.2 프롬프트·지시 관련
| ❌ 하지 말 것 | 이유 | 올바른 대안 |
|-------------|------|-------------|
| **"알아서 레포 전체 리팩터해줘" 한 방 프롬프트** | 중급 모델이 감당 못 함 → 환각·무한루프 | **Plan 모드 강제** → 질문 UI → 계획 승인 → TODO 분기 → Agent 순차 실행 |
| **도구 카탈로그 풀세트 + MCP 20개를 한 번에** | 토큰 폭증, 도구 선택 혼란 | Tier A: 10개 화이트리스트, MCP는 `tool_search` 스텁으로 지연 로드 |
| **Unified Diff + 라인번호 의존** | 로컬 모델 라인번호 자주 틀림 | **Search–Replace만 허용**, 유일 매칭 검증 |
| **읽지 않은 파일에 대한 자신만만한 패치 허용** | Staleness/환각으로 코드 망가뜨림 | `StalenessCheck` 훅으로 `read_file` 선행 강제, `mtime/hash` 체크 |
| **긴 Agent 이력 전부를 매 턴 투입 (압축 없이)** | 컨텍스트 오버플로, 중요 정보 밀림 | 4단계 컴팩션(Truncate→Drop→Micro→Full), 보호구간 절대 보존 |

### 2.3 실행·루프 관련
| ❌ 하지 말 것 | 이유 | 올바른 대안 |
|-------------|------|-------------|
| **무한 루프 방치 (maxTurns 없음)** | 토큰/시간/비용 무한 소모 | `maxTurns=15`(A) / `25`(B) 하드 캡 + `turnTimeout=5분` |
| **도구 에러 = 루프 중단** | 에러 한 번에 세션 죽음 | `ErrorRecoveryExecutor`: 에러를 `tool_result`로 반환 → 모델이 재시도 |
| **JSON 파싱 실패 = 예외 던지기** | 파싱 실패 시 세션 죽음 | `Spec-01` 파서: 펜스 추출 → 재파싱 → 1회 재요청 → `tool_result`로 에러 전달 |
| **동일 도구·동일 인자 무한 반복** | 둠 루프 → 리소스 낭비 | `DoomLoopDetector`: 3회 연속 → 사용자 힌트/중단/계속 선택 |
| **긴 Agent 이력 전부를 매 턴 투입 (압축 없이)** | 컨텍스트 오버플로, 중요 정보 밀림 | 4단계 컴팩션(Truncate→Drop→Micro→Full), 보호구간 절대 보존 |

### 2.4 검증·품질 관련
| ❌ 하지 말 것 | 이유 | 올바른 대안 |
|-------------|------|-------------|
| **자동 린트/테스트 끄고 "알아서 잘하겠지"** | 중급 모델은 검증 없이 통과 못 함 | `PostToolUse` 훅: `auto-lint`(A티어 강제) + `auto-test`(B티어) → 실패 시 `tool_result`로 에러 주입 → 재시도 |
| **"알아서 테스트 돌려" 한 방 지시** | 테스트 명령·해석 실패 | `run_terminal_cmd` Allowlist(`pytest`, `npm test` 등) + 자동 실행 훅 |
| **"실패하면 사용자가 고치겠지" 방치** | 사용자 개입 전까지 루프 멈춤 | `maxRetries=2` 초과 시 `ask_question`로 사용자 힌트 요청 → 중단 |

### 2.5 메모리·컨텍스트 관련
| ❌ 하지 말 것 | 이유 | 올바른 대안 |
|-------------|------|-------------|
| **자동 장기 기억(Implicit Long-term Memory) 활성화** | 환각·거짓 기억 주입 위험 | **명시 저장 + 사용자 편집만 허용** (`save_memory` 도구 + UI 편집) |
| **긴 대화 이력 전부를 매 턴 투입 (압축 없이)** | 컨텍스트 오버플로, 중요 정보 밀림 | 4단계 컴팩션(Truncate→Drop→Micro→Full), 보호구간 절대 보존 |
| **메모리 무제한 누적** | 토큰 예산 초과, 노이즈 축적 | 하드 캡: User 50 / Workspace 100 / Team 200, LRU 제거 |

### 2.6 보안·권한 관련
| ❌ 하지 말 것 | 이유 | 올바른 대안 |
|-------------|------|-------------|
| **시크릿/키가 포함된 코드 생성 허용** | 유출 위험 | `SecretScanHook`(PreToolUse): API 키 패턴 감지 → 차단 + 마스킹 |
| **임의 셸 명령 허용 (`rm -rf /`, `curl \| sh` 등)** | 시스템 파괴 | `run_terminal_cmd` Allowlist + Deny patterns(`rm -rf /`, `curl.*\|.*sh`) |
| **전체 파일 시스템 읽기/쓰기 권한** | 중요 파일 변조 위험 | `denyGlobs`: `**/.env*`, `**/secrets/**`, `**/id_rsa*` 등 |

---

## 3. 구현 체크리스트 (Don't Do → 구현 시 검증)

| 영역 | Don't Do | 검증 방법 | 완료 |
|------|----------|-----------|------|
| **도구 수** | A티어 10개 초과 노출 | `ToolRegistry.getSchemas('A').length <= 10` | ☐ |
| **Diff 포맷** | Unified Diff 허용 | `PatchApplier`가 Unified Diff 거부, Search-Replace만 허용 | ☐ |
| **읽기 없는 쓰기** | `edit_file` 전 `read_file` 생략 가능 | `StalenessCheckHook`이 미읽기 파일 차단 | ☐ |
| **압축 없음** | 100턴 세션에서 압축 안 함 | `CompactionEngine` 90% 예산 시 자동 실행 | ☐ |
| **무한 루프** | `maxTurns` 없음 | `AgentLoop` 하드 캡 15/25 | ☐ |
| **에러 중단** | 도구 에러 시 루프 중단 | `ErrorRecoveryExecutor`가 `tool_result.error=true` 반환 | ☐ |
| **JSON 파싱 실패** | 파싱 실패 시 예외 | `ToolCallParser` 펜스 추출→재파싱→1회 재시도 | ☐ |
| **둠 루프** | 동일 도구 3회 반복 감지 안 함 | `DoomLoopDetector` 3회 → 모달 | ☐ |
| **자동 검증 끔** | `edit_file` 후 린트 안 돌림 | `AutoLintHook` PostToolUse에서 자동 실행 | ☐ |
| **자동 장기 기억** | 암시적 장기 기억 ON | `MemoryManager`: 명시 저장 + 사용자 편집만 | ☐ |
| **시크릿 노출** | API 키 포함 코드 생성 허용 | `SecretScanHook` PreToolUse에서 차단 | ☐ |
| **임의 셸** | `run_terminal_cmd` Allowlist 없음 | `PermissionGate` Allowlist 강제 | ☐ |
| **압축 보호구간 침범** | System/Rules/최근 6턴 압축 | `CompactionEngine` 보호구간 인덱스 보존 검증 | ☐ |

---

## 3. "이렇게 하면 망함" 시나리오 (안티패턴 사례집)

| # | 안티패턴 | 발생 현상 | 방지 구현 |
|---|----------|-----------|-----------|
| 1 | **"전체 리팩터링해줘" 한 마디로 Agent 모드 진입** | 50턴 만에 컨텍스트 초과, 20개 파일 망가뜨림, 사용자 중단 못 함 | Plan 모드 강제(복잡도 ≥ 3), `maxTurns=15`, 체크포인트 자동 생성 |
| 2 | **Flash에게 `browser_*` + `mcp_*` 50개 도구 동시 제공** | 토큰 80k 초과, 도구 선택 혼란, 환각 ↑ | Tier A 화이트리스트 10개, MCP는 `tool_search` 스텁 |
| 3 | **Unified Diff로 `edit_file` 지시** | 라인번호 틀려 엉뚱한 곳 수정, 파일 깨짐 | Search-Replace 강제, 유일 매칭 검증 |
| 4 | **`read_file` 없이 `edit_file` 바로 호출** | Stale 데이터로 수정, 외부 변경 덮어씀 | `StalenessCheckHook`가 `mtime/hash` 체크 → 차단 |
| 5 | **50턴짜리 세션 압축 안 함** | 128k 컨텍스트 초과, 모델 에러/중단 | 90% 예산 시 4단계 컴팩션 자동 실행 |
| 6 | **`maxTurns` 없이 Agent 모드 무한 실행** | 200턴째에도 돌다가 비용 폭탄 | `AgentLoop` 하드 캡 15/25, 도달 시 사용자 승인 대기 |
| 7 | **도구 에러 나면 `throw`로 루프 종료** | 한 번 실수에 세션 죽음 | `ErrorRecoveryExecutor`가 `tool_result.error=true`로 반환 |
| 8 | **JSON 파싱 실패 시 `throw`** | 모델이 한 번 JSON 깨면 세션 끝 | `ToolCallParser`: 펜스 추출→재파싱→1회 재요청 |
| 9 | **같은 `read_file` 10번 반복** | 리소스 낭비, 진행 없음 | `DoomLoopDetector` 3회 → 사용자 모달 |
| 10 | **자동 린트 끄고 "알아서 잘하겠지"** | 문법 에러 난 코드 커밋 | `AutoLintHook` PostToolUse 강제, 2회 재시도 |
| 11 | **"이 프로젝트는 TypeScript 쓴다" 자동 장기 기억 ON** | 3개월 후 "이 프로젝트는 Go다" 환각 | 명시 저장만(`save_memory`), 사용자 편집 가능 |
| 11 | **API 키 하드코딩된 코드 생성** | GitHub에 유출, 보안 사고 | `SecretScanHook`이 `sk-`/`ghp_` 등 패턴 차단 |

---

## 3. "이렇게 하면 됨" 요약 (Do Instead)

| Don't | Do |
|-------|----|
| 도구 40개 한 번에 주기 | **Tier A: 10개, Tier B: 전체** |
| Unified Diff 쓰기 | **Search-Replace만** |
| 읽기 없이 쓰기 | **읽기 강제(Staleness Check)** |
| 압축 안 하기 | **4단계 컴팩션(보호구간 보장)** |
| 무한 루프 | **maxTurns 15/25 하드 캡** |
| 에러 던지기 | **tool_result로 에러 반환** |
| JSON 파싱 실패 | **펜스 추출→재파싱→1회 재시도** |
| 둠 루프 방치 | **3회 반복→사용자 모달** |
| 자동 검증 끄기 | **PostToolUse 훅으로 린트/테스트 강제** |
| 암시적 장기 기억 | **명시 저장+사용자 편집만** |
| 시크릿 노출 | **PreToolUse 시크릿 스캔 차단** |
| 임의 셸 | **Allowlist + Deny Patterns** |

---


## Out of Scope

- 프론티어 모델 전용 ‘자율 만능’ 설계를 Tier A에 그대로 적용
- 상세: `00_Master_Context.md` + Harness-14

## 3. References

- `PRD-Harness-01_Model_Tiers.md` — 티어별 제한
- `PRD-Harness-05_Design_Slogans.md` — 5대 슬로건(특히 3, 4, 5번)
- `PRD-Harness-06_A_Tier_Whitelist.md` — A티어 도구 제한
- `PRD-Infra-10_Context_Compaction.md` — 컴팩션 보호구간
- `PRD-Infra-11_Doom_Loop_Detection.md` — 둠 루프 감지
- `PRD-Infra-13_Error_Recovery.md` — 에러 복구 철학
- `PRD-Infra-05_Permission_Autorun.md` — 승인/Allowlist
- `PRD-Infra-06_Hooks.md` — 훅 시스템