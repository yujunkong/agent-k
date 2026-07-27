# 확장으로 만들 수 있는 기능 (고효과 · 빠른 임팩트)

VS Code / Cursor / Neural Inverse **확장 API만**으로 구현 가능한 기능 중,  
개발 속도 대비 체감이 큰 것 위주입니다. (포크 불필요)

우선순위: **즉시 체감 → 에이전트 → 도메인 특화**  
설계 목표 하나 더: **중급·로컬 모델(Flash급)이 하네스 덕분에 안정적으로 돌아가게** (아래 **중급 모델용 하네스**).

---

## S급 — 빨리 만들고 체감 큼

| 기능 | 왜 강한가 | 핵심 API |
|------|-----------|----------|
| **사이드바 AI 채팅 + BYOLLM** | Cursor의 핵심 체감의 60% | Chat Participant, Webview, LM Chat Provider |
| **루프 상태 타임라인 UI** | Thought·Search·Edit·Planning next moves + 접이식 그룹 | Webview + TurnTimeline — **코어 루프 절** |
| **로컬/LiteLLM/Ollama 연결** | DGX·개인 서버 바로 붙임 | Language Model Chat Provider, OpenAI-compatible HTTP |
| **Cursor형 Agent 루프** (Ask/Agent/Plan/Debug) | 공식 4모드 + tools-in-a-loop | LM Tools, 모드별 화이트리스트 — **Cursor 코어 루프** 절 |
| **인라인 자동완성 (자체 모델)** | 매 키스트로크 체감 | `InlineCompletionItemProvider` |
| **선택 영역 → 수정 제안 + Diff** | Ctrl+K 대체 (70~80%) | Commands, WorkspaceEdit, DiffEditor |
| **부분 파일 수정 (`edit_file`)** | 전체 rewrite 대비 빠르고 안전 | Search–Replace → `WorkspaceEdit.replace` — **도구 카탈로그 B절** |
| **편집 Review UI** | 사용자가 바꾼 곳만 보고 승인 | 파일 그룹 + hunk 미리보기 + Keep/Undo — **B절 Review UI** |
| **워크스페이스 도구 세트** | 에이전트 실력 = 도구 | 아래 **도구 카탈로그** (MVP→풀세트) |
| **병렬 파일 탐색 · 읽기** | 검색을 모델보다 빠르게 | `findFiles` + `Promise.all` / concurrency 큐 |

---

## A급 — 조금 더 품 들이면 제품급

| 기능 | 왜 강한가 | 핵심 API |
|------|-----------|----------|
| **코드베이스 인덱싱 + @codebase** | 큰 레포에서 검색 품질 | 자체 임베딩/청크 + Files API |
| **멀티파일 Apply / 패치 리뷰 UI** | Cursor식 확인: hunk 미리보기·파일 그룹·Keep/Undo | Webview + DiffEditor + PendingStore — **도구 B절 Review UI** |
| **MCP 클라이언트** | 외부 도구 생태계 | MCP SDK + LM Tools 브리지 |
| **Browser + Design Mode** | UI 검증·클릭·스크린샷·요소 지정 | Playwright/Puppeteer + Webview |
| **Side chat (`/side`)** | 메인 Agent 안 끊고 탐색 | 읽기 전용 세션 + 메인에 @인용 |
| **Worktree / Best-of-N** | 격리 병렬 시도 후 비교 | `git worktree` + 멀티 세션 |
| **Agent Review / 로컬 Bugbot** | 푸시 전 버그·보안 리뷰 | Diff + LM + (옵션) GitHub API |
| **Memories** | 세션 넘어 선호·사실 유지 | SecretStorage / workspaceState |
| **대화 검색 · 아티팩트** | 과거 채팅·데모·diff 재사용 | 로컬 인덱스 + Webview |
| **메시지 큐** | 작업 중 후속 지시 | 큐 + **Interrupt & Resynthesize** (Cursor형) |
| **PR/이슈 연동 에이전트** | 리뷰·이슈 자동화 | GitHub API + Chat/Tools |
| **테스트 생성 · 실패 수정 루프** | CI 전 로컬 자동화 | Testing API, Terminal, LM |
| **커밋 메시지 · PR 설명 생성** | 매일 쓰는 짧은 생산성 | SCM API + LM |
| **시크릿/설정 금고 UI** | BYOLLM API 키 안전 저장 | SecretStorage |
| **설정 허브 (Settings)** | Cursor Settings급 — 모델·권한·큐·하네스·인덱스를 한곳 | `contributes.configuration` + 설정 Webview — **아래 설정 절** |

---

## B급 — 도메인 특화 (당신 하드웨어/업무에 맞춤)

| 기능 | 왜 강한가 | 비고 |
|------|-----------|------|
| **DGX / vLLM / TRT-LLM 원클릭 프로바이더** | Spark 2대 활용 | 확장 = 엔드포인트·모델 카탈로그만 |
| **모델 라우터** (Cost / Balance / Intelligence) | Cursor Router급 + A/B 티어 | Flash 기본, 막히면 Pro — **중급 하네스**와 세트 |
| **펌웨어: SVD 뷰어 · 레지스터 패널** | NI Firmware의 확장 버전 | Webview + TreeView |
| **레거시 스캔 → 리포트** | Modernisation 라이트 | 언어별 파서 + Webview 리포트 |
| **MISRA/린트 AI 설명** | 컴플라이언스 보조 | Diagnostics + LM |
| **시리얼 모니터 패널** | 임베디드 | Serialport + Webview |

---

## 확장으로 하기 애매한 것 (기대치 조절)

- IDE 기본 레이아웃을 AI 전용으로 통째 변경 (**Agents Window**급 풀 UI)  
- Cursor급 네이티브 Ctrl+K 애니메이션·적용 UX 100% 복제  
- **Cloud Agents** (격리 VM·항상켜짐·팀 훅 클라우드) — 자체 러너/SaaS 없으면 어려움  
- **iOS / Remote Control / Slack 네이티브** — 별도 클라이언트  
- 앱 브랜드·설치본 자체를 “새 IDE”로 배포 (그건 포크)

→ 위는 확장으로 **비슷하게**는 가능, **완전 동일**은 포크·클라우드 영역.

---

## 최근 Cursor 기능 → 확장에 넣을 것 (2025–2026)

changelog 기준으로 **체감이 좋아진 것**만 골랐습니다.  
이미 문서에 있는 Plan/Debug/Browser/Checkpoint는 생략하고, **빠진·얕은 것**을 보강합니다.

| Cursor 기능 | 왜 요즘 체감↑ | 확장 난이도 | 넣을 단계 |
|-------------|---------------|-------------|-----------|
| **Plan 고도화** (확인 질문 UI, Mermaid, todo→새 에이전트) | 큰 작업 실패율↓ | 중 | C5 |
| **Debug Mode** | “찍어서 고침” → 런타임 증거 | 중~상 | C6 |
| **Browser GA + Design Mode** | UI 버그·프론트 검증 | 중~상 | C7 |
| **Side chats** | 메인 루프 안 깨고 질문 | 하~중 | C4~C7 |
| **`/worktree` + `/best-of-n`** | 모델·접근 병렬 비교 | 중 | C7 |
| **병렬 서브에이전트** | 탐색/구현 분리 | 중 | C7 |
| **Agent Review · Bugbot급** | 푸시 전 리뷰·보안 | 중 | A급 / C7 |
| **Memories** | 반복 지시 감소 | 하 | C4 |
| **대화 검색** | 긴 이력에서 회수 | 하 | C7 |
| **메시지 큐 / Interrupt & Resynthesize** | 장시간 Agent UX | 하 | C3~C4 |
| **Artifacts** (스크린샷·데모·diff 카드) | 결과물 공유·재방문 | 중 | C7 |
| **Skills / 핀 스킬** | 반복 워크플로 | 하 | C7 |
| **Cursor Router (Auto)** | 비용·품질 자동 | 중 | B급 (이미 모델 라우터) |
| **Cloud Agents / 모바일** | 노트북 닫고도 진행 | 상 (인프라) | 별도 러너 — 확장만으론 한계 |
| **Team MCP 마켓** | 팀 표준 도구 | 중 (설정 배포) | 팀 쓸 때 |
| **Settings / Auto-run UI** | 권한·모델·큐를 한곳에서 | 중 | C0 뼈대 → C4 완성 |

### Plan 고도화 (C5에 추가할 디테일)

```
탐색(읽기)
  → 확인 질문 (객관식 UI, AskUserQuestion)
  → 계획 문서 저장 (워크스페이스 md)
  → 인라인 Mermaid (아키텍처/흐름)
  → 사용자 편집·승인
  → todo 일부만 새 Agent 세션으로 분기 (선택)
  → 실행
```

### Side chat

- 메인 Agent **실행 중**에도 `/side`로 읽기 전용 세션  
- 기본 도구: grep/read/search만 (쓰기는 메인만)  
- 나중에 메인 채팅에서 `@side-결과`로 컨텍스트 합치기  

### Worktree + Best-of-N

```
/worktree        → 격리 브랜치에서 한 에이전트
/best-of-n N=3   → 모델(또는 프롬프트)별 worktree 병렬
                 → diff/테스트 요약 비교 → 하나 채택·나머지 삭제
```

DGX 2대면 **모델 라우팅 + best-of-n**이 특히 잘 맞음 (Flash 여러 개 vs Pro 1개).

### Agent Review (로컬 Bugbot 라이트)

1. `git diff` / 스테이징 범위 수집  
2. 체크리스트 프롬프트 ( correctness / security / tests )  
3. 파일별 finding 리스트 UI  
4. (옵션) “Fix” → 새 Agent 세션에 finding 주입  

클라우드 Bugbot 전체 복제는 불필요. **푸시 전 `/review`** 만으로도 체감 큼.

### Memories (최소)

| 동작 | 구현 |
|------|------|
| 모델이 “기억해” / 반복 선호 감지 | `workspaceState`에 key-value |
| 매 턴 Rules 옆 주입 | 예산 1~2%만 |
| UI에서 삭제·편집 | 설정 웹뷰 |

자동 장기기억은 환각 위험 → **명시 저장 + 사용자 편집** 권장.

### Design Mode (Browser 확장)

- 브라우저 스크린샷 위에 사용자가 박스/화살표 주석  
- 주석 좌표 + 스크린샷을 다음 턴 컨텍스트에 첨부  
- Agent는 `browser_*` + `edit_file`로 UI 수정 후 재캡처  

→ 프론트 작업에서 Cursor가 최근 특히 좋아진 부분. 확장으로도 Playwright면 가능.

### 기대치 — 확장 vs Cursor 네이티브

| 가져오기 좋음 | 비슷하게만 | 미루기 |
|---------------|------------|--------|
| Side chat, Memories, 메시지 큐, `/review`, Plan+Mermaid, 모델 라우터 | Browser/Design, worktree/best-of-n, Artifacts | Cloud Agent VM, iOS Remote, Slack, Agents Window 풀교체 |

---

## 병렬 처리 — 파일 탐색 · 읽기

확장에서 **가능하고, 에이전트보다 확장이 직접 하는 편이 더 빠릅니다.**

