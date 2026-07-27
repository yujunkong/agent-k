# 마스터 컨텍스트 - AI 코딩 확장 (Agent-K Extension)

> **원본 설계 문서**: [`docs/Extension_high_impact.md`](../Extension_high_impact.md)  
> **목표**: VS Code/Cursor 확장 API만으로 Cursor급 에이전트 루프 구현 + 중급 로컬 모델(Flash급) 하네스로 안정화  
> **설계 철학**: "확장으로 가능한 것 중, 개발 속도 대비 체감이 큰 것" + "중급 모델이 하네스 덕분에 안정적으로 돌아가게"

---

## 🎯 프로젝트 비전

### 핵심 미션
> **VS Code 확장 API만으로 Cursor Agent와 동등한 "Ask/Agent/Plan/Debug" 4모드 루프를 구현하고, DGX(로컬 Flash급 모델) 환경에서 하네스(검증·프리페치·보호장치) 덕분에 중급 모델도 실무에서 쓸 수 있게 만든다.**

### 설계 목표 (원본 문서 요약)

| 우선순위 | 목표 | 핵심 전략 |
|----------|------|-----------|
| **1순위** | 즉시 체감 기능 (S급) | 사이드바 채팅 + BYOLLM + 에이전트 루프 + 인라인 완성 + 선택영역 Diff |
| **2순위** | 에이전트 루프 완성 (C0→C4) | Cursor 루프 아키텍처 그대로: 읽기 병렬 / 쓰기 직렬 / 검증 루프 / 체크포인트 |
| **3순위** | 중급 모델 하네스 (핵심 차별점) | "탐색은 코드, 판단은 모델" + "한 턴 한 일" + "실패를 값으로" + "스키마 좁게" + "검증 루프" |
| **4순위** | 제품급 인프라 (C5→C7) | Plan/Debug 모드 + Browser/Design + Side chat + Worktree/Best-of-N + Memories + MCP |
| **5순위** | 도메인 특화 (B급) | DGX 원클릭 + 모델 라우터 + 펌웨어/레거시/컴플라이언스 도구 |

---

## 📊 구현 상태 대시보드 (Implementation Status)

> **최신 업데이트**: 2026-07-25 | **총 PRD**: 90개 | **구현 단계**: C0 준비 완료

### Phase별 진행 현황

| Phase | 단계명 | 핵심 산출물 | 상태 | 목표일 | 비고 |
|-------|--------|-------------|------|--------|------|
| **C0** | Chat UI + Streaming | 사이드바 채팅, 스트리밍, 모드 드롭다운, 루프 타임라인 | 🟢 **Ready to Start** | Week 1 | 확장 스캐폴드 완료 후 즉시 시작 |
| **C1** | Ask Mode (Read-Only) | 읽기 도구 병렬, 쓰기 제거, 프리페치, 접이식 그룹 | ⏳ Pending C0 | Week 2 | C0 완료 후 바로 진입 |
| **C2** | Agent Single Turn | Search-Replace edit, Diff 승인, 터미널 1회, 검증 마이크로루프 | ⏳ Pending C1 | Week 3 | 하네스 핵심 검증 루프 포함 |
| **C3** | Agent Multi-Turn | 코어 루프, maxTurns, Stop, 에러→tool result, 메시지 큐 | ⏳ Pending C2 | Week 4 | 이슈 하나를 도구로 끝냄 |
| **C4** | Infrastructure | 승인·체크포인트·둠루프·컴팩션·훅·Memories·Side chat | ⏳ Pending C3 | Week 5-6 | '제품 느낌'의 핵심 |
| **C5** | Plan Mode | 질문 UI, Mermaid, 계획 md, todo 분기 | ⏳ Pending C4 | Week 7 | 계획 없이 코드 안 씀 |
| **C6** | Debug Mode | 가설·계측·재현·로그·최소수정·청소 | ⏳ Pending C5 | Week 8 | 런타임 증거 후 패치 |
| **C7** | Production Grade | Browser/Design, worktree/BoN, `/review`, Memories 고도화, MCP | ⏳ Pending C6 | Week 9-10 | Cursor급 확장 완성 |

### 티어별 PRD 완료 현황

