# PRD-Harness-08: Harness Duties (하네스가 대신 하는 일)

> **Category**: Medium Model Harness  
> **Phase**: C1~C4 (전 단계 공통)  
> **관련 PRD**: `PRD-Harness-02_Verification_First.md`, `PRD-Harness-07_Prompt_Turn_Structure.md`, `PRD-Infra-06_Hooks.md`

---

## 1. Overview

### 목적
**중급 모델(Flash, 7B~30B)이 "잘 도는" 환경을 만들기 위해, 모델이 해야 할 일을 하네스가 대신 수행**한다. 모델은 "판단"만 하고, 나머지는 하네스가 책임진다.

### 핵심 원칙
> **"모델은 판단만, 나머지는 하네스가"**
- 모델: "어디를 볼까?", "어떻게 고칠까?", "다 됐나?"
- 하네스: 탐색·실행·검증·복구·기록·예산관리

---

## 2. 하네스가 대신 하는 일 (Duties)

| # | 역할 (Duty) | 모델이 하는 일 | 하네스가 하는 일 | 구현체 |
|---|-------------|----------------|------------------|--------|
| **1** | **탐색 실행** | "어디 볼지" 지시 (`grep`, `read_file` 인자) | `grep` 16병렬, `read_file` 250줄 캡, staleness 체크, 프리페치 | `ParallelExecutor`, `PrefetchEngine` |
| **2** | **파일 읽기/쓰기** | `edit_file` 인자 (search/replace) | 유일 매칭 검증, staleness 체크, Diff UI, 승인 게이트, 원자적 적용, 롤백 | `PatchApplier`, `DiffPreview`, `PermissionGate` |
| **3** | **명령 실행** | `run_terminal_cmd` 인자 (cmd, cwd) | Allowlist 검증, 타임아웃/시그널, 출력 32KB 캡, ANSI 파싱, ANSI 색상 렌더링 | `TerminalExecutor`, `TerminalPTY` |
| **4** | **검증·복구** | "실패했네, 다시 해볼게" | `read_lints` 자동 실행, 에러 주입, 2회 재시도, `ask_question` эскалация | `AutoLintHook`, `RecoveryExecutor` |
| **5** | **컨텍스트 예산** | "중요한 것만 말해줘" | 토큰 카운팅, 4단계 컴팩션(Truncate→Drop→Micro-summary→Full), 보호구간 보장 | `CompactionEngine` |
| **6** | **프리페치/프리실행** | "이 파일 봐줘" | 사용자 메시지 분석 → `@mention`/스택트레이스/import → 모델 호출 전 선읽기 | `PrefetchEngine`, `StreamingExecutor` |
| **7** | **도구 스키마/권한** | "이 도구 써" | 티어별 화이트리스트, 권한 게이트, MCP 지연 로드, 스키마 토큰 예산 | `ToolRegistry`, `PermissionGate`, `MCPRegistry` |
| **8** | **컨텍스트 조립/압축** | "중요한 것만 말해" | 슬롯별 예산, 4단계 컴팩션(Truncate→Drop→Micro→Full), 보호구간 보장 | `ContextAssembler`, `CompactionEngine` |
| **9** | **체크포인트/롤백** | "되돌려줘" | 첫 쓰기 전/5파일마다/수동 → 스냅샷, 타임라인 UI, 원클릭 롤백 | `CheckpointManager` |
| **10** | **둠 루프 감지** | (자동) | 동일 도구·동일 인자 3회 → 사용자 힌트 요청 / 강제 중단 | `DoomLoopDetector` |
| **11** | **메모리/규칙 주입** | "기억해줘" | `save_memory` 도구, 반복 감지→자동 제안, 3계층 저장소, 예산 내 주입 | `MemoryManager`, `RulesEngine` |
| **12** | **프리페치/스트리밍 실행** | (자동) | 사용자 메시지 분석 → `@mention`/import/stacktrace → 모델 호출 전 선읽기 | `PrefetchEngine`, `StreamingExecutor` |
| **13** | **세션/턴 관리** | (자동) | 턴 카운터, maxTurns, 타임아웃, Stop 버튼, 체크포인트 자동 생성 | `AgentLoop`, `AbortController` |
| **14** | **로깅/관측** | (자동) | 턴/도구/토큰/지연시간 JSONL 로그, 대시보드용 메트릭 | `TelemetryLogger` |
| **14** | **보안/시크릿** | (자동) | PreToolUse 훅에서 시크릿 스캔, 마스킹, 차단 | `SecretScanHook` |

---

## 3. 모델이 "하지 않아도 되는 것" (Do NOT List)