| 방식 | 설명 |
|------|------|
| `Promise.all` / `allSettled` | 여러 파일 읽기·검색 동시 실행 |
| `vscode.workspace.findFiles` | glob으로 후보 수집 |
| ripgrep / child process | 큰 레포 CPU 병렬 검색 |
| 인덱싱 배치 | 임베딩 요청을 N개씩 동시 처리 |
| concurrency 제한 | 동시 8~16 권장 (디스크·RAM 보호, `p-limit` 등) |

예시:

```ts
const uris = await vscode.workspace.findFiles('**/*.{ts,tsx}', '**/node_modules/**');
const texts = await Promise.all(
  uris.slice(0, 50).map(u => vscode.workspace.fs.readFile(u))
);
```

### 설계 원칙 (DGX + 로컬 LLM)

1. **파일 탐색·grep·읽기** → 확장이 병렬 (모델 대기 X)  
2. **모델** → 요약·수정 계획만  
3. 로컬 DeepSeek 등은 병렬 tool call을 잘 안 내는 경우가 많음 → 검색은 코드로, LLM은 판단  

에이전트가 한 응답에 도구를 여러 개 부르면, 확장이 `Promise.all`로 실행하면 됩니다.

---

## Cursor 코어 루프 (공식 모드 기준)

출처: [Agent](https://cursor.com/help/ai-features/agent.md) · [Ask](https://cursor.com/help/ai-features/ask-mode.md) · [Plan](https://cursor.com/docs/agent/plan-mode) · [Debug](https://cursor.com/docs/agent/debug-mode) · [Agents 개념](https://cursor.com/learn/agents.md) · [Agent overview](https://cursor.com/docs/agent/overview)

확장은 **Cursor와 같은 4모드 + 공통 tool loop + 부가 루프(#5~#15)** 를 목표로 합니다.  
Cursor 공식 정의: Agent의 핵심은 **tools in a loop** (Instructions · Tools · Model).  
**전체 목록은 아래 「전체 루프 인벤토리」** (0=엔진 · 1~4=모드 · 5~15=부가/하네스).

### 모드 전환 (Cursor UI)

| 조작 | 동작 |
|------|------|
| Agent 패널 모드 피커 | Ask / Agent / Plan / Debug 선택 |
| `Shift+Tab` | 모드 순환 |
| 모드 전환 시 | **컨텍스트 창을 새로** 잡는 것이 Cursor 권장 (작업 단위 = 채팅 단위) |
| Rules | Project / User / Team rules는 **네 모드 모두**에 적용 |

### 모드 한눈에 (Cursor 공식 표)

| 모드 | Best for | 파일 수정? |
|------|----------|------------|
| **Agent** | 기능 구현, 리팩터, 버그 수정 | Yes |
| **Ask** | 코드 이해, 아키텍처 탐색 | **No (read-only)** |
| **Plan** | 복잡한 멀티파일·접근을 먼저 리뷰 | Yes (**계획 승인 후** 빌드) |
| **Debug** | 재현·원인 파악이 어려운 버그 (런타임 증거) | Yes |

암기: **Ask → Understand · Plan → Think · Agent → Build · Debug → Fix**.

---

### 공통 엔진: Tool Loop (네 모드가 공유)

Cursor Agent overview / learn 기준. 모드마다 **쓸 수 있는 도구·프롬프트·중단 조건**만 다름.

```
사용자 메시지
  (+ Instructions: system + Rules + 모드 전용 프롬프트)
  → 컨텍스트 조립 (@파일, 열린 탭, 선택 영역, 최근 도구 결과…)
  → 모델 스트리밍
       · Thinking / Thought (reasoning 있으면)
       · Planning next moves (다음 도구 전·턴 사이 — UI 상태)
  → tool_calls?
       Yes → 도구 실행
            · Search / Read / Grep / Glob / Web / Browser / Fetch Rules …
            · Edit / Write / Terminal / Ask question …
            · (읽기·검색은 병렬 가능, 쓰기·터미널은 직렬·승인 정책)
            → tool result를 messages에 append
            → 다시 모델  ←── 루프
       No  → 최종 답변 · 종료
  → 중단: 도구 없음 | Stop | maxTurns(확장) | 권한 거부 | doom loop(확장)
```

**Cursor가 Agent에 넣는 도구 축** (overview): Search · Web · Fetch Rules · Read · Edit · Shell · Browser · Image generation · Ask questions.  
+ Checkpoints(세션 스냅샷) · Message queue(후속 지시)는 루프 **주변 인프라**.

확장은 이 엔진 하나를 구현하고, 아래 4모드를 **화이트리스트 + 프롬프트 + UI 게이트**로 분기한다.

---

### 1) Ask 루프 — read-only 이해

**목적:** 코드베이스 설명·탐색. **편집·터미널 쓰기 없음.**

```
질문
  → (공통) Tool Loop
       허용: grep / glob / read / list_dir / codebase_search / web_* (읽기성)
       금지: edit / write / delete / shell(쓰기성) / notebook_edit
  → 인용·설명으로 답변 후 종료
```

전환: 수정이 필요해지면 사용자가 **Agent**로 모드 변경 (Cursor 권장).

---

### 2) Agent 루프 — 자율 구현 (기본 모드)

**목적:** 기능 구현, 리팩터, 버그 수정, 테스트·셸까지. Cursor에서 **대부분의 작업**.

```
목표 설명
  → (공통) Tool Loop — 도구 제한 사실상 없음(정책·Auto-run만)
       탐색(search/read) → 계획(내부) → edit → (shell/test) → 실패 시 재시도
  → Review UI (인라인 diff · N files · Keep/Undo)
  → Checkpoints (큰 변경 전 자동 스냅샷 · Restore 가능)
  → (작업 중) Message queue: Enter=중단·종합·재시작 · Alt+Enter=큐만 (Cursor형)
```

UI 타임라인 예: `Thought` → `Searched` → `Read` → `Planning next moves` → `Edited` → 최종 답.

---

### 3) Plan 루프 — 승인 전 설계

**목적:** 복잡한 멀티파일·여러 접근이 있을 때 **코드 쓰기 전에** 계획 합의.  
`Shift+Tab`으로 Plan 진입. 복잡한 키워드면 Cursor가 Plan을 **제안**하기도 함.

```
1. Clarifying questions (객관식·확인 질문 UI) — 요구 명확화
2. Codebase research (Ask에 가까운 읽기·검색 tool loop)
3. Implementation plan 생성
     · Markdown 계획 문서 (경로·코드 레퍼런스 포함)
     · (확장) Mermaid / todo 목록
     · 기본 저장: 홈 디렉터리 계획 영역 · “Save to workspace” → `.cursor/plans/` 등
4. 사용자 리뷰 · 직접 md 편집 · 불필요 스텝 삭제
5. Build / 승인 클릭
     → 그 시점부터 **Agent 루프**로 실행 (쓰기·터미널 허용)
```

실패 시 Cursor 권장: 어설픈 follow-up으로 고치기보다 **변경 revert → 계획 다듬기 → 다시 Build**.

확장 매핑: 1~4단계는 **쓰기 도구 off**, 5단계만 Agent 화이트리스트 on.

---

### 4) Debug 루프 — 런타임 증거 기반 수정

**목적:** 재현·원인 파악이 어려운 버그. **추측 패치 금지**, 로그 증거 후 최소 수정.

```
1. Explore & hypothesize
     · 관련 파일 탐색 · 가설 N개 생성
2. Add instrumentation
     · 로그 삽입 → (Cursor) 로컬 debug 서버/확장으로 수집
3. Reproduce (사람 in the loop)
     · Agent가 재현 스텝 제시 → 사용자가 실행 · 대기
4. Analyze logs
     · 수집 로그로 실제 원인 특정
5. Targeted fix
     · 원인에 맞는 최소 패치 (종종 수 줄)
6. Verify & clean up
     · 재현으로 검증 → 계측 코드 제거
```

확장 매핑: 2·3단계는 **계측 전용 edit + 사용자 대기 UI**, 5단계만 일반 `edit_file`, 6단계에서 계측 삭제.  
일반 Agent와 다른 점: **재현 대기 게이트**가 루프 한가운데 있음.

---

### 전체 루프 인벤토리 (부가 포함 · 문서 기준)

| # | 루프 | 종류 | Cursor에서의 위치 |
|---|------|------|-------------------|
| **0** | **공통 Tool Loop** | 엔진 | 네 모드가 공유하는 tools-in-a-loop |
| **1** | **Ask** | 공식 모드 | read-only 이해 |
| **2** | **Agent** | 공식 모드 | 기본 구현 |
| **3** | **Plan** | 공식 모드 | 승인 전 설계 → Build 시 Agent |
| **4** | **Debug** | 공식 모드 | 계측·재현·증거 패치 |
| **5** | **루프 상태 타임라인 UI** | 부가(항상) | Thought / Search / Edit / Planning next moves |
| **6** | **Review / inline diff** | 부가 | 편집 후 Keep·Undo · 파일 그룹 |
| **7** | **Checkpoints** | 부가 | 변경 전 스냅샷 · Restore |
| **8** | **Message queue** | 부가 | 실행 중 Enter=중단·종합·재시작 · Queue-only |
| **9** | **Side chat** | 부가 | 메인 루프와 병렬 읽기 세션 |
| **10** | **Worktree / Best-of-N** | 부가 | 격리 병렬 시도 후 채택 |
| **11** | **Agent Review (Bugbot급)** | 부가 | 푸시 전 정적/AI 리뷰 |
| **12** | **Browser (+ Design Mode)** | 부가·도구 | UI 검증·클릭·스크린샷·주석 |
| **13** | **Verification 마이크로루프** | 하네스 | edit 직후 lint/test → 재투입 |
| **14** | **Context Compaction** | 하네스 | 긴 세션 창 유지 |
| **15** | **Doom-loop / Stop** | 하네스 | 동일 도구 반복 차단 · 사용자 중단 |

아래 **5)~15)** 가 부가·하네스 코어 루프 전문이다. (1)~4)는 위 절.)

---

### 5) 루프 상태 타임라인 UI — Thought / Search / Edit / Planning next moves

→ 상세는 바로 아래 **「Cursor형 루프 상태 UI」** 절 (상태 라벨·접이식 그룹·구현 맵).

요약 루프:

```
Tool Loop 이벤트
  → Thought | Searching | Reading | Editing | Running | Browsing | Asking
  → 턴 사이: Planning next moves…
  → 완료 시 카테고리별 접이식 그룹으로 고정
  → 최종 Answer는 타임라인과 분리
```

---

### 6) Review / inline diff 루프 — 사용자 확인

**목적:** Agent가 디스크에 쓴 변경을 사용자가 **파일·hunk 단위로** 보고 Keep/Undo.

```
edit_file / write_file 성공
  → before 스냅샷 확보 (Checkpoint와 공유 가능)
  → PendingStore에 path · hunks · +/- 등록
  → UI: 인라인 diff(red/green) + 채팅 `N Files · Review` 그룹 목록
  → 사용자:
       Keep / Keep All     → overlay 해제 · accepted 표시
       Undo / Undo All     → before로 WorkspaceEdit 복구 · Pending 제거
       Open Diff           → DiffEditor / hunk 미리보기(일부만)
  → (세션 종료·새 채팅) Pending 정책에 따라 클리어
```