| Tier | 카테고리 | 총 PRD | 완료 | 진행중 | 대기 | 비고 |
|------|----------|--------|------|--------|------|------|
| **S** | 01_S_Tier_Immediate_Impact | 7 | 7 ✅ | 0 | 0 | C0-C2 직접 매핑 |
| **A** | 02_A_Tier_Production_Grade | 14 | 14 ✅ | 0 | 0 | C4-C7 매핑 |
| **B** | 03_B_Tier_Domain_Specific | 6 | 6 ✅ | 0 | 0 | 도메인 특화 |
| **Infra** | 05_Core_Infrastructure | 23 | 23 ✅ | 0 | 0 | 에이전트 루프 기반 |
| **Tools** | 06_Tool_Catalog | 7 | 7 ✅ | 0 | 0 | A-G 고정 taxonomy |
| **Harness** | 07_Medium_Model_Harness | 15 | 15 ✅ | 0 | 0 | 핵심 차별화 요소 |
| **Specs** | 08_Advanced_Specs | 7 | 7 ✅ | 0 | 0 | ①-⑦ 심화 스펙 |
| **Phase** | 04_Implementation_Phases | 8 | 8 ✅ | 0 | 0 | C0-C7 구현 순서 |
| **Meta** | - | 3 | 3 ✅ | 0 | 0 | README, Master Context, Traceability |

**전체: 90/90 PRD 작성 완료 (100%)**

### 다음 액션 아이템 (Next Actions)

| 우선순위 | 작업 | 담당 PRD | 예상 소요 |
|----------|------|----------|-----------|
| **P0** | 확장 스캐폴드 생성 (`package.json`, Webview, 명령어) | `PRD-C0_Chat_UI_Streaming.md` | 0.5일 |
| **P0** | Webview React + Vite + TypeScript 셋업 | `PRD-C0_Chat_UI_Streaming.md` | 0.5일 |
| **P0** | Provider Registry + LiteLLM Adapter (Spec-01) | `PRD-Spec-01_Provider_ToolJSON.md`, `PRD-Infra-21_Model_Router_Provider_Adapter.md` | 1일 |
| **P1** | 채팅 UI: 메시지 버블, 스트리밍, 모드 드롭다운 | `PRD-C0_Chat_UI_Streaming.md` | 1.5일 |
| **P1** | 루프 상태 타임라인 (Thought/Search/Edit/Planning) | `PRD-C0_Chat_UI_Streaming.md` Sec 5.3 | 1일 |
| **P1** | @멘션 자동완성 (파일/폴더/심볼/코드베이스) | `PRD-C0_Chat_UI_Streaming.md` | 0.5일 |

---

## 🏗️ 아키텍처 개요

### 핵심 아키텍처: Cursor 루프 (확장이 직접 구현)

```
사용자 메시지 (+ Rules / 모드 시스템 프롬프트)
    → 컨텍스트 조립 (열린 파일, @멘션, 규칙, 선택 영역, 최근 도구 결과)
    → 모델 스트리밍
    → tool_calls 있으면:
         · 읽기/검색 → 병렬 (Promise.all)
         · 쓰기/터미널 → 직렬 + (필요 시) 승인
         · 결과를 messages에 append
         → 다시 모델
    → tool_calls 없으면 종료 (또는 maxTurns / 사용자 Stop)
```

### 중단 조건
- **도구 없음** · **maxTurns** · **Stop** · **권한 거부** · **동일 도구 반복(Doom Loop)**

### 4가지 모드 (Cursor와 동일 역할)

| 모드 | 할 일 | 파일 수정 | 도구 정책 |
|------|-------|-----------|-----------|
| **Ask** | 설명·탐색 | ❌ | 읽기·검색만 |
| **Agent** | 구현·리팩터·수정 | ✅ | 읽기 + 쓰기 + 터미널 |
| **Plan** | 접근 먼저 합의 | ✅ (계획 승인 후) | 읽기 → 계획 문서 → (승인 후) Agent와 동일 |
| **Debug** | 런타임 증거 기반 수정 | ✅ | 가설 → 로그 삽입 → 재현 대기 → 로그 분석 → 최소 수정 → 계측 제거 |

---

## 🎯 중급 모델 하네스 (핵심 차별화 요소)