| 모델이 안 해도 되는 것 | 하네스가 대신 함 |
|------------------------|------------------|
| `grep` 결과 100개 중 어디 볼지 일일이 고르기 | 상위 20개만 모델에 전달, 프리페치로 상위 5개 미리 읽기 |
| 파일 읽을 때 `offset`/`limit` 계산 | 기본 250줄, 필요 시 모델이 `offset`/`limit` 지정 |
| `edit_file` 후 린트 돌리고 에러 보면 다시 고치기 | `PostToolUse` 훅이 자동 `read_lints` → 에러 주입 → 재시도 |
| 같은 파일 3번 읽기 방지 (mtime 체크) | `StalenessCheck` 훅이 자동 차단, 재읽기 유도 |
| 같은 도구 3번 반복 감지 | `DoomLoopDetector`가 3회째에 사용자 개입 유도 |
| 토큰 예산 계산·압축 | `ContextAssembler` + `CompactionEngine` 자동 |
| 첫 쓰기 전 체크포인트 생성 | `CheckpointManager`가 첫 `edit_file` 전 자동 생성 |
| 시크릿 키 실수로 커밋 | `SecretScanHook`이 PreToolUse에서 차단 |
| 맥시멈 턴/타임아웃 감시 | `AgentLoop`가 `maxTurns`/`turnTimeout` 강제 |
| Stop 버튼 눌렀을 때 정리 | `AbortController`가 스트리밍·도구·타임아웃 일괄 중단 |

---

## 3. 하네스 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER MESSAGE                              │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PREFETCH ENGINE                              │
│  @mention / import / stacktrace → pre-fetch read_file/grep       │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CONTEXT ASSEMBLER                             │
│  System + Rules + Tools + Sticky + History + User Msg           │
│  → Token Budget → Compaction (4-stage) → Protected Zones        │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MODEL (LLM)                                  │
│  System + Context → Stream → tool_calls / text                  │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
        ┌─────────────────┴─────────────────┐
        ▼                                   ▼
┌───────────────┐                   ┌───────────────┐
│ READ-ONLY     │                   │ WRITE/EXEC    │
│ TOOLS         │                   │ TOOLS         │
│ (parallel)    │                   │ (sequential)  │
│ grep, read,   │                   │ edit, write,  │
│ lsp, glob     │                   │ terminal,     │
│               │                   │ delete        │
└───────┬───────┘                   └───────┬───────┘
        ▼                                   ▼
┌───────┴───────┐                 ┌───────────────┐
│ PRE-FETCH     │                 │ PERMISSION    │
│ RESULTS       │                 │ GATE + DIFF   │
│ READY FOR     │                 │ PREVIEW +     │
│ NEXT TURN     │                 │ APPROVAL      │
└───────┬───────┘                 └───────┬───────┘
        ▼                                   ▼
┌───────┴───────────────────────────────────┐
│           POST TOOL HOOKS                 │
│  auto-lint → auto-test → error injection  │
│  staleness check → cache invalidate       │
│  verification retry (max 2x) → escalate   │
└───────┬───────────────────────────────────┘
        ▼