상세 UI·구현: **도구 카탈로그 B절 · Cursor형 편집 확인 UI**.

---

### 7) Checkpoints 루프 — 롤백

**목적:** Git과 별개로 Agent 변경을 **로컬 스냅샷**으로 되돌림. (Cursor: 큰 변경 전 자동 생성)

```
(트리거) 첫 write 전 · N파일 이상 변경 전 · 사용자 “checkpoint” · 위험 도구 직전
  → 변경 대상 파일 before 내용/해시 저장 (확장 storage)
  → 채팅 타임라인에 Checkpoint 노드 표시
사용자 Restore 클릭
  → 해당 스냅샷 파일만 복구
  → Pending Review 상태와 정합 (Undo와 정책 맞춤)
  → (옵션) 이후 Agent에 “restored to checkpoint X” 시스템 노트
```

심화: **⑥ Checkpoint**. Git commit과 혼동하지 말 것.

---

### 8) Message queue 루프 — 후속 지시 (Cursor형)

**목적:** Agent가 도는 동안 후속 지시를 받아 **기존 실행을 중단**하고, 대기열·새 입력을 **종합**한 뒤 Tool Loop를 **재시작**한다.  
(벤치마크: Cursor — 실행 중 전송 ≈ stop & continue with updated instructions)

```
Agent Tool Loop 실행 중
  → 사용자 입력:
       Enter / Send (기본)  → Interrupt & Resynthesize
            · AbortController (스트림·진행 중 도구 정책적 취소)
            · Queue.drain() + 새 문구 → 단일 user 종합 블록
            · sticky context 유지 · Review/Checkpoint 유지
            · Tool Loop 재진입
       Alt+Enter / Queue    → Queue.push만 (Abort 없음, 뱃지 Queued:N)
       Apply now            → 입력 없이도 drain 후 Resynthesize
       Shift+Enter          → 줄바꿈 (전송 아님)
  → (구형 “턴 끝날 때까지 큐만”)은 Queue-only로만 제공
```

Stop과 구분: **Stop** = 루프 종료 · **Enter(Resynthesize)** = 종료가 아니라 지시 갱신 후 재개.  
확장: Stop 시 큐 폐기/유지 정책 명시 · Resynthesize debounce로 연타 폭주 방지.

종합 블록 예:

```
[Updated instructions — previous agent run interrupted]
1. (queued) …
2. (latest) …
Continue from current workspace state.
```

상세: **PRD-17_Message_Queue.md**.

---

### 9) Side chat 루프 — 병렬 읽기 세션

**목적:** 메인 Agent를 멈추지 않고 `/side`로 **읽기 전용** 탐색. 나중에 메인에 인용.

```
메인 Agent 루프 (계속 실행)
     ∥
Side 세션 시작 (/side)
  → Ask와 동일: 읽기·검색 도구만
  → 쓰기·터미널·Review 변경 금지
  → 결과 요약·코드 인용 보관
메인 채팅에서 @side-결과 / “인용”
  → 메인 컨텍스트에 요약 블록 주입
  → 메인 Agent가 이어서 구현
```

Side는 **독립 Tool Loop 인스턴스**(모드=Ask 상당) + 메인과의 **합류 게이트**만 추가.

---

### 10) Worktree / Best-of-N 루프 — 격리 병렬

**목적:** 여러 접근·모델을 **git worktree(또는 복사 워크스페이스)** 에서 병렬 실행 후 하나 채택.

```
/worktree 또는 /best-of-n N=3
  → worktree(또는 브랜치) N개 생성
  → 각  Isolates에서 Agent 루프 병렬 (모델/프롬프트 다르게 가능)
  → 각 결과: diff 요약 · (옵션) test 결과
  → 비교 UI (Best-of-N 카드)
사용자 채택
  → 승자 worktree → 메인 워킹트리로 merge/apply
  → 나머지 worktree 삭제
  → Checkpoint 권장
```

DGX 2대면 Flash×N vs Pro×1 라우팅과 잘 맞음.

---

### 11) Agent Review 루프 — 푸시 전 리뷰

**목적:** 커밋/PR 전 버그·보안·품질 finding. (Cursor Agent Review / Bugbot급)

```
트리거: /review · 커밋 전 · PR 열기 전
  → 범위 수집: git diff / 스테이징 / 최근 Agent Pending
  → (병렬) 정적 힌트 + LM 리뷰 프롬프트
  → finding 리스트 UI (파일·줄·심각도·제안)
사용자:
       Accept fix → 해당 finding만 edit_file 마이크로 Agent
       Dismiss / 무시
  → (옵션) GitHub Review API로 코멘트
```

메인 Agent와 분리된 **리뷰 전용 루프**(쓰기 기본 off, Accept 시에만 edit).

---

### 12) Browser (+ Design Mode) 루프 — UI 검증

**목적:** 앱을 열어 클릭·스크린샷·(Design Mode) 요소 주석 후 수정.

```
browser_navigate / snapshot
  → (옵션) Design Mode: 요소 클릭 · 주석·좌표
  → 스크린샷·DOM 요약을 컨텍스트에 첨부
  → Agent: browser_* + edit_file 로 UI 수정
  → 재캡처로 검증
  → 반복 until 사용자 OK
```

도구: Playwright/Puppeteer + Webview. 일반 Agent Tool Loop의 **browser 그룹**이 길어진 형태.

---

### 13) Verification 마이크로루프 — edit 직후 자동 검증

**목적:** 중급 모델 안정화. 사람이 “테스트 해줘” 하기 전에 하네스가 돌림.

```
edit_file 성공
  → read_lints / diagnostics (해당 파일)
  → (옵션) allowlist test 1회
  → 실패?
       Yes → tool result로 에러 주입 → Agent 재호출 (max +2턴)
       No  → Review UI에만 남김 · 다음으로
```

중급 하네스 **검증 마이크로루프** 절과 동일.

---

### 14) Context Compaction 루프 — 창 유지

**목적:** 긴 세션에서 tool result·오래된 턴을 줄여 overflow 방지.

```
매 턴 조립 전 (또는 토큰 예산 초과 시)
  → Truncate: 오래된 tool result 본문 절단
  → Summarize: 오래된 대화 블록 LM/규칙 요약으로 치환
  → Sticky 유지: 열린 파일 · @멘션 · 현재 에러 · 활성 todo
  → messages 재조립 → Tool Loop 계속
```

심화 **⑦ Compaction**. Thought 전문은 기본적으로 보관하지 않거나 접힌 요약만.

---

### 15) Doom-loop / Stop 루프 — 안전 중단

**목적:** 같은 실패 도구 반복·무한 턴 방지. 사용자 Stop.

```
매 tool_call 후
  → 지문: (toolName, argsHash, errorSignature)
  → 동일 실패 ≥ N (예: 3) → doom loop
       → 루프 중단 + UI “같은 행동 반복 중” + 모델 변경/Plan 제안
사용자 Stop / AbortController
  → 진행 중 HTTP·셸 취소
  → Queue 정책 적용 · 부분 Review/Checkpoint 유지
```

---

### Cursor형 루프 상태 UI — Thought / Search / Edit / Planning next moves ✅

Cursor 채팅은 에이전트가 **지금 무엇을 하는지**를 한 줄 상태로 보여 주고, 끝나면 **접이식 그룹**으로 묶어 타임라인을 남깁니다.  
확장은 Webview 채팅만으로 동일 패턴을 구현할 수 있습니다 (네이티브 애니메이션은 불필요).

**상태 라벨 (벤치마크 · 확장 내부 enum)**

| UI에 보이는 문구 (예) | 언제 | 데이터 소스 |
|----------------------|------|-------------|
| **Thinking** / **Thought** | reasoning/thinking 스트림 중·완료 | `delta.reasoning` / think 태그 / thinking part |
| **Planning next moves** | 도구 호출 직전·턴 사이 “다음 할 일” 정리 | 모델 본문 한 줄 요약 또는 하네스가 turn 시작 시 표시 |
| **Searching** / ** Grepping** | `grep` / `codebase_search` / `glob` 실행 중 | tool_call name + query 요약 |
| **Reading** | `read_file` / `list_dir` | path + 줄 범위 |
| **Editing** / **Writing** | `edit_file` / `write_file` | path + +/− 요약 |
| **Running** / **Terminal** | `run_terminal_cmd` | 명령 한 줄 (민감하면 truncate) |
| **Browsing** | `browser_*` / `web_fetch` | URL |
| **Asking** | `ask_question` | 질문 제목 |
| **Done** / 최종 답 | tool_calls 없음 · 스트림 종료 | assistant content |

표시 규칙: **진행 중 = 스피너/펄스**, **완료 = ✓ + 접힌 그룹**, **실패 = ✗ + 에러 한 줄**.

**접이식 그룹화 (완료 후)**

```text
▾ Thought · 2.1s
    (클릭 시 reasoning 일부 — 기본 접힘, 길면 truncate)

▾ Searched codebase · 3 tools
    grep "applyEdit" · 12 hits
    glob **/*.ts · 40 files
    read src/foo.ts:80-120

▸ Edited 2 files                    ← 기본 접힘, 펼치면 path 목록
    edit_file src/foo.ts  +12 −3
    edit_file src/bar.ts   +2 −0

Planning next moves…                 ← 다음 모델 턴 직전 상태줄
```

같은 턴에서 **연속 동일 카테고리** 도구는 하나로 묶는다 (Search×3 → `Searched · 3 tools`).  
Edit는 Review UI 배너와 링크 (`Open Review`).

**구현 맵**

| 레이어 | 내용 |
|--------|------|
| **TurnTimeline** | `{ id, kind, title, detail?, status: running\|done\|error, startedAt, endedAt?, children[] }` |
| **이벤트 훅** | `onReasoning` · `onToolStart` · `onToolEnd` · `onAssistantText` · `onTurnBoundary` |
| **카테고리 매핑** | tool Registry에 `uiGroup: thought\|search\|read\|edit\|terminal\|browser\|ask` |
| **Webview** | 진행 중 row는 sticky/최신만 펼침. 완료 그룹은 **기본 collapse** (Thought는 특히) |
| **Planning next moves** | (A) 모델이 짧은 status 문장 emit · (B) 하네스가 tool 실행 후·재호출 전 `Planning next moves…` 고정 문구 |
| **본문과 분리** | 최종 사용자 답변은 타임라인 **아래**에만 두고, tool/thought는 그룹 카드로만 |

**코어 루프 ↔ UI 연결**

```
모델 스트리밍
  → reasoning chunk    ⇒ timeline.push(Thought, running) / append detail
  → tool_call 시작     ⇒ Planning next moves 잠깐 → 해당 그룹(Search/Edit/…) running
  → tool 결과          ⇒ 그룹 child done (요약만, 전문 금지)
  → 같은 카테고리 연속  ⇒ 기존 그룹에 child merge
  → 재호출 직전        ⇒ Planning next moves…
  → 최종 텍스트        ⇒ Answer 블록 (타임라인과 별도)
```

**완료 기준 (C0~C3)**