### 대상 모델
- **Tier A (기본)**: DeepSeek V4 Flash, 로컬 7B~30B instruct — **도구는 되지만 실수·탈선 잦음**
- **Tier B (강모델)**: Pro / Opus / GPT-고사양 — 도구 풀세트, 자율↑, best-of-n 비교용
- **Tier C (제외)**: 순수 base, tool 미지원 — Agent 비활성 → 완성/채팅만

### 하네스 설계 철학
> **"똑똑함의 상당 부분을 모델이 아니라 하네스에 둔다."**

| 원칙 | 설명 |
|------|------|
| **탐색은 코드, 판단은 모델** | grep/find/read 병렬은 확장이, 모델엔 요약만 |
| **한 턴 한 일** | "고치고 테스트하고 커밋"을 한 프롬프트에 넣지 말 것 |
| **실패를 값으로** | 틀린 패치·깨진 JSON은 예외가 아니라 tool result |
| **스키마를 좁게** | 도구 8개 > 도구 40개 (중급에선) |
| **검증 루프** | edit 후 자동 `read_lints` / 테스트, 통과할 때까지 짧게 재시도 |

### A티어(A=Flash급) 도구 화이트리스트

| 허용 도구 | 이유 |
|-----------|------|
| `grep`, `glob`, `list_dir`, `read_file` | 탐색 필수 |
| `edit_file` (Search–Replace만) | whole-file/unified diff보다 성공률↑ |
| `write_file` (새 파일·짧은 파일만) | 대형 overwrite 금지 |
| `run_terminal_cmd` (allowlist) | `git`, `npm test`, `pytest` 등만 |
| `ask_question`, `todo_write` | 탈선 방지·진행 가시화 |
| `read_lints` | 수정 직후 자동 호출 가능 |

| A티어에서 빼거나 잠금 | 이유 |
|----------------------|------|
| Browser / 이미지 생성 | 루프 길·환각↑ |
| MCP 대량 | 스키마 토큰·선택 혼란 |
| `delete_file` | 실수 비용↑ → 항상 ask 또는 금지 |
| 서브에이전트 다중 | 컨텍스트·조율 실패↑ (탐색 1개만 허용 가능) |
| 임의 셸 | `rm`, `curl\|sh` 등 |

---

## 📦 핵심 기술 스택

| 영역 | 기술 선택 | 비고 |
|------|-----------|------|
| **Extension Host** | VS Code Extension API (TypeScript) | 포크 불필요 |
| **Model Provider** | OpenAI-compatible HTTP (LiteLLM/Ollama/vLLM) | DGX Flash 연결 |
| **Tool Execution** | VS Code Workspace API, Terminal API, FileSystem API | |
| **UI** | Webview (Chat, Diff, Plan, Review) + TreeView (Tools, Memories) | |
| **State** | `workspaceState`, `globalState`, `SecretStorage` | Memories, Checkpoints |
| **Search** | ripgrep (child_process) + `findFiles` + 임베딩(선택) | 병렬 처리 필수 |
| **Parsing** | jsonrepair, Zod 스키마 검증 | 로컬 LLM JSON 파싱 복구용 |

---

## 📐 핵심 데이터 구조

### 내부 정규화 ToolCall 스키마 (PRD-Spec-01)
```typescript
type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;  // 이미 JSON.parse 된 객체
  raw?: string;                       // 파싱 실패 시 원문 보관
};
```

### 컨텍스트 조립 예산 (128k 컨텍스트 기준, PRD-Spec-03)
| 슬롯 | 비율 | 내용 |
|------|------|------|
| System + 모드 프롬프트 | ~5% | Agent/Ask/Plan/Debug |
| Rules | ~5% | 유저/프로젝트/팀, 경로 매칭된 것만 |
| Tool schemas | ~8% | 모드 화이트리스트만 (MCP는 deferred) |
| Sticky context | ~12% | 열린 파일 요약, @멘션, 선택 영역 |
| 대화 + tool results | ~60% | 최근 턴 우선 |
| 응답 여유 (completion) | ~10% | max_output_tokens |

---

## 🔄 구현 로드맵 (단계별 완료 기준)

### C0: 채팅 셸
- [ ] 사이드바 스트리밍 + 모드 드롭다운 UI
- [ ] Ask/Agent 전환 UI

