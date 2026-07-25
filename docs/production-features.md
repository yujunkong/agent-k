# Production Grade Features — C7 가이드

## 개요

C7은 Agent-K를 Cursor급 확장으로 업그레이드합니다.

## 주요 기능

### 🌐 Browser & Design Mode (T01-T06)
- **BrowserTools**: Playwright 기반 navigate/click/scroll/wait/screenshot/evaluate
- **BrowserSession**: 최대 3개 세션, LRU eviction, 쿠키/스토리지 유지
- **Design Mode**: 스크린샷 오버레이 + 요소 선택 → 주석/좌표 → 컨텍스트 주입
- **BrowserPreview**: Webview 내 iframe/스크린샷 미리보기

### 🔀 Worktree & Best-of-N (T07-T10)
- **WorktreeManager**: git worktree 생성/삭제/리스트
- **Best-of-N**: N개 worktree 병렬 Agent 실행 → 비교 UI → 승자 채택
- **ComparisonUI**: Diff 요약 + 테스트 결과 + 토큰/비용 카드
- **AdoptWinner**: 승자 worktree → 메인 merge/apply

### 🔍 Agent Review Loop (T11-T13)
- **AgentReviewLoop**: git diff 수집 → 정적 힌트 + LM 리뷰 프롬프트
- **FindingList**: 파일·줄·심각도·제안 + Accept Fix / Dismiss
- **AcceptFix**: Finding 선택 수정 마이크로 Agent 실행

### 🧠 Memories 고도화 (T14)
- SecretStorage 영구 저장
- UI 편집 + 자동 주입
- 슬롯 기반 예산 관리 (기본 50슬롯, LRU eviction)

### 🔎 Chat Search & Artifacts (T15-T16)
- **ChatSearchIndex**: 로컬 인덱스 (대화/아티팩트/diff) → JSON 파일 기반
- **ArtifactStore**: 스크린샷/데모/diff 카드 저장 + 갤러리

### 🔌 MCP (T17-T18)
- **MCPClient**: MCP SDK 브리지, 이름 충돌 prefix, Zod 스키마 생성
- **DeferredMCPTools**: ToolSearch로 지연 로드, 스키마 폭증 방지

### 📋 Skills (T19-T20, PRD-28)
- **SkillRegistry**: skills/*.md 로드/리로드, 핀/언핀, 시크릿 스캔
- **SkillTool**: skill_list/skill_load/skill_pin/skill_unpin

### 🔄 서브에이전트 (T21-T22)
- **TaskTool**: 병렬 서브에이전트 위임 (search/general/debug 타입)
- **SubAgentResult**: 요약만 부모에 반환, 컨텍스트 오염 방지

### ⚡ 기타 (T23-T46)

| 기능 | 설명 | 우선순위 |
|------|------|----------|
| **GitHub Agent** | gh CLI 기반 PR/이슈 관리 | P1 |
| **Commit Message Generator** | SCM API + LM | P1 |
| **Test Generation Loop** | 실패 테스트 → 생성 → 실행 → 수정 | P1 |
| **Secrets Vault** | SecretStorage + 환경별 프로파일 | P1 |
| **Inline Completion** | InlineCompletionItemProvider | P1 |
| **Selection Diff Apply** | Ctrl+K 대체 | P1 |
| **Parallel Search** | findFiles + Promise.all + p-limit | P0 |
| **Codebase Indexer** | 청크/임베딩/검색 | P1 |
| **Semantic Search** | 임베딩 or ripgrep fallback | P1 |
| **DGX Provider** | vLLM/TRT-LLM 원클릭 | P1 |
| **Model Router** | A/B/C 티어 라우팅 | P1 |
| **Settings Hub** | Permission/Harness/Context/MCP/Features | P1 |

## E2E 테스트

| ID | 시나리오 |
|----|----------|
| C7-T38 | Browser + Design Mode → UI 버그 재현 → 수정 → 재캡처 |
| C7-T39 | Worktree/BoN 3개 병렬 → 비교 UI → 채택 → merge |
| C7-T40 | /review → Finding → Accept Fix → edit_file → 재검증 |
| C7-T41 | Memories 영구 저장 → 재시작 후 자동 주입 |
| C7-T42 | MCP 도구 등록 → 호출 → 결과 반환 |
| C7-T43 | Skills 핀 → 주입 → Agent 동작 변경 |

## 성능 벤치마크

| 측정 항목 | 목표 |
|-----------|------|
| Browser 세션 시작 | < 3s |
| 스크린샷 캡처 | < 500ms |
| 파일 검색 10개 패턴 | < 100ms |
| Codebase Indexing 100파일 | < 1s |