- [ ] 실행 중 “Searching… / Editing… / Thinking…” 중 하나가 항상 보임  
- [ ] 끝나면 카테고리별 **접이식 그룹**으로 남음  
- [ ] **Planning next moves**가 턴 사이에 표시됨  
- [ ] Thought/tool 본문이 채팅을 도배하지 않음 (요약 + expand)

→ S급 채팅 UX · Review UI와 한 세트. 타임라인 이벤트는 **공통 Tool Loop** instrumentation에서 발행.  
→ 인벤토리 **#5**. Review·Checkpoint·Queue 등은 **#6~#15**.

---

## 루프 주변 인프라 (제품 차이의 본체)

코어 루프는 단순합니다. Cursor / Claude Code / OpenCode가 커 보이는 이유는 **루프 바깥 인프라**입니다.  
확장도 C4~C7에서 여기부터 쌓습니다.

| 인프라 | 역할 | 구현 포인트 |
|--------|------|-------------|
| **Instructions / Rules** | 시스템 프롬프트 + 프로젝트/유저/팀 규칙 | 모드별 프롬프트 분기, `.cursorrules` / `AGENTS.md` / 규칙 파일 주입 |
| **컨텍스트 조립** | 매 턴 모델에 넣을 창 | 열린 탭, 커서 주변, @파일/@폴더, 선택 영역, 최근 도구 결과 |
| **인덱싱 / Semantic Search** | `@codebase`급 의미 검색 | 청크·임베딩·벡터 DB (또는 ripgrep만으로 시작) |
| **Tool Registry** | 도구 스키마·핸들러·권한 메타 | Zod/JSON Schema, `readonly` / `destructive` 플래그 |
| **Permission / Auto-run** | 실행 전 승인 게이트 | Ask / 승인 / allowlist / bypass 단계 (터미널·쓰기·웹) |
| **Hooks** | PreToolUse / PostToolUse | 차단·수정·로깅·시크릿 스캔 |
| **Streaming Tool Executor** | 스트림 중 도구 선실행 | `tool_call` 도착 즉시 읽기 시작 → 지연↓ |
| **병렬 / 직렬 정책** | 읽기 병렬, 쓰기·셸 직렬 | concurrent-safe vs exclusive 분류 |
| **Checkpoints / 롤백** | 큰 수정 전 스냅샷 | Git과 별도 로컬 스냅샷, 타임라인 Restore |
| **Context Compaction** | 긴 세션 창 유지 | 오래된 tool 결과 요약·삭제, 턴 전 압축 |
| **Doom Loop 감지** | 동일 도구·동일 인자 반복 | N회(예: 3) 연속 → 사용자에게 ask |
| **maxTurns / timeout / Stop** | 무한 루프·비용 상한 | 하드 캡 + UI Stop + AbortController |
| **에러 복구** | 도구 실패 ≠ 루프 중단 | 실패를 tool result로 반환 → 모델이 재시도 |
| **메시지 큐** | 작업 중 후속 지시 | Enter=중단·종합·재시작 · Queue-only 옵션 |
| **서브에이전트** | 별도 컨텍스트로 위임 | explore/일반/디버그 전용, 결과만 부모에 요약 |
| **MCP 브리지** | 외부 도구 확장 | MCP tools → 동일 Registry에 등록 (이름 충돌 prefix) |
| **Tool Search / Deferred tools** | 도구 스키마 폭증 방지 | MCP 많을 때 stub만 넣고 필요할 때 로드 |
| **Provider 어댑터** | 모델별 tool JSON 차이 | OpenAI / Anthropic / 로컬 DeepSeek 정규화 |
| **관측 / 비용** | 디버깅·토큰·지연 | turn 로그, tool latency, token usage |
| **Debug 계측 서버** | Debug 모드 전용 | 확장 로컬 로그 수집 엔드포인트 |
| **설정 허브** | 제품 노브 한곳 | VS Code Settings + 설정 Webview — **아래 「설정」절** |

### 실행 파이프라인 (한 tool_call)

```
모델이 tool_call emit
  → Registry lookup
  → Permission / Hook (Pre)
  → 실행 (읽기 병렬 / 쓰기·셸 직렬)
  → Hook (Post) + 결과 persist
  → messages에 tool result append
  → (필요 시) compaction
  → 다음 모델 호출
```

### 읽기 vs 쓰기 정책 (권장)

| 분류 | 예 | 동시성 | 기본 승인 |
|------|-----|--------|-----------|
| **readonly** | read, grep, glob, list, codebase_search, lsp, webfetch(캐시) | 병렬 OK | 보통 자동 |
| **write** | edit, write, delete, notebook_edit, apply_patch | 파일당 직렬 | Diff / 승인 |
| **exec** | shell / bash / powershell | 직렬 (또는 백그라운드 분리) | allowlist 또는 매번 |
| **network** | web_search, web_fetch, browser | 제한적 병렬 | 도메인 정책 |
| **orchestrate** | task/subagent, ask_user, todo | 정책별 | 서브에이전트 도구 화이트리스트 |

---

## 도구 카탈로그 (Cursor형 확장 목표)

이름은 제품마다 다르지만 **역할은 거의 동일**합니다.  
아래는 **확장에 넣을 목표 세트**(Cursor 중심) + 타 제품 대응입니다.

### A. 검색 · 탐색

| 도구 (권장 이름) | 하는 일 | Cursor | Claude Code | OpenCode | VS Code API 힌트 |
|------------------|---------|--------|-------------|----------|------------------|
| `codebase_search` | 의미 검색 (임베딩) | ✅ | (Task/Explore로 대체 많음) | `codesearch` 등 | 자체 인덱스 |
| `grep` | 정규식 내용 검색 | `grep_search` | `Grep` | `grep` | ripgrep / `findText` |
| `glob` / `file_search` | 경로·이름 패턴 | `file_search` | `Glob` | `glob` | `findFiles` |
| `list_dir` | 디렉터리 목록 | ✅ | (Bash/Read) | `list` / `read` | `fs.readDirectory` |
| `read_file` | 파일·이미지 읽기 (구간) | ✅ | `Read` | `read` | `fs` / `openTextDocument` |
| `lsp_*` | 정의/참조/진단 | (부분) | `LSP` | `lsp` | Language Features API |

### B. 편집 · 파일 변경

| 도구 | 하는 일 | Cursor | Claude Code | OpenCode | 비고 |
|------|---------|--------|-------------|----------|------|
| `edit_file` / `apply_patch` | 부분 수정 (권장) | `edit_file` | `Edit` | `edit` / `apply_patch` | Diff UI와 연결 |
| `write_file` | 생성·전체 덮어쓰기 | (edit에 포함되는 경우) | `Write` | `write` | 신규 파일용 |
| `delete_file` | 삭제 | ✅ | (Bash) | (bash) | 고위험 → 항상 승인 |
| `reapply` | 실패한 패치 재적용 | ✅ | — | — | 스마트 모델 재시도 |
| `notebook_edit` | Jupyter 셀 수정 | — | `NotebookEdit` | — | 노트북 워크플로 |
| `multiedit` | 한 파일 다중 hunk | — | — | `multiedit` | UX상 하나로 묶어도 됨 |

#### 부분 파일 수정 — 확장으로 구현 가능 ✅

**전체 파일을 새로 쓰지 않고, 구간만 고치는 기능은 VS Code / Cursor 확장 API만으로 충분합니다.**  
(포크 불필요. 이미 S급 Agent·C2·심화 스펙 ②의 기본 경로.)

| 레이어 | 하는 일 | API / 방식 |
|--------|---------|------------|
| **도구 스키마** | 모델이 “어디를 무엇으로”만 냄 | `edit_file`: `path` + `old_string` + `new_string` (Search–Replace). 선택적으로 `replace_all` |
| **매칭** | 문서에서 `old_string` 유일 매칭 → `Range` 계산 | `TextDocument.getText()` / offset→`Position` |
| **적용** | 해당 Range만 교체 | `WorkspaceEdit.replace(uri, range, newText)` → `workspace.applyEdit` |
| **삽입·삭제** | 줄·블록 단위 | `WorkspaceEdit.insert` / `delete` , 또는 `TextEditor.edit` |
| **멀티 hunk** | 한 파일 여러 군데 | 같은 Edit에 `replace` 여러 번 (또는 순차 적용) |
| **리뷰 UX** | 적용 전 확인 | DiffEditor / Webview에 before·after hunk 표시 후 승인 |
| **전체 쓰기** | 예외만 | `write_file` = **신규 파일** 또는 **짧은 파일(&lt;~200줄)**. 대형 overwrite 금지 |

**왜 부분 수정이 기본이어야 하는가**

- 모델·네트워크: 바꿀 블록만 생성 → **토큰·지연↓** (전체 rewrite 대비 체감 큼)  
- 안전: 건드리지 않은 줄은 그대로 → 실수 범위·리뷰 부담↓  
- 중급 로컬 모델: unified diff 라인번호보다 **정확한 문자열 매칭**이 성공률↑  

#### OpenCode형 전체쓰기 문제 → Cursor형으로 해결 ✅

**증상 (OpenCode 등에서 자주 겪는 것):**  
에이전트가 `write`로 **파일 전체를 tool call 인자로 다시 씀** → 대화·tool result에 거대 본문이 쌓여 **context가 급격히 늘어남** (느림·compaction·창 overflow).

**확장에서는 Cursor처럼 설계하면 됩니다.** (가능 · 권장)

| | OpenCode형 (피하기) | Cursor형 (이 확장 기본) |
|--|---------------------|-------------------------|
| 도구 | `write(path, contents=전체)` | `edit_file(path, old_string, new_string)` |
| 모델이 내는 양 | 파일 수천 줄 | **바꿀 hunk만** (보통 수~수십 줄) |
| 디스크 적용 | 전체 overwrite | `WorkspaceEdit.replace` 구간만 |
| tool result | 전체 내용 재출력하면 더 폭증 | `{ ok, path, linesChanged }` **짧게** |
| 읽기 | 파일 통째 messages에 유지 | `read_file` **offset/limit** (200~300줄 캡) |

**컨텍스트를 짧게 유지하는 규칙 (하네스 강제)**

1. **편집 기본 도구 = `edit_file`만** — 기존 파일에 `write_file` 호출 시 하네스가 **거절**하고 `edit_file` 쓰라고 hint  
2. **`write_file` 허용:** 신규 생성 · 또는 현재 길이 &lt; N줄(예: 200)인 파일만  
3. **read도 구간제** — 큰 파일 전체 dump 금지; 심볼/에러 줄 근처만  
4. **tool result에 파일 전문 금지** — 성공 시 메타만, 실패 시 주변 20줄 힌트만  
5. **프롬프트:** “Do not rewrite whole files. Prefer search-replace edits.”

**신규 파일일 때**

| 단계 | 동작 |
|------|------|
| 1 | 모델이 `write_file(path, contents)` 호출 — **이때만** 전체 본문 허용 (만들 내용이 곧 파일 전부) |
| 2 | 하네스: 경로가 **아직 없으면** 생성 허용. **이미 있으면** 거절 → `edit_file` 유도 |
| 3 | 적용: `WorkspaceEdit`로 새 문서 만들거나 `fs.writeFile` + `openTextDocument` |
| 4 | tool result: `{ ok, path, created: true, lines }` — **contents 재출력 금지** (context 절약) |
| 5 | 이후 수정: 무조건 `edit_file` (Search–Replace) |