### C1: Ask 모드 (읽기 전용)
- [ ] MVP 읽기 도구 병렬 실행 (`grep`, `glob`, `list_dir`, `read_file`)
- [ ] 쓰기 도구 완전 제거
- [ ] **완료 기준**: 코드 설명만, 디스크 변경 0

### C2: Agent 1턴
- [ ] `edit_file`/`write_file` + Diff 승인 + 터미널 1회
- [ ] **완료 기준**: 승인 후 반영

### C3: Agent 멀티턴
- [ ] 코어 루프 + maxTurns + Stop + 에러→tool result
- [ ] **완료 기준**: 이슈 하나를 도구로 끝냄

### C4: 주변 인프라 (제품 느낌의 핵심)
- [ ] 승인·체크포인트·둠 루프·컴팩션·훅
- [ ] Memories (최소) · 메시지 큐 · Side chat 시작
- [ ] **완료 기준**: 대량 삭제·무한루프 방지

### C5: Plan 모드
- [ ] 질문 UI · Mermaid · 계획 md · todo 분기
- [ ] **완료 기준**: 계획 없이 코드 안 씀

### C6: Debug 모드
- [ ] 가설·계측·재현·로그·최소수정·청소 (Debug 전용 도구)
- [ ] **완료 기준**: 런타임 증거 후 패치
- [ ] **비고**: Browser/Design Mode는 C6이 아니라 **C7**

### C7: 제품급
- [ ] Browser/Design, worktree/best-of-n, `/review`, MCP, Skills, 병렬 서브에이전트, 아티팩트
- [ ] Side chat·Memories 고도화 (C4에서 시작한 것 완성)
- [ ] **완료 기준**: Cursor급 확장

---

## 🧪 중급 하네스 수용 테스트 (A티어 MVP 통과 기준)

1. **단일 파일 버그픽스**: prefetch + edit + lint 자동 → 사람 Diff 승인 1회
2. **"테스트 실패 고쳐줘"**: 실패 로그 → 수정 → 같은 테스트 재실행까지 루프
3. **Ask 모드**: 쓰기 0, 인용 코드가 실제 파일과 일치
4. **고의로 깨진 tool JSON 10건** 중 ≥8건 복구 또는 안전 에러

---

## 🔑 주요 설계 결정 (원본 문서에서 추출)

### 1. Search–Replace 패치 포맷 (기본)
- 로컬 모델이 unified diff hunk 라인번호를 자주 틀림
- SEARCH 블록 유일 매칭 검증 (0건/2건+ → 거절)
- Staleness 체크: 마지막 read 이후 mtime/hash 변경 시 에러

### 2. Provider 어댑터 3계층 (PRD-Spec-01)
| 계층 | 책임 |
|------|------|
| `ProviderAdapter` | HTTP/SSE, auth, model id, stream 이벤트 정규화 |
| `ToolCallParser` | native tool_calls / XML / JSON fence / 이중 인코딩 → 내부 스키마 |
| `ToolResultFormatter` | 내부 결과 → 프로바이더가 기대하는 tool message 형식 |

### 3. 로컬 DeepSeek/약한 tool 모델 대응 파싱 복구
| 증상 | 대응 |
|------|------|
| `arguments`가 문자열 이중 인코딩 | `JSON.parse` 재시도 1~2회 |
| JSON 잘림 / trailing comma | jsonrepair 또는 fence 추출 후 재파싱 |
| 도구 이름 오타 | Registry fuzzy match (거리 1) 또는 "unknown tool" result로 반환 |
| tool_calls 없이 본문에 ```json | 본문 스캔 → tool call로 승격 (fallback) |
| 빈 arguments | 스키마 required 검사 → 모델에 validation error result |

### 4. 프리페치 패턴 (체감 크게 올림)
```
사용자 메시지에서 경로·심볼·에러 스택을 정규식으로 뽑고, 모델 호출 전에:
1) 스택의 파일 read (해당 줄 ±N)
2) 심볼명 grep
3) 결과를 "이미 조사된 컨텍스트" 블록으로 시스템 옆에 첨부
4) 그다음 모델 호출 (도구는 추가 조사·수정용)
```

### 5. 검증 마이크로루프 (edit 직후)
```
edit_file 성공
  → (자동) read_lints on touched files
  → 에러 있으면 tool result로 주입 (모델 재호출, max +2턴)
  → (옵션) 허용된 test 명령 1개
  → 통과 또는 ask_question