┌───────┴───────┐
│  CHECKPOINT   │  ← 첫 쓰기/5파일/수동 시 자동 스냅샷
│  + DOOM LOOP  │  ← 3회 동일 호출 감지 → 사용자 힌트
└───────────────┘
```

---

## 3. 하네스 의존성 그래프 (초기화 순서)

```
1. ToolRegistry          (도구 정의·스키마·메타데이터)
2. PermissionGate        (권한 레벨·allowlist·deny glob)
3. HookRegistry          (Pre/Post 훅 레지스트리)
4. ParallelExecutor      (p-limit 병렬 실행기)
5. PermissionGate        (승인 게이트·Diff 프리뷰)
6. StreamingExecutor     (스트리밍 중 tool_calls 선실행)
7. PrefetchEngine        (사용자 메시지 분석 → 선읽기)
8. ContextAssembler      (컨텍스트 조립·예산·보호구간)
6. CompactionEngine      (4단계 압축·보호구간)
7. CheckpointManager     (스냅샷·롤백·타임라인)
8. DoomLoopDetector      (3회 반복 감지·UI)
7. MemoryManager         (3계층 메모리·자동 제안)
8. RulesEngine           (규칙 파일 파싱·매칭·주입)
8. PrefetchEngine        (스트리밍 중 tool_calls 선실행)
9. StreamingExecutor     (스트리밍 중 읽기 선실행)
9. ErrorRecoveryExecutor (자동 재시도·에러 주입)
9. AutoLintHook          (PostToolUse → read_lints)
9. DoomLoopDetector      (3회 반복 감지 → UI)
9. SecretScanHook        (시크릿 스캔·차단)
9. StalenessHook         (mtime/hash 체크)
9. CompactionEngine      (4단계 압축)
9. CheckpointManager     (스냅샷/롤백)
9. DoomLoopDetector      (둠 루프 감지)
10. AgentLoop            (메인 루프·턴 관리·중단/타임아웃)
11. ModelRouter          (티어 선택·비용·폴백)
12. AgentLoop            (메인 루프·턴 관리·중단/타임아웃)
```

---

## 3. "하네스가 대신 함" 체크리스트 (구현 완료 기준)

| Duty | 구현 완료 기준 | 테스트 |
|------|----------------|--------|
| 탐색 병렬 실행 | `p-limit(16)`로 `grep`/`read_file` 100개 < 1s | 벤치마크 100개 파일 < 1초 |
| 프리페치 | 사용자 메시지 `@file:` → 모델 호출 전 `read_file` 완료 | `@file:src/x.ts` 입력 → 모델 호출 전 `read_file` 완료 로그 |
| 스테일니스 체크 | `edit_file` 전 `mtime`/`hash` 체크 → 변경 시 에러 | 외부 편집 후 `edit_file` → "File modified externally" 에러 |
| 자동 린트 | `edit_file` 후 `read_lints` 자동 실행 → 에러 주입 → 재시도 | 의도적 에러 주입 → 2회 내 자동 수정 |
| 둠 루프 | 동일 도구·인자 3회 → 모달 | `read_file("x.ts")` 3회 → 모달 "힌트 주기/계속/중단" |
| 컴팩션 | 90% 예산 → 4단계 압축 → 보호구간 보존 | 100턴 세션 → 토큰 95%→65%, 최근 6턴 보존 |
| 체크포인트 | 첫 쓰기/5파일/수동 → 스냅샷 → 타임라인 UI 복원 | 5파일 수정 → 체크포인트 생성 → "Restore" 클릭 → 원상복구 |
| 메모리 주입 | 1.5% 예산 내 60개 메모리 주입 | 100개 메모리 → 상위 60개만 주입, 팀>워크스페이스>유저 우선순위 |
| 시크릿 스캔 | `edit_file`에 API 키 → 차단 | `sk-...` 포함 `edit_file` → "Potential secret detected" 차단 |
| 프리페치 | `@file:src/x.ts` 입력 → 모델 호출 전 `read_file` 완료 | 로그: `prefetch: src/x.ts completed in 12ms` |

---

## 4. "하네스가 대신 함" 체크리스트 (구현 완료 = ✅)

| Duty | 구현체 | 상태 |
|------|--------|------|
| 탐색 병렬 실행 | `ParallelExecutor` + `p-limit(16)` | ☐ |
| 프리페치 (메시지 분석 → 선읽기) | `PrefetchEngine` | ☐ |
| 스테일니스 체크 | `StalenessHook` (PreToolUse) | ☐ |
| 자동 린트/테스트 | `AutoLintHook` / `AutoTestHook` (PostToolUse) | ☐ |
| 검증 마이크로 루프 | `VerificationMicroLoop` (최대 2회 재시도) | ☐ |
| 둠 루프 감지 | `DoomLoopDetector` (3회 → UI) | ☐ |
| 컨텍스트 예산/압축 | `ContextAssembler` + `CompactionEngine` (4단계) | ☐ |
| 체크포인트/롤백 | `CheckpointManager` (스냅샷/타임라인 UI) | ☐ |
| 메모리 관리 | `MemoryManager` (3계층 + 반복 감지) | ☐ |
| 규칙 엔진 | `RulesEngine` (파싱/매칭/주입) | ☐ |
| 프리페치/스트리밍 선실행 | `StreamingExecutor` + `PrefetchEngine` | ☐ |
| 세션/턴/타임아웃/Stop | `AgentLoop` + `AbortController` | ☐ |
| 체크포인트 자동 생성 | 첫 쓰기/5파일/수동 | ☐ |
| 둠 루프 감지/해결 | 3회 → 힌트/계속/중단 | ☐ |
| 시크릿 스캔/마스킹 | `SecretScanHook` (PreToolUse) | ☐ |
| 로깅/메트릭 | `TelemetryLogger` (JSONL) | ☐ |

---


## Out of Scope

- 프론티어 모델 전용 ‘자율 만능’ 설계를 Tier A에 그대로 적용
- 상세: `00_Master_Context.md` + Harness-14

## 4. References

- `PRD-Harness-02_Verification_First.md` — 검증 우선 철학
- `PRD-Harness-05_Design_Slogans.md` — 5대 슬로건 (특히 1, 3, 5번)
- `PRD-Harness-07_Prompt_Turn_Structure.md` — 프롬프트/턴 구조
- `PRD-Infra-06_Hooks.md` — 훅 시스템 아키텍처
- `PRD-Infra-13_Error_Recovery.md` — 에러 복구 상세