짧은 신규 파일(예: 설정 30줄)은 `write_file` 한 방이 맞고,  
나중에 “파일 키우며 계속 고치기”는 전부 `edit_file`로 전환하면 OpenCode형 폭증을 피한다.

**신규인데 내용이 매우 길 때 (Cursor가 실제로 쓰는 패턴)**

Cursor도 “초장문 신규 = Write 한 방”에만 의존하지 않습니다.  
한 tool call에 수천 줄을 넣으면 **출력 토큰 한도·스트림 끊김·적용 실패**가 자주 납니다 (커뮤니티에서도 대용량 Write/`edit_file` 실패 → **100~200줄 청크**로 나누면 성공하는 사례가 많음).

| 길이 감 | Cursor식 접근 | 이 확장 하네스 |
|---------|---------------|----------------|
| 짧음 (&lt;~150–200줄) | `Write` / `write_file` 1회 | 동일 |
| 김 (수백~수천 줄) | **스캐폴드 → 구간 append** | 강제 권장 |
| 매우 김 / 생성 실패 | 작은 청크로 반복 edit | 동일 + 실패 시 hint |

**권장 시퀀스 (긴 신규)**

```
1) write_file  — 골격만 (imports, 빈 클래스/함수 시그니처, TODO 섹션 마커)
   tool result: { created, lines } 짧게

2) edit_file × N — 섹션 단위로 채움
   예) "// --- section: auth ---" 마커를 old로 잡고 본문 new로 교체
   또는 파일 끝 "\n" / 마지막 마커 뒤에 insert성 replace
   청크당 목표: ~100–200줄 (모델·스트림 안정권)

3) 매 성공 tool result는 메타만 (본문 재출력 금지)
4) 필요 시 마지막에 read_file(구간) 또는 read_lints로 검증
```

**하네스 강제 (선택·권장)**

- `write_file.contents` 줄 수 &gt; `NEW_FILE_MAX_LINES`(예: 200) → **거절**  
  hint: `Create a short scaffold first, then fill with edit_file in ~150-line chunks.`  
- 프롬프트: “For large new files: scaffold + chunked edits. Never dump the entire large file in one write.”

→ Cursor와 같은 UX: **짧은 신규는 한 방, 긴 신규는 뼈대 + 부분 쓰기**로 context·실패율을 동시에 잡음.

→ 이렇게 하면 “부분 수정 API” + “컨텍스트 예산” + **Review UI(확인·그룹화)** 가 한 세트. 구현은 위 스케치 + 심화 스펙 ②·③·⑤ + **B절 Review UI**.

**최소 구현 스케치**

```ts
// 개념만 — 확장 내부 edit_file 핸들러
const doc = await vscode.workspace.openTextDocument(uri);
const full = doc.getText();
const start = full.indexOf(oldString);
if (start < 0 || full.indexOf(oldString, start + 1) >= 0) {
  return { ok: false, error: "SEARCH 0건 또는 2건+ — 다시 read 후 정확한 old_string" };
}
const startPos = doc.positionAt(start);
const endPos = doc.positionAt(start + oldString.length);
const edit = new vscode.WorkspaceEdit();
edit.replace(uri, new vscode.Range(startPos, endPos), newString);
await vscode.workspace.applyEdit(edit);
```

→ 상세 포맷·실패 힌트·staleness는 아래 **심화 스펙 ② edit / apply_patch** 참고.

#### Cursor형 편집 확인 UI — 일부 미리보기 · 파일 그룹화 ✅

Cursor Agent가 파일을 고치면, 사용자가 **전체 파일을 다시 읽지 않아도** 무엇을 바꿨는지 보고 Keep/Undo 할 수 있게 UI가 뜹니다.  
확장으로 **동일한 체감의 80~90%**는 가능 (네이티브 인라인 애니메이션 100% 복제는 포크 영역 — 위 “애매한 것” 참고).

**Cursor가 보여주는 것 (벤치마크)**

| UI 요소 | 하는 일 |
|---------|---------|
| **인라인 Diff (red/green)** | 에디터에서 삭제·추가 줄만 강조. 사용자는 **바뀐 hunk만** 눈으로 확인 |
| **채팅 배너** | `N Files · Review` — 이번 세션(또는 턴) Agent가 손댄 파일 수 |
| **Review 목록 (그룹화)** | 파일 단위로 묶음. 경로 · +/− 줄 수 · (옵션) hunk 개수. 클릭 → 해당 파일 Diff로 점프 |
| **파일별 액션** | Keep(수락) / Undo(되돌리기). hover 시 ✓ ✗ |
| **일괄 액션** | Keep All / Undo All |
| **hunk 단위 (이상적)** | 한 파일 안에서도 hunk별 Accept/Reject (MVP는 파일 단위로 시작 가능) |
| **미리보기 카드** | 채팅 쪽에 **변경 일부(컨텍스트 ±N줄)** 만 표시 — 전문 dump 금지 |

**확장 구현 맵**

| 레이어 | 구현 |
|--------|------|
| **변경 기록** | `edit_file`/`write_file` 적용 직전 `before` 스냅샷(해시·내용) → checkpoint와 공유 |
| **그룹화 모델** | `PendingChange[]` → `Map<path, { hunks[], +lines, -lines, status }>` |
| **채팅 Webview** | 배너 + 파일 리스트. 각 row: `src/foo.ts  +12 −3` · Keep · Undo · Open Diff |
| **Diff 보기** | (A) `vscode.diff` / DiffEditor — before(가상 URI) vs after · (B) Webview에 unified diff **일부**만 렌더 |
| **인라인 강조** | MVP: DiffEditor. 향상: `TextEditorDecorationType` (네이티브급 애니메이션은 어려움) |
| **미리보기 텍스트** | hunk당 old/new **최대 K줄**(예: 40) + `…` truncate. 전체 파일 본문을 채팅에 넣지 않음 |
| **적용 정책** | (권장 MVP) 디스크에 바로 apply + Review로 Keep/Undo · (보수) Keep 전까지 버퍼만 |

**그룹화 UX 스케치 (채팅 패널)**

```text
┌─ Review · 3 files ──────────── Keep All  Undo All ─┐
│ ▸ src/auth/login.ts      +18 −4    [Keep] [Undo] [Diff] │
│ ▸ src/auth/types.ts       +2 −0    [Keep] [Undo] [Diff] │
│ ▸ README.md               +6 −1    [Keep] [Undo] [Diff] │
└─────────────────────────────────────────────────────────┘
  (펼치면 hunk 미리보기)
  @@ login.ts
  -  const token = null
  +  const token = await issueToken(user)
  … (총 18줄 중 8줄만 표시)
```

**데이터 → UI 파이프라인**

```
edit_file 성공
  → PendingStore.add({ path, before, after, hunks })
  → Chat Webview postMessage({ type: "review/upsert", file })
  → (옵션) 에디터 Diff/데코레이션 갱신
사용자 Keep  → overlay 제거, checkpoint에 accepted
사용자 Undo  → before 스냅샷으로 WorkspaceEdit 복구 + Pending 제거
```

**완료 기준 (C2~C4)**

- [ ] 편집 후 채팅에 **파일 그룹** 배너가 뜬다  
- [ ] 파일 row / Diff → **변경 일부**만 보인다 (전문 아님)  
- [ ] Keep / Undo / Keep All / Undo All 동작  
- [ ] 새 세션 시 Pending 목록 클리어 (또는 checkpoint 정책 명시)

→ A급 **멀티파일 Apply / 패치 리뷰 UI** · C2와 동일 축. 승인 단계는 심화 스펙 **⑤ Permission**.

### C. 터미널 · 프로세스

| 도구 | 하는 일 | Cursor | Claude Code | OpenCode | 비고 |
|------|---------|--------|-------------|----------|------|
| `run_terminal_cmd` | 셸 실행 | ✅ | `Bash` / `PowerShell` | `bash` | cwd 유지, 출력 truncate |
| `run_background` | 백그라운드 잡 | (터미널 bg) | Bash bg + Monitor | — | 로그 스트리밍 |
| `await_terminal` / `Monitor` | 출력·이벤트 대기 | — | `Monitor` | — | 서버 기동·테스트 대기 |
| `kill_process` | 잡 중단 | (UI/터미널) | `TaskStop` 등 | — | Stop과 연동 |

### D. 웹 · 브라우저 · 미디어

| 도구 | 하는 일 | Cursor | Claude Code | OpenCode | 비고 |
|------|---------|--------|-------------|----------|------|
| `web_search` | 웹 검색 | ✅ | `WebSearch` | `websearch` | 문서·API 최신화 |
| `web_fetch` | URL 본문 가져오기 | (Web) | `WebFetch` | `webfetch` | HTML→markdown 변환 |
| `browser_*` | 네비·클릭·스크린샷 | ✅ Browser | — | — | Playwright 등 |
| `generate_image` | 이미지 생성 | ✅ | — | — | assets/ 저장 |
| `read_lints` / diagnostics | 린트·타입 에러 | (자주 자동) | LSP에 포함 | lsp | `languages.getDiagnostics` |

### E. 사용자 · 세션 UX

| 도구 | 하는 일 | Cursor | Claude Code | OpenCode | 비고 |
|------|---------|--------|-------------|----------|------|
| `ask_question` | 중간 확인 질문 | Ask questions | `AskUserQuestion` | `question` | 모달/채팅 폼 |
| `todo_write` | 체크리스트 | (UI/플랜) | `TodoWrite` / Task* | `todowrite` | 긴 작업 진행 표시 |
| `fetch_rules` | 규칙 동적 로드 | Fetch Rules | (CLAUDE.md/Skill) | `skill` | 모드·경로별 규칙 |
| `switch_mode` | Plan/Ask 전환 | (UI) | `EnterPlanMode` / `ExitPlanMode` | — | 도구 또는 명령 |

### F. 오케스트레이션 · 확장

| 도구 | 하는 일 | Cursor | Claude Code | OpenCode | 비고 |
|------|---------|--------|-------------|----------|------|
| `task` / `Agent` | 서브에이전트 위임 | Subagents | `Agent` / `Task*` / `Workflow` | `task` | 별도 컨텍스트 |
| `send_message` | 에이전트 간 메시지 | — | `SendMessage` | — | 팀/멀티에이전트 |
| `mcp_*` | MCP 도구·리소스 | MCP | MCP + `List/ReadMcpResource` | MCP | Registry에 합류 |
| `tool_search` | 지연 로드 도구 검색 | — | `ToolSearch` | — | 도구 폭증 시 |
| `skill` | 스킬/프롬프트 패키지 | Rules/Skills | `Skill` | `skill` | 재사용 워크플로 |
| `git_*` (선택) | status/diff/commit | 주로 Shell | 주로 Bash | 주로 bash | 전용 도구로 빼도 됨 |
| `gh_*` / PR (선택) | 이슈·PR | Shell/MCP | Bash/`gh` | bash/MCP | A급 기능과 연결 |
| `worktree` (선택) | 격리 작업 트리 | (best-of-n 등) | `Enter/ExitWorktree` | — | 실험·병렬 시도 |