```

---

## 🚫 Non-Goals / Out of Scope (기대치 조절)

개별 PRD의 `## Out of Scope`는 이 표를 기준으로 해당 기능에 맞는 항목만 인용한다.

| 영역 | 이유 | 대안 |
|------|------|------|
| IDE 기본 레이아웃을 AI 전용으로 통째 변경 | Agents Window급 풀 UI | 사이드바 + Webview로 근사 |
| Cursor급 네이티브 Ctrl+K 애니메이션·적용 UX 100% 복제 | 네이티브 에디터 통합 필요 | DiffEditor + 인라인 적용으로 70-80% |
| Cloud Agents (격리 VM·항상켜짐·팀 훅 클라우드) | 자체 러너/SaaS 필요 | 별도 러너/인프라 프로젝트로 분리 |
| iOS / Remote Control / Slack 네이티브 | 별도 클라이언트 | 확장만으론 한계 |
| 앱 브랜드·설치본 자체를 "새 IDE"로 배포 | 그건 포크 | 포크 프로젝트로 분리 |
| Team MCP 마켓 풀 복제 | 팀 설정 배포 인프라 | 설정 파일/문서 공유로 시작 |

---

## 🗂️ Canonical Owner Matrix (중복 주제 소유권)

동일 주제가 Infra / Spec / Phase / Feature에 걸쳐 있을 때 **Primary만 구현 계약**, 나머지는 "see also".

| 주제 | Primary (구현 계약) | See also |
|------|---------------------|----------|
| Provider / Tool JSON | `PRD-Spec-01` | Infra-21, PRD-02 |
| Patch / `edit_file` | `PRD-Spec-02` + `PRD-Tools-B` | PRD-09, C2 |
| Context Budget | `PRD-Spec-03` | Infra-02 |
| Terminal execution | `PRD-Spec-04` + `PRD-Tools-C` | C2–C3 |
| Permission / Autorun | `PRD-Spec-05` | Infra-05, C4 |
| Checkpoint / Rollback | `PRD-Spec-06` | Infra-09, C4 |
| Context Compaction | `PRD-Spec-07` | Infra-10, C4 |
| Prefetch | `PRD-Harness-09` | Infra-15 |
| Verification micro-loop | `PRD-Harness-10` | Harness-02 |
| Memories | `PRD-15` | Harness-04, C4/C7 |
| Model routing | `PRD-23` / `PRD-23b` | Harness-12, Infra-21 |
| Indexing / `@codebase` | `PRD-08` | Infra-03, Infra-18 |
| MCP | `PRD-10` | Tools-F |
| Browser / Design | `PRD-11` (**C7**) | Tools-D, C7 |
| Doom Loop | `PRD-Infra-11` | C4, loop #15 |
| Agent Loop Controller | `PRD-Infra-20` | PRD-03, C3 |
| Skills / 핀 스킬 | `PRD-28` + Tools-F `skill` | C7 |
| Settings Hub | `PRD-29` | Infra-17 (`agent-k.*`), PRD-21 (Secrets) |
| Message Queue UX | `PRD-17` | PRD-29 Queue 탭 |
| Tool Catalog A–G | `PRD-Tools-A`~`G` (원본 문자) | PRD-06 |

### Tool Catalog 문자 (원본 `Extension_high_impact.md` 고정)

| 문자 | 파일 | 내용 |
|------|------|------|
| A | `PRD-Tools-A_Search_Explore.md` | 검색·탐색 |
| B | `PRD-Tools-B_Edit_File.md` | 편집·파일 변경 + Review UI |
| C | `PRD-Tools-C_Terminal_Process.md` | 터미널·프로세스 |
| D | `PRD-Tools-D_Web_Browser_Media.md` | 웹·브라우저·미디어 |
| E | `PRD-Tools-E_Session_UX.md` | 사용자·세션 UX |
| F | `PRD-Tools-F_Orchestration_Extension.md` | 오케스트레이션·MCP·Skills |
| G | `PRD-Tools-G_Debug_Tools.md` | Debug 모드 전용 |

도메인 특화(SVD/시리얼/MISRA/레거시)는 Tools 문자가 아니라 **B급 PRD-24~27**.

---

## 📚 용어 정의 (확장됨)

| 용어 | 정의 | 관련 PRD |
|------|------|----------|
| **Agent Loop** | 모델 ↔ 도구 실행 ↔ 결과 반환 반복 루프 | `PRD-Infra-20` |
| **Harness (하네스)** | 모델 주변의 검증·보호·프리페치·컴팩션 인프라 전체 | `07_Medium_Model_Harness` |
| **Prefetch** | 사용자 메시지 분석 → 모델 호출 전 관련 파일 선독 | `PRD-Harness-09` |
| **Search–Replace** | SEARCH 블록(기존 코드) + REPLACE 블록(새 코드) 패치 포맷 | `PRD-Spec-02`, `PRD-Tools-B` |
| **Staleness** | read 이후 파일 변경 여부 (mtime/hash로 검증) | `PRD-Spec-02` |
| **Doom Loop** | 동일 도구·동일 인자 반복 (N회 연속 → 사용자에게 ask) | `PRD-Infra-11` |
| **Compaction** | 긴 세션에서 오래된 tool 결과 요약·삭제, 턴 전 압축 | `PRD-Infra-10`, `PRD-Spec-07` |
| **Checkpoint** | 큰 수정 전 스냅샷 (Git과 별도 로컬 스냅샷, 타임라인 Restore) | `PRD-Infra-09`, `PRD-Spec-06` |
| **MCP Bridge** | MCP tools → 동일 Registry에 등록 (이름 충돌 prefix) | `PRD-10`, `PRD-Tools-F` |
| **Side Chat** | 메인 Agent 실행 중에도 `/side`로 읽기 전용 세션 | `PRD-12` |
| **Worktree** | `git worktree`로 격리 브랜치에서 한 에이전트 실행 | `PRD-13` |
| **Best-of-N** | 모델(또는 프롬프트)별 worktree 병렬 → diff/테스트 요약 비교 → 하나 채택 | `PRD-13` |
| **Tier A/B/C** | 모델 등급: A=Flash(기본), B=Pro(강모델), C=Base(채팅만) | `PRD-Harness-01` |
| **Verification Micro-Loop** | edit 직후 자동 lint/test → 실패 시 모델 재투입 | `PRD-Harness-10` |
| **Context Budget** | 128k 컨텍스트를 슬롯별 비율로 분할 관리 | `PRD-Spec-03`, `PRD-Infra-02` |
| **Tool Registry** | 도구 스키마·핸들러·권한 메타 중앙 관리 (Zod/JSON Schema) | `PRD-Infra-04` |
| **Streaming Tool Executor** | 스트림 중 도구 선실행 (tool_call 도착 즉시 읽기 시작) | `PRD-Infra-07` |
| **Parallel/Serial Policy** | 읽기 병렬, 쓰기·셸 직렬 (concurrent-safe vs exclusive) | `PRD-Infra-08` |
| **Hook System** | PreToolUse / PostToolUse (차단·수정·로깅·시크릿 스캔) | `PRD-Infra-06` |

---

## 🏗️ 아키텍처 결정 기록 (ADR - Architecture Decision Records)

> 주요 기술적 결정의 배경과 대안을 문서화. PRD 참조용.