### G. Debug 모드 전용 (Cursor Debug)

| 도구/동작 | 하는 일 |
|-----------|---------|
| `add_instrumentation` | 가설 검증용 로그 삽입 |
| `collect_runtime_logs` | 로컬 debug 서버에서 로그 수집 |
| `request_reproduce` | 사용자 재현 대기 (ask + 가이드) |
| `remove_instrumentation` | 수정 확정 후 계측 제거 |

→ 구현은 **별도 도구**로 두거나, 일반 `edit` + 확장 내부 Debug 서비스로 묶어도 됩니다.

### 최소 vs 풀세트 (구현 우선순위)

**MVP (C1~C3)**  
`grep`, `glob`/`file_search`, `list_dir`, `read_file`, `edit_file`, `write_file`, `run_terminal_cmd`, `ask_question`

**일상 Agent (C4)**  
+ `delete_file`, `web_search`, `web_fetch`, `todo_write`, permissions, checkpoints, doom loop

**Cursor급 (C5~C7)**  
+ `codebase_search`, `browser_*`, Plan/Debug 도구, 서브에이전트(`task`), MCP, Rules/Skills, lints

**나중 / 선택**  
이미지 생성, worktree, cron/schedule, 멀티에이전트 메시징, ToolSearch

### 설계 원칙 (도구가 많아 보일 때)

1. **전용 도구 > Bash로 다 하기** — 권한·병렬·UI·staleness(읽은 뒤 수정)를 하네스가 통제  
2. **Bash는 만능 탈출구** — git/docker/테스트는 셸, 파일 CRUD는 전용 도구  
3. **스키마는 작게** — 도구 정의가 매 요청 토큰을 먹음; MCP는 deferred/ToolSearch  
4. **모드별 화이트리스트** — Ask=읽기만, Agent=전체, Plan=읽기+계획, Debug=+계측  
5. **이름은 제품 통일** — 내부는 Cursor식(`read_file`)이든 Claude식(`Read`)이든 하나로 고정

---

## Cursor 루프 개발 단계

전체 순서의 **2번**을 아래처럼 쪼갭니다. 한 단계가 안정된 뒤에만 다음으로.

| 단계 | Cursor 대응 | 하는 일 | 완료 기준 |
|------|-------------|---------|-----------|
| **C0** | 채팅 셸 | 사이드바 스트리밍 + 모드 드롭다운 UI | Ask/Agent 전환 UI |
| **C1** | **Ask** | MVP 읽기 도구 병렬, 쓰기 제거 | 코드 설명만, 디스크 변경 0 |
| **C2** | **Agent** 1턴 | edit/write + Diff 승인 + 터미널 1회 | 승인 후 반영 |
| **C3** | **Agent** 멀티턴 | 코어 루프 + maxTurns + Stop + 에러→tool result | 이슈 하나를 도구로 끝냄 |
| **C4** | **주변 인프라** | 승인·checkpoint·doom loop·compaction·훅 | 대량 삭제·무한루프 방지 |
| **C5** | **Plan** | 질문 UI · Mermaid · 계획 md · todo 분기 | 계획 없이 코드 안 씀 |
| **C6** | **Debug** | 가설·계측·재현·로그·최소수정·청소 | 런타임 증거 후 패치 |
| **C7** | 제품급 | Browser/Design, side chat, worktree/best-of-n, `/review`, Memories, MCP | Cursor급 확장 |

### 단계별 주의

- **C1(Ask) 먼저** — Cursor도 탐색은 읽기 전용  
- **C2부터 Diff/승인** — 로컬 LLM 잘못된 패치 방어  
- **C3에 maxTurns + timeout** — 무한 루프 방지  
- **C4가 ‘제품 느낌’의 핵심** — 루프만으로는 Cursor처럼 안 느껴짐  
- 로컬 DeepSeek: tool JSON 깨지면 **재파싱/재시도**를 C3에 넣기  
- **C5/C6은 모드 프롬프트 + 도구 화이트리스트**만 바꿔도 대부분 구현 가능  
- 숫자·포맷·실패 정책은 아래 **심화 스펙 ①~⑦** 참고  

---

## 추천 빌드 순서 (DGX + 로컬 LLM 기준)

1. **OpenAI-Compatible / LiteLLM Provider** (DGX Flash 연결)  
2. **Cursor 루프** — **C0 → C4** (MVP 도구 → 인프라), 그다음 **C5 Plan / C6 Debug**  
3. **Inline Completion** (같은 엔드포인트)  
4. **Selection → Diff Apply** (C2와 공유)  
5. **풀 도구 + 인덱싱 / MCP / 서브에이전트** (C7)

이 순서면 “Ask 데모 → Agent 일상 → Plan/Debug”로 Cursor UX에 맞춰 올라갑니다.

---

## 중급 모델용 하네스 (목표: Flash급이 ‘잘 도는’ 환경)

전제: **최하급(지시 무시·도구 불가)은 제외**.  
대상은 DeepSeek V4 Flash / 소형 instruct / 로컬 7B~30B급처럼 **도구는 되지만 실수·탈선이 잦은** 모델.

원칙: **똑똑함의 상당 부분을 모델이 아니라 하네스에 둔다.**  
프론티어 모델용 “자율에 맡김” 설계를 그대로 쓰면 중급 모델은 거의 망합니다.

### 모델 티어 (라우팅용)

| 티어 | 예 | 하네스 정책 |
|------|-----|-------------|
| **A — 중급 (기본)** | Flash, 로컬 chat/instruct | 도구 축소, 강한 검증, 짧은 턴, Plan 강제 옵션 |
| **B — 강모델** | Pro / Opus / GPT-고사양 | 도구 풀세트, 자율↑, best-of-n 비교용 |
| **C — 완전체 불가** | 순수 base, tool 미지원 | Agent 비활성 → 완성/채팅만 |

기본 일상은 **A**. 어려운 구간만 B로 올리거나 best-of-n.

**B 이상(강모델)** 은 같은 루프·같은 도구·같은 검증을 쓰되, 화이트리스트·maxTurns·턴당 도구 수·Plan 강제만 느슨하게 풀면 됩니다.  
하네스가 받쳐 주는 만큼 A도 돌아가고, B는 **당연히 더 잘** 합니다 — 아키텍처를 두 벌 만들 필요 없음.

### 검증 우선 (제한보다 먼저)

목표는 “못 하게 막기”가 아니라 **추측하기 전에 한 번 더 확인하게** 만드는 것입니다.

```
조사 (read/grep)     ← 추측 금지 구간
  → 짧은 가설/계획     ← “고칠 곳이 여기인가?”
  → (애매하면) ask_question
  → 수정 (edit)
  → 검증 (lint/test/재read)  ← “고친 게 맞나?”
  → 아니면 되돌아가서 조사
```

| 단계 | 하네스가 강제하는 것 | 모델에게 맡기는 것 |
|------|----------------------|-------------------|
| 조사 | edit 전 해당 파일 read 없으면 패치 거절 | 어디를 볼지 |
| 생각 | Plan 모드·todo·“다음 한 줄 계획” 필드 | 원인 가설 |
| 확인 | 매칭 실패·모호하면 ask / 거절 | 확실할 때만 진행 |
| 검증 | edit 후 자동 lint·(옵션) test | 실패 로그 해석·재수정 |

**하드 제한**(도구 수·allowlist·Diff 승인)은 위 확인을 **건너뛸 때**의 안전망입니다.  
순서: **검증 루프 먼저 → 그래도 뚫리면 제한**.

프롬프트에 넣을 한 줄 예:

> 파일을 바꾸기 전에 해당 구간을 읽어라. 확신이 없으면 ask_question으로 물어라.  
> 수정 후에는 무엇이 맞는지 lint/테스트로 확인해라. 추측으로 쓰지 마라.

### Cursor가 실제로 하는 방식 (그대로 벤치마크)

Cursor Agent도 “한 방에 고침”보다 **찾을 때까지 조사하고, 맞다 싶은 지점에서 고칩니다.**

```
증상/요청
  → 관련 코드·로그·스택 탐색 (grep/read 반복)
  → “여기가 원인이다”는 증거가 쌓일 때까지 계속
  → (확신이 서면) 최소 수정
  → 다시 확인 (실행·lint·재현)
  → 아니면 탐색으로 복귀
```

| Cursor 모드 | 같은 철학 |
|-------------|-----------|
| **Agent** | 읽기·검색을 여러 턴 → 원인 특정 후 edit · 터미널로 검증 |
| **Debug** | 가설 → 계측 → 재현 → **치명/확정 원인** 나올 때까지 → 최소 패치 |
| **Plan** | 코드 건드리기 전에 “맞는지” 질문·계획으로 합의 |

확장이 흉내 낼 문장도 Cursor톤으로:

- 조사 중: “관련 호출부를 더 보고 원인을 좁히겠다”  
- 확신 시: “여기가 원인으로 보인다 → 수정한다”  
- 검증 시: “같은 경로로 확인해 보겠다”  
- 미확정: 추측 패치 금지, 탐색 또는 `ask_question`

**치명적 문제를 찾을 때까지** = 조기 편집 금지 + 증거 임계값(스택 일치, 재현 로그, failing 심볼)을 하네스가 요구하는 것.  
Debug 모드가 그 극단형이고, 일반 Agent는 같은 루프를 짧게 도는 버전입니다.

### 설계 슬로건

1. **탐색은 코드, 판단은 모델** — grep/find/read 병렬은 확장이 하고, 모델엔 요약만  
2. **한 턴 한 일** — “고치고 테스트하고 커밋”을 한 프롬프트에 넣지 말 것  
3. **실패를 값으로** — 틀린 패치·깨진 JSON은 예외가 아니라 tool result  
4. **스키마를 좁게** — 도구 8개 > 도구 40개 (중급에선)  
5. **검증 루프** — edit 후 자동 `read_lints` / 테스트, 통과할 때까지 짧게 재시도  

### A티어 도구 화이트리스트 (권장)

| 허용 | 이유 |
|------|------|
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

### 프롬프트 · 턴 구조 (중급용)

```
[시스템]
- 너는 도구만으로 일한다. 추측으로 파일 내용을 쓰지 마라.
- 한 번에 도구는 최대 N개 (예: 4). 읽기 위주.
- 수정 전 반드시 해당 구간을 read 한다.
- 수정 후 한 문장으로 무엇을 바꿨는지 말하고 멈춰도 된다.

[사용자 목표] 짧게
[하네스 주입] 열린 파일 경로, 최근 에러 10줄, todo 상태
```

**강제 Plan (옵션):** 복잡도 휴리스틱(파일≥3, “리팩터”, “마이그레이션”)이면 Agent 진입 전 Plan 모드로 보냄.

### 하네스가 대신 하는 일 (모델 부담↓)

| 작업 | 모델 | 하네스 |
|------|------|--------|
| 키워드로 파일 찾기 | 쿼리만 | `grep`/`glob` 실행·상위 K개만 반환 |
| 큰 파일 읽기 | offset 지정 | 기본 200~300줄 캡, 중요 심볼로 점프 |
| 패치 적용 | SEARCH/REPLACE | 유일 매칭 검증, 실패 시 힌트 첨부 |
| 품질 확인 | “테스트 해줘” 한 마디 | allowlist로 test 실행 → 실패 로그 truncate 후 재투입 |
| 병렬 탐색 | (안 해도 됨) | 확장이 관련 파일 3~5개 prefetch |
| 도구 JSON | 대충 출력해도 | Parser + 1회 수리 재요청 |
| 긴 대화 | 기억에 의존 | Compaction + Memories는 짧고 명시적만 |