| ADR # | 제목 | 결정 | 대안 | 상태 | 관련 PRD |
|-------|------|------|------|------|----------|
| **ADR-001** | Chat UI: Webview vs Chat Participant API | **Webview (ViewProvider)** — 완전 커스텀 UI, 스트리밍 제어, 타임라인 UI 가능 | Chat Participant API (VS Code 네이티브, 하지만 UX 제약) | ✅ Accepted | `PRD-C0` |
| **ADR-002** | Model Provider: `vscode.lm` vs Internal HTTP | **Internal HTTP (LiteLLM/OpenAI-compat)** — BYOLLM 완전 지원, DGX 연동, 스트리밍 제어 | `vscode.lm` (내장 모델만, BYOLLM 제한적) | ✅ Accepted | `PRD-02`, `PRD-Infra-21` |
| **ADR-003** | Patch Format: Search-Replace vs Unified Diff | **Search-Replace (Apply Patch)** — 로컬 모델 라인번호 실수 방지, 매칭 확실 | Unified diff (익숙하지만 라인번호 깨짐 많음) | ✅ Accepted | `PRD-Spec-02`, `PRD-Tools-B` |
| **ADR-004** | Tool Execution: Parallel reads, Serial writes | **읽기 병렬 (Promise.all + p-limit), 쓰기/터미널 직렬** | 완전 직렬 (느림), 완전 병렬 (레이스 컨디션) | ✅ Accepted | `PRD-Infra-08` |
| **ADR-005** | Verification: Post-edit auto-lint | **PostToolUse 훅에서 자동 실행, 실패 시 tool_result로 주입** | 사용자가 수동 실행, 별도 버튼 | ✅ Accepted | `PRD-Harness-10`, `PRD-Infra-06` |
| **ADR-006** | Context Compaction: 4단계 (Truncate → Drop → Micro-summary → Full) | **단계적 압축, 보호 구간(시스템/룰/최근 K턴/현재 목표) 유지** | 한 번에 전체 요약 (중요 컨텍스트 손실 위험) | ✅ Accepted | `PRD-Infra-10`, `PRD-Spec-07` |
| **ADR-007** | Doom Loop Detection: (toolName, argsHash, errorSig) 지문 | **N회(기본 3) 연속 동일 실패 → 루프 중단 + 사용자 ask** | 턴 카운트만 제한 (도구별 반복 미감지) | ✅ Accepted | `PRD-Infra-11` |
| **ADR-008** | Tier A Tool Whitelist: 8 tools only | **검색/읽기 4 + edit/write 2 + 터미널(allowlist) + ask/todo + lint** | 전체 도구 제공 (중급 모델 혼란) | ✅ Accepted | `PRD-Harness-06` |
| **ADR-009** | Prefetch: User message → regex extraction → pre-read | **모델 호출 전 동기 실행, 컨텍스트에 '이미 조사됨' 블록 주입** | 모델이 도구로 탐색하게 둠 (지연↑) | ✅ Accepted | `PRD-Harness-09`, `PRD-Infra-15` |
| **ADR-010** | State Storage: `workspaceState` + `globalState` + `SecretStorage` | **Memories/Checkpoints=workspaceState, Provider Config=SecretStorage** | SQLite 로컬 DB (과도함) | ✅ Accepted | `PRD-Infra-17`, `PRD-19` |

---

## 🚀 Quick Start Guide (C0~C7)

### Prerequisites
- Node.js 20+ (LTS)
- VS Code 1.90+ / Cursor 최신
- DGX/LiteLLM 엔드포인트 접근 가능 (또는 로컬 Ollama)
- Git, ripgrep (`rg`) 설치

### 1. 프로젝트 생성 (Day 1 오전)
```bash
# Option A: VS Code Extension Generator
npx --package=yo --package=generator-code yo code
# → TypeScript, Webpack/ESBuild, Webview (React 권장)

# Option B: 수동 구조 생성 (권장: 더 깔끔)
mkdir agent-k && cd agent-k
npm init -y
npm install -D typescript @types/node @types/vscode vite @vitejs/plugin-react
npm install react react-dom shiki mermaid katex uuid nanoid jsonrepair zod p-limit
```

### 2. C0: Chat UI + Streaming (Day 1-2)
```bash
# 1) extension.ts 엔트리포인트 + WebviewViewProvider 등록
# 2) Vite + React 웹뷰 설정 (HMR 개발용)
# 3) 메시지 버블 + 스트리밍 파이프라인 (AbortController)
# 4) 모드 드롭다운 (Ask/Agent/Plan/Debug) + 세션 리셋
# 5) @멘션 트리거 (@file:, @folder:, @symbol:, @codebase)
```
**검증**: `F5` → 사이드바 'Agent K' 패널 열림 → "Hello" 전송 → 토큰 단위 스트리밍 확인

### 3. Provider Adapter + Tool JSON Parser (Day 2-3)
```bash
# src/providers/
# - ProviderRegistry.ts
# - BaseProviderAdapter.ts
# - LiteLLMProvider.ts (OpenAI-compatible)
# - ToolCallParser.ts (native + XML + JSON fence + double-encoded)
# - ToolResultFormatter.ts
```
**검증**: 설정에서 DGX Flash 엔드포인트 등록 → "Test Connection" → 모델 목록 로드 → 채팅에서 스트리밍 응답