### Prefetch 패턴 (체감 크게 올림)

사용자 메시지에서 경로·심볼·에러 스택을 정규식으로 뽑고, **모델 호출 전에**:

```
1) 스택의 파일 read (해당 줄 ±N)
2) 심볼명 grep
3) 결과를 “이미 조사된 컨텍스트” 블록으로 시스템 옆에 첨부
4) 그다음 모델 호출 (도구는 추가 조사·수정용)
```

중급 모델이 “어디를 볼지” 헤매는 턴을 줄입니다.

### 검증 마이크로루프 (edit 직후)

```
edit_file 성공
  → (자동) read_lints on touched files
  → 에러 있으면 tool result로 주입 (모델 재호출, max +2턴)
  → (옵션) 허용된 test 명령 1개
  → 통과 또는 ask_question
```

프론티어는 “알아서 테스트”에 맡기고, **중급은 하네스가 테스트를 끼워 넣음**.

### 출력·컨텍스트 규칙 (A티어 숫자 예)

| 항목 | 값 |
|------|-----|
| 활성 도구 수 | ≤ 8~12 |
| 턴당 tool_calls | ≤ 4 |
| read 기본 줄 수 | ≤ 250 |
| tool result 상한 | ≤ 8k tokens |
| maxTurns | 15 (강모델 25+) |
| temperature | 0~0.3 (도구 턴) |
| 패치 방식 | Search–Replace only |
| 실패 재시도 | JSON 1 + patch 2 + lint-fix 2 |

### 라우팅 휴리스틱 (Flash ↔ Pro)

| 신호 | 동작 |
|------|------|
| Plan 승인된 대형 작업 | 실행만 Pro, 탐색은 Flash |
| lint/test 2회 연속 실패 | 다음 턴 Pro 또는 best-of-n |
| 단순 “이 함수 설명해” | Flash |
| 보안/동시성/프로토콜 | Pro |
| tool JSON 파싱 3회 실패 | 세션 중단 + 모델 변경 제안 |

### UX: 중급 모델이 ‘잘 도는 것처럼’ 보이게

- todo를 **하네스가 단계로 쪼개** 보여 줌 (모델이 안 쪼개도)  
- Diff 승인을 기본 on (틀린 패치가 디스크에 덜 감)  
- “모델이 막힘” 시 **Prefetch 다시 / 도구 축소 / Pro로 재실행** 버튼  
- 로그에 `tier=A`, `tools=8`, `prefetch=3` 표시 → 디버깅 쉬움  

### 하지 말 것 (중급에서 독)

- 도구 카탈로그 풀세트 + MCP 20개를 한 번에  
- “알아서 레포 전체 리팩터” 한 방 프롬프트  
- unified diff + 라인번호 의존  
- 읽지 않은 파일에 대한 자신만만한 패치 허용  
- 긴 agent 이력 전부를 매 턴 투입 (압축 없이)

### 완료 기준 (A티어 수용 테스트)

1. 단일 파일 버그픽스: prefetch + edit + lint 자동 → 사람 Diff 승인 1회  
2. “테스트 실패 고쳐줘”: 실패 로그 → 수정 → 같은 테스트 재실행까지 루프  
3. Ask 모드: 쓰기 0, 인용 코드가 실제 파일과 일치  
4. 고의로 깨진 tool JSON 10건 중 ≥8건 복구 또는 안전 에러  

→ 이 네 개가 되면 **지능이 낮은(중급) 모델용 환경**의 MVP입니다.

심화 구현은 아래 **①~⑦**과 맞물립니다. A티어는 특히 **① 파서 · ② Search–Replace · ③ 짧은 예산 · ⑤ 승인**을 먼저 굳히세요.

---

## 심화 스펙 (지금 디테일 팔 것)

구현 전에 **숫자·포맷·실패 정책**을 고정하세요.  
우선순위: `① Provider/tool JSON → ② 패치 → ③ 컨텍스트 예산 → ④ 터미널 → ⑤ 승인`  
(+ 제품감) `⑥ Checkpoint → ⑦ Compaction`

---

### ① Provider 어댑터 + tool JSON (로컬 LLM 최우선)

**목표:** 모델/프록시가 달라도 루프는 하나의 `ToolCall[]`만 본다.

| 계층 | 책임 |
|------|------|
| `ProviderAdapter` | HTTP/SSE, auth, model id, stream 이벤트 정규화 |
| `ToolCallParser` | native tool_calls / XML / JSON fence → 내부 스키마 |
| `ToolResultFormatter` | 내부 결과 → 프로바이더가 기대하는 tool message 형식 |

**내부 정규 스키마 (예)**

```ts
type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>; // 이미 JSON.parse 된 객체
  raw?: string;                       // 파싱 실패 시 원문 보관
};
```

**로컬 DeepSeek / 약한 tool 모델 대응**

| 증상 | 대응 |
|------|------|
| `arguments`가 문자열 이중 인코딩 | `JSON.parse` 재시도 1~2회 |
| JSON 잘림 / trailing comma | jsonrepair 또는 fence 추출 후 재파싱 |
| 도구 이름 오타 | Registry fuzzy match (거리 1) 또는 “unknown tool” result로 반환 |
| tool_calls 없이 본문에 `` ```json `` | 본문 스캔 → tool call로 승격 (fallback) |
| 빈 arguments | 스키마 required 검사 → 모델에 validation error result |

**재시도 정책 (권장)**

```
parse 실패
  → (1) 같은 응답에서 복구 시도
  → (2) “Fix JSON only” 짧은 재요청 1회 (temperature 0)
  → (3) tool result로 에러 전달 후 루프 계속
  → 연속 3회 파싱 실패 → Stop + 사용자에게 알림
```

**완료 기준:** Flash에서 `read_file` + `grep`를 10회 연속 안정 호출.

---

### ② edit / apply_patch 포맷

**권장 기본: Search–Replace (Apply Patch)**  
로컬 모델이 unified diff hunk 라인번호를 자주 틀림.

```text
*** Begin Patch
*** Update File: src/foo.ts
oldExactLines
*** End Patch
```

| 방식 | 장점 | 단점 | 언제 |
|------|------|------|------|
| **Search–Replace** | 매칭 확실, 구현 쉬움 | 큰 블록은 토큰↑ | **기본** |
| **Unified diff** | 익숙, 멀티 hunk | 라인번호/컨텍스트 깨짐 | 강모델 + 검증기 |
| **Whole file write** | 단순 | **context 폭증**·대형 실수 | 새 파일 / &lt;200줄 **만**. 기존 대형 파일은 하네스 거절 |
| **reapply** | 실패 복구 | 비용 | SEARCH 실패 시 1회 |

**OpenCode 대비 한 줄:** 모델이 전체 파일을 tool args로 쓰지 못하게 막고, Cursor식 Search–Replace만 열어 두면 세션 context가 훨씬 덜 불어난다.

**적용 파이프라인**

```
patch parse
  → 파일 존재·인코딩 확인
  → SEARCH 유일 매칭? (0건/2건+ → 거절)
  → (옵션) 마지막 read 이후 mtime/해시 변경? → staleness 에러
  → Diff UI / 승인
  → WorkspaceEdit 적용
  → checkpoint 기록
  → tool result: { ok, path, linesChanged } 또는 { error, hint }
```

**실패 시 tool result에 넣을 것:** 매칭 실패 구간, 주변 20줄 힌트, “다시 read 하라”.  
**금지:** 모호 매칭을 추측 적용.

**완료 기준:** 의도적 틀린 SEARCH 10건이 전부 안전 거절 + 모델이 재시도로 성공.

---

### ③ 컨텍스트 조립 예산

매 턴 `messages`를 새로 조립한다고 가정. **토큰 예산표**를 설정으로 둔다.

| 슬롯 | 비율(예: 128k 창) | 내용 |
|------|-------------------|------|
| System + 모드 프롬프트 | ~5% | Agent/Ask/Plan/Debug |
| Rules | ~5% | 유저/프로젝트/팀, 경로 매칭된 것만 |
| Tool schemas | ~8% | 모드 화이트리스트만 (MCP는 deferred) |
| Sticky context | ~12% | 열린 파일 요약, @멘션, 선택 영역 |
| 대화 + tool results | ~60% | 최근 턴 우선 |
| 응답 여유 (completion) | ~10% | max_output_tokens |

**조립 순서 (중요도 높은 것 유지)**

1. System + 모드  
2. 활성 Rules  
3. Tool schemas (현재 모드)  
4. 사용자 최신 메시지  
5. 최근 tool results (뒤에서부터)  
6. 오래된 대화는 **요약 블록 1개**로 대체  

**하드 규칙**

- 단일 tool result 상한: 예) **32KB** 또는 **8k tokens** → truncate + `…(truncated, path=…)`  
- `read_file` 기본: 전체 금지에 가깝게, **offset+limit** (예: 250줄)  
- 이미지: vision 모델만, 해상도/장수 캡  
- 모드 전환 시 sticky context 초기화 (Cursor식)

**완료 기준:** 50턴 세션에서 창 overflow 없이, 중요 @파일은 항상 남음.

---

### ④ 터미널 실행 모델

**권장:** 확장 소유 **세션별 셸** 1개 (cwd·env 유지) + 필요 시 백그라운드 잡.

| 항목 | 스펙 |
|------|------|
| API | `child_process` / PTY (`node-pty`) 또는 VS Code Terminal + 출력 캡처 |
| cwd | 워크스페이스 루트 기본, `cd` 반영 유지 |
| env | 프로세스 env + 확장 주입 (시크릿은 SecretStorage) |
| timeout | 기본 **30s**, 빌드/테스트는 도구 인자로 상향 (캡 10m) |
| 출력 | stdout+stderr 병합, **끝 32KB** 또는 head+tail 보존 |
| exit code | tool result에 필수 포함 |
| 백그라운드 | `is_background: true` → pid/jobId 반환, 별도 `await`/`Monitor` |
| 취소 | AbortSignal → SIGTERM → 대기 → SIGKILL |
| 차단 명령 | `rm -rf /`, disk wipe, `curl \| sh` 등 deny 패턴 |

**Ask 모드:** 터미널 도구 자체 제거.  
**Agent:** allowlist(예: `git`, `npm`, `pytest`)는 auto, 그 외 승인.

**완료 기준:** `npm test` 실패 출력이 모델에 들어가 다음 턴에 수정까지 이어짐.

---

### ⑤ Permission / Auto-run

**레벨 (Cursor식 단계)**

| 레벨 | 쓰기 | 터미널 | 네트워크 |
|------|------|--------|----------|
| `ask` | 매번 Diff 승인 | 매번 | 매번 |
| `accept_edits` | 자동 (delete는 ask) | allowlist만 자동 | ask |
| `auto` | 자동 | allowlist+정책 | 허용 도메인 |
| `bypass` | 전부 자동 | 전부 (위험) | 전부 |

**게이트 의사코드**

```
if tool.readonly → allow
if mode == Ask && tool.writes → deny
if path matches denyGlobs → deny
if tool.exec && !allowlist.match(cmd) → prompt
if tool.destructive (delete, chmod) → prompt
else → allow per level
```

**UX**

- 승인 UI: 명령/경로/Diff 미리보기 + Allow once / Always for session / Reject  
- Reject → tool result `permission denied` (루프 유지, 모델이 우회 설명)  
- 세션 Always는 메모리, 영구 Always는 설정

**완료 기준:** `rm`·워크스페이스 밖 쓰기·미허용 curl이 기본에 막힘.

---

### ⑥ Checkpoint (롤백) — C4

Git과 **분리**. Agent가 망가뜨린 작업 트리만 되돌림.

| 항목 | 스펙 |
|------|------|
| 생성 시점 | 첫 write 전, N파일 이상 변경 전, 사용자 요청 시 |
| 저장 | 변경 파일의 before 스냅샷 (내용 해시) — 로컬 확장 storage |
| UI | 채팅 타임라인에 체크포인트 노드 → Restore |
| Restore | 스냅샷 파일만 복구 (untracked 삭제 정책은 명시) |
| 한계 | “Agent 변경 되돌리기” 전용. 영구 이력은 Git |

---

### ⑦ Context Compaction — C4

창이 예산 초과 직전/직후에 실행.

| 단계 | 동작 | 비용 |
|------|------|------|
| 1. Truncate | 오래된 tool result 본문 절단 | 무료 |
| 2. Drop | 중복 read/grep 결과 제거 | 무료 |
| 3. Micro-summary | 구간을 짧은 bullet로 치환 (소형 모델/규칙) | 저 |
| 4. Full compact | 대화 요약 1블록 생성 후 히스토리 교체 | 고 (최후) |

**보호 구간:** 시스템, Rules, 최근 K턴(예: 6), 현재 사용자 목표 문장.  
**완료 기준:** compact 후에도 “지금 고치는 파일/에러”를 모델이 기억.

---

### 심화 스펙 ↔ 개발 단계 매핑

| 스펙 | 넣는 단계 |
|------|-----------|
| ① Provider / tool JSON | C0~C1 (연결 직후) |
| ② 패치 포맷 | C2 |
| ③ 컨텍스트 예산 | C3 (멀티턴 시작 전) |
| ④ 터미널 | C2~C3 |
| ⑤ Permission | C4 (C2에 최소 Diff 승인) |
| ⑥ Checkpoint | C4 |
| ⑦ Compaction | C4 (긴 세션 전) |

---

## 설정 (Settings Hub) — Cursor형 제품 노브

지금까지 문서에 **시크릿 금고·Permission “영구 Always”**만 흩어져 있고, Cursor처럼 **한곳에서 만지는 설정 체계**가 빠져 있었다.  
확장은 VS Code `Settings` + (체감용) **설정 Webview** 이중 진입으로 구현한다.

### 왜 필요한가

- BYOLLM·Permission·메시지 큐·중급 하네스 숫자가 **하드코딩이면 제품이 안 됨**
- Cursor 사용자가 기대하는 것: Models / Rules / Auto-run / Features / Privacy 비슷한 **카테고리**
- 팀: 스키마·allowlist는 공유, **시크릿 값은 각자** (금고와 분리)

### 진입점

| 진입 | 역할 |
|------|------|
| 명령 `Open Agent-K Settings` | 설정 Webview (카테고리 탭) |
| VS Code Settings UI (`agent-k.*`) | 검색·키바인딩·원격/워크스페이스 계층 |
| 채팅 헤더 ⚙ / 상태바 | 자주 쓰는 노브 바로가기 (모델, Permission 레벨) |
| SecretStorage | API 키만 — **settings.json 평문 금지** |

계층: **User > Workspace > Folder** (VS Code 표준). 시크릿은 계층 밖(키체인).

### 카테고리 맵 (구현 목표)

| 탭 | 넣는 것 | 이 문서 연결 |
|----|---------|--------------|
| **Models / Providers** | Base URL, 모델 ID, 기본 Tier A/B, 라우터 Cost/Balance/Intelligence, 연결 테스트 | S급 BYOLLM · B급 라우터 · ① Provider |
| **Secrets** | API 키 입력·회전·삭제 (값 미표시) | A급 시크릿 금고 |
| **Rules** | User/Project rules 경로, 활성 규칙 미리보기 | Infra Instructions/Rules · Memories 예산 |
| **Agent / Modes** | 기본 모드, 모드 전환 시 컨텍스트 리셋 on/off, maxTurns, timeout | 코어 루프 · C0~C6 |
| **Permission / Auto-run** | `ask` / `accept_edits` / `auto` / `bypass` · 터미널 allowlist · deny globs · “영구 Always” | ⑤ Permission |
| **Message Queue** | Enter=`Interrupt & Resynthesize`(기본) · Queue-only 단축키 · Stop 시 큐 폐기/유지 · debounce | 루프 #8 · PRD-17 |
| **Review / Checkpoint** | apply 즉시 vs Keep 전 버퍼 · Checkpoint 자동 생성 조건 | Review UI · ⑥ |
| **Harness (중급)** | Tier A 화이트리스트 · optional `codebase_search` · prefetch on · lint-fix +2 · temperature | 중급 하네스 |
| **Context / Index** | 토큰 예산 비율 · read 기본 줄수 · 인덱싱 on · ignore | ③ · 인덱싱 |
| **Tools / MCP** | 모드별 도구 on/off · MCP 서버 목록 · deferred | 도구 카탈로그 · MCP |
| **Terminal** | 기본 timeout · cwd · deny 패턴 | ④ |
| **Privacy / Telemetry** | 텔레메트리 on/off · 로그에 시크릿 마스킹 | 관측 |
| **Features** | Inline completion · Side chat · Browser · Skills 핀 · 도메인 패널(B급) 토글 | C4~C7 · B급 |

### 권장 기본값 (중급·로컬 우선)

| 키 (예) | 기본 | 이유 |
|---------|------|------|
| `agent-k.modelTier` | `A` | Flash 일상 |
| `agent-k.permission.level` | `accept_edits` | Diff는 보이되 속도 | 
| `agent-k.queue.onEnterWhileRunning` | `resynthesize` | Cursor형 |
| `agent-k.queue.onStop` | `keep` | 실수 Stop 대비 (`discard` 옵션) |
| `agent-k.harness.verificationMicroLoop` | `true` | edit 후 lint |
| `agent-k.harness.aTierOptionalSearch` | `false` | 스키마 좁게 |
| `agent-k.context.readMaxLines` | `250` | ③ |
| `agent-k.maxTurns.A` | `15` | 하네스 표 |

### UX 스케치

```
┌─ Agent-K Settings ─────────────────────────────────────────┐
│ Models  Permission  Queue  Harness  Context  MCP  Privacy  │
├────────────────────────────────────────────────────────────┤
│ Message Queue                                              │
│  ○ Interrupt & Resynthesize on Enter (Cursor)   ← default  │
│  ○ Queue only on Enter (legacy soft queue)                 │
│  Queue-only shortcut: Alt+Enter                            │
│  On Stop: (●) Keep queue  ( ) Discard queue                │
│  Debounce resynthesize: 300ms                              │
└────────────────────────────────────────────────────────────┘
```

### 완료 기준

- [ ] 설정 Webview + `agent-k.*` Settings 검색으로 **동일 값**이 보임  
- [ ] API 키는 SecretStorage만 · settings JSON에 키 없음  
- [ ] Permission 영구 Always가 설정에 남고 세션 Always는 메모리만  
- [ ] Queue Enter 동작을 설정에서 Cursor형/큐형으로 전환 가능  
- [ ] Workspace 설정으로 팀 allowlist·deny glob 공유 가능 (시크릿 제외)

### 넣는 단계

| 단계 | 설정 |
|------|------|
| **C0** | Models/Providers + Secrets + Open Settings 명령 |
| **C2** | Permission 최소 (Diff 승인 레벨) |
| **C3~C4** | Queue · maxTurns · Checkpoint · Harness 토글 |
| **C4+** | Context 예산 · Index · MCP |
| **C7** | Features 토글 (Browser/Side/Skills/…) |

→ PRD: `PRD-21` (금고) + **`PRD-29_Settings_Hub`** + Infra-17 configuration 스키마.

---

## 최소 기술 스택 메모

- TypeScript + VS Code Extension API  
- 채팅: `vscode.chat` / Chat Participant  
- 모델: `vscode.lm` Language Model Provider **또는** 확장 내부 HTTP 클라이언트  
- 편집: `WorkspaceEdit` (`replace`/`insert`/`delete`), `TextEditor.edit` — **부분 수정이 1급 시민**, 전체 rewrite는 예외  
- 터미널: `vscode.window.createTerminal` / shellExecution  
- UI: Webview View (사이드바)

공식 입구: [VS Code AI Extension Guides](https://code.visualstudio.com/api/extension-guides/ai/language-model)

---

## 다음 TODO (여기서부터 이어서)

문서 설계는 여기까지. **다음 작업은 구현**입니다.

- [ ] **확장 스캐폴드** — VS Code/Cursor용 TypeScript 확장 프로젝트 생성 (`package.json`, 사이드바 Webview, 명령 등록)
- [ ] **C0** — 채팅 UI + 스트리밍 표시 + Ask/Agent 모드 드롭다운 + **루프 상태줄**(Thinking / Planning next moves)
- [ ] **설정 허브 (C0 뼈대)** — Models/Providers + Secrets + `Open Settings` · `agent-k.*` configuration
- [ ] **Provider** — OpenAI-Compatible / LiteLLM 클라이언트 (DGX Flash 엔드포인트, API key는 SecretStorage)
- [ ] **① Tool JSON 파서** — native + fallback fence, 파싱 실패 시 재시도 1회
- [ ] **C1 Ask** — `grep` / `glob` / `list_dir` / `read_file`만, 쓰기 도구 제거, 병렬 실행 + **Search/Read 접이식 그룹**
- [ ] **Prefetch** — 사용자 메시지·스택에서 경로/심볼 추출 → 모델 호출 전 조사 블록 주입
- [ ] **C2 Agent 1턴** — Search–Replace `edit_file` + **Review UI**(파일 그룹·hunk 일부 미리보기·Keep/Undo) + **Edit 타임라인 그룹** + (선택) allowlist 터미널
- [ ] **검증 마이크로루프** — edit 후 자동 `read_lints` (± 테스트 1회) → 실패 시 재투입
- [ ] **수용 테스트 4개** — 단건 픽스 / 테스트 루프 / Ask 정확 / JSON 복구 (중급 하네스 완료 기준)
- [ ] **이어서 (나중에)** — C3 멀티턴(**Planning next moves**·전체 타임라인) → C4 승인·checkpoint·doom loop → C5 Plan → C6 Debug → C7 풀세트

**다음에 열 때:** 위 체크리스트 첫 항목(스캐폴드)부터. 설계 문서: 이 파일 전체 + 특히 **중급 모델용 하네스** · **심화 스펙 ①~②**.