### 4. C1: Ask Mode (Day 3-4)
```bash
# src/tools/search/ - Grep, Glob, ListDir, ReadFile
# src/tools/registry.ts - ToolRegistry 구현
# src/loop/AskModeController.ts - 읽기 전용 루프
# src/loop/ParallelExecutor.ts - 병렬 실행 + concurrency limit
# src/prefetch/PrefetchEngine.ts - 경로/심볼 추출 → 선독
```
**검증**: Ask 모드에서 "@file:src/auth.ts explain" → 파일 읽기 → 설명만 출력, 디스크 변경 없음

### 5. C2: Agent Single Turn (Day 5-7)
```bash
# src/tools/edit/ - EditFile (Search-Replace), WriteFile
# src/tools/terminal/ - TerminalTool (allowlist)
# src/patch/ - SearchReplaceParser, PatchApplier, StalenessChecker
# src/review/ - ReviewUIProvider (Diff 프리뷰), PendingStore
# src/hooks/AutoVerificationHook.ts - edit 후 자동 lint
# src/verification/ - LintRunner, TestFinder
```
**검증**: Agent 모드에서 "Add TODO comment to main.ts" → edit_file 호출 → Diff 프리뷰 → Apply → 파일 변경됨 + lint 통과

### 6. C3: Agent Multi-Turn (Day 8-10)
```bash
# src/loop/AgentLoopController.ts - 코어 루프 (Infra-20)
# src/loop/MaxTurnsGuard.ts - 턴 제한
# src/loop/DoomLoopDetector.ts - 반복 감지
# src/loop/MessageQueue.ts - Enter=Interrupt&Resynthesize, Alt+Enter=Queue-only (PRD-17)
# src/context/ContextAssembler.ts - 예산 기반 조립
```
**검증**: "Implement login feature" 같은 멀티파일 작업이 도구만으로 완료됨

### 7. C4: Infrastructure (Day 11-14)
```bash
# src/permission/ - PermissionGate (Spec-05)
# src/checkpoint/ - CheckpointManager (Spec-06)
# src/hooks/ - HookSystem (Pre/PostToolUse)
# src/compaction/ - CompactionEngine (Spec-07)
# src/memories/ - MemoryStore (최소)
# src/sidechat/ - SideChatSession
# src/telemetry/ - TelemetryCollector
```
**검증**: 대량 삭제 시도 → 권한 거부, 무한 루프 → Doom loop 감지 후 중단, 긴 세션 → 컴팩션 후에도 핵심 컨텍스트 유지

### 8. C5~C7: Advanced Modes (Day 15+)
- **C5 Plan**: 질문 UI, Mermaid, 계획 문서, todo 분기
- **C6 Debug**: 가설→계측→재현→로그→최소수정→청소
- **C7 Production**: Browser/Design, Worktree/BoN, `/review`, MCP, Skills, Artifacts

---

## 📖 참고 문서

- **원본 설계**: [`docs/Extension_high_impact.md`](../Extension_high_impact.md)
- **PRD 인덱스**: `docs/PRDs/README.md`
- **추적성 매트릭스**: `docs/PRDs/PRD-Traceability-Matrix.md`
- **의존성 그래프**: `docs/PRDs/PRD-Dependency-Graph.md`
- **구현 런북**: `docs/PRDs/PRD-Implementation-Runbook.md`
- **VS Code Extension API**: https://code.visualstudio.com/api
- **Language Model API**: https://code.visualstudio.com/api/extension-guides/language-model
- **MCP Specification**: https://modelcontextprotocol.io/
- **jsonrepair**: https://github.com/josdejong/jsonrepair

---

> **SSOT (설계 진실)**: [`docs/Extension_high_impact.md`](../Extension_high_impact.md)  
> **이 문서 역할**: PRD 인덱스용 마스터 컨텍스트(요약·용어·ownership·로드맵·상태·ADR·Quick Start). 원본과 충돌 시 **원본을 따름**.  
> 개별 PRD는 Overview / FR / AC / Dependencies / **Out of Scope** / References를 유지한다.
