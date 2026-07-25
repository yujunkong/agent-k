#!/usr/bin/env python3
"""Enrich C5–HARB thin TODO stubs from phase PRDs (2026-07-25)."""
# Comment: kickoff gate — replace MASTER placeholder AC with PRD-grounded criteria.

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TASKS = ROOT / "TODO_TASKS" / "tasks"

E: dict[str, dict] = {}


def e(tid: str, **kwargs) -> None:
    E[tid] = kwargs


# ----- C5 -----
e(
    "C5-T01",
    description=(
        "PRD-C5 Plan 모드 컨트롤러. 플로우: 탐색(읽기만) → ask_question → 계획 MD+Mermaid → "
        "사용자 편집/승인 → switch_mode('agent')+컨텍스트 주입. ModeRegistry PLAN whitelist: "
        "grep/glob/list/read/codebase_search/lsp_*/ask_question/todo_write/switch_mode만. "
        "edit/write/delete/run_terminal/browser_* 즉시 deny. 시스템 프롬프트: 시니어 아키텍트, 쓰기 금지."
    ),
    acceptanceCriteria=[
        "PLAN 모드 진입 시 쓰기/터미널/browser 도구 스키마 미노출 또는 호출 즉시 deny",
        "5단계 플로우 오케스트레이션 API 존재",
        "승인 전 소스 디스크 쓰기 0 (플랜 md 저장 제외)",
        "승인 시 Agent 전환 훅 호출",
    ],
    prdRefs=["PRD-C5_Plan_Mode.md"],
    tags=["plan-mode", "controller", "whitelist", "prd-c5"],
)
e(
    "C5-T02",
    title="Clarifying Questions: 객관식 UI (ask_question 도구)",
    description=(
        "PRD-C5 §2.4: ask_question으로 단일/다중/자유텍스트. UI=모달+옵션+'기타'. "
        "필수 미답 시 계획 저장 불가. 답변 → ## Questions. 구명칭 AskUserQuestion 금지."
    ),
    files=["src/plan/ClarifyingQuestions.tsx", "src/tools/session/AskQuestionTool.ts"],
    acceptanceCriteria=[
        "single/multiple/text 타입 지원",
        "필수 미답 시 저장/다음 단계 차단",
        "답변이 Plan ## Questions에 기록",
        "취소 시 Plan 플로우 cancelled",
    ],
    prdRefs=["PRD-C5_Plan_Mode.md"],
    tags=["ask_question", "plan-ui", "prd-c5"],
)
e(
    "C5-T03",
    description=(
        "Plan Research: Ask ParallelExecutor로 읽기/검색만. 쓰기 환상 호출 시 deny·디스크 unchanged."
    ),
    acceptanceCriteria=[
        "읽기 도구만 실행",
        "edit_file 호출 시 deny + 디스크 unchanged",
        "탐색 요약이 PlanGenerator 입력으로 전달",
    ],
    prdRefs=["PRD-C5_Plan_Mode.md"],
    dependencies=["C5-T01", "C1-T13"],
)
e(
    "C5-T04",
    description=(
        "계획 문서: Context/Questions/Mermaid/TODOs/Risks/Approval. "
        "경로 `.agentk/plans/PLAN-<slug>.md` (PRD-C5 §2.3)."
    ),
    acceptanceCriteria=[
        "스키마 6섹션 생성",
        "유효한 Mermaid 블록",
        "TODO 체크리스트 ≥1",
        "slug 파일명 안전문자",
    ],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T05",
    description="Plan Webview: MD 편집 + mermaid.js 실시간 프리뷰. Cancel→draft 저장.",
    acceptanceCriteria=["MD 편집 반영", "Mermaid 실시간 렌더", "Cancel 시 draft 유지"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T06",
    description="리뷰 UI: md 편집/스텝 삭제/[Approve & Execute]. 승인 전 소스 쓰기 0.",
    acceptanceCriteria=[
        "Approve & Execute 버튼",
        "스텝 삭제 가능",
        "승인 전 소스 파일 변경 0",
        "필수 질문 미답 시 승인 불가",
    ],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T07",
    description="승인 시 switch_mode('agent') + Q&A/Mermaid/TODO 컨텍스트 주입. 쓰기 도구 on.",
    acceptanceCriteria=["모드 agent 전환", "plan 컨텍스트 주입", "edit_file 스키마 노출"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T08",
    description="TODO 우클릭 → Branch to new Agent. 해당 TODO만 새 세션.",
    acceptanceCriteria=["분기 세션 생성", "TODO+plan 요약만 주입", "부모와 병렬 가능"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T09",
    title="계획 문서 저장: `.agentk/plans/` (설정 오버라이드 가능)",
    description="기본 `.agentk/plans/`. 구경로 `.agent-k/plans` 금지.",
    files=["src/plan/PlanStorage.ts"],
    acceptanceCriteria=["기본 `.agentk/plans/PLAN-*.md`", "설정 오버라이드", "로드/리스트 API"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T10",
    description="파일≥3 또는 리팩터/마이그레이션 키워드 → Plan 강제 제안.",
    acceptanceCriteria=["임계 설정 가능", "제안 UI", "무시 가능"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T11",
    description="실패 시 revert → 계획 다듬기 → 재승인.",
    acceptanceCriteria=["Plan Review 복귀", "체크포인트 정합", "재승인 후 재실행"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
    dependencies=["C5-T07", "C4-T03"],
)
e(
    "C5-T12",
    description="PlanGenerator 단위: Mermaid/Todo 파싱.",
    acceptanceCriteria=["섹션 파싱", "잘못된 Mermaid 감지"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T13",
    description="ComplexityHeuristic 단위: 임계/키워드.",
    acceptanceCriteria=["경계값 테스트", "한/영 키워드"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T14",
    description="E2E: Refactor → Plan → 질문 → 계획 → 승인 → Agent.",
    acceptanceCriteria=["Plan 배지", "질문 UI", "승인 후 agent", "승인 전 소스 unchanged"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T15",
    description="E2E: 승인 후 todo_write로 Plan TODO 진행.",
    acceptanceCriteria=["todo Plan 동기", "UI 갱신"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T16",
    description="E2E: Plan에서 write/edit/terminal deny·디스크 unchanged.",
    acceptanceCriteria=["쓰기 0회", "에러 명확", "루프 지속"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T17",
    description="Mermaid 벤치: 50 다이어그램 < 300ms (목표).",
    acceptanceCriteria=["벤치 존재", "결과 기록"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T18",
    description="docs/plan-mode.md + Mermaid 템플릿 + `.agentk/plans`.",
    acceptanceCriteria=["가이드 완성", "템플릿 예시"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T19",
    description="헤더 배지 + Research→Plan→Review→Build.",
    acceptanceCriteria=["단계 하이라이트", "Plan 배지"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T20",
    description="Plan 진입/이탈 시 프롬프트·히스토리·도구 스키마 리셋.",
    acceptanceCriteria=["진입 Plan 프롬프트", "이탈 복구", "화이트리스트 교체"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T21",
    description="Plan에서 @file/@codebase 멘션 → Prefetch.",
    acceptanceCriteria=["멘션 파싱", "선독", "컨텍스트 반영"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
    dependencies=["C5-T03", "C1-T15"],
)
e(
    "C5-T22",
    description="최근 계획 10개 리스트/불러오기.",
    acceptanceCriteria=["최근 10개", "에디터 로드"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T23",
    description="Plan todo_write → Agent 동일 todo 이어받기.",
    acceptanceCriteria=["모드 전환 후 todo 유지", "완료 동기화"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T24",
    description="Agent 중 Per plan step N 컨텍스트 주입.",
    acceptanceCriteria=["현재 스텝 주입", "컴팩션 시 plan 보호"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)
e(
    "C5-T25",
    description="Plan 없이 큰 쓰기 시도 시 경고 + Plan 제안.",
    acceptanceCriteria=["휴리스틱 연동", "CTA", "무시 가능"],
    prdRefs=["PRD-C5_Plan_Mode.md"],
)

# ----- C6 -----
e(
    "C6-T01",
    description=(
        "PRD-C6 Debug FSM: 가설→계측→재현→로그→최소수정→청소. "
        "Design Mode UI는 C7. C6 browser 증거는 C6-T29."
    ),
    acceptanceCriteria=["6단계 상태머신", "증거 없이 패치 가드(옵션)", "Tools-G 정합"],
    prdRefs=["PRD-C6_Debug_Mode.md", "PRD-Tools-G_Debug_Tools.md"],
)
e(
    "C6-T02",
    description="N가설 + todo_write 상태 pending/investigating/confirmed/rejected + UI 선택.",
    acceptanceCriteria=["N≥2", "상태 전이", "선택→investigating"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T03",
    description="add_instrumentation: edit_file 래퍼, 마커 // DEBUG_INSTRUMENT: hypothesis-N.",
    acceptanceCriteria=["마커 삽입", "원본 range 기록", "hypothesisId 연결"],
    prdRefs=["PRD-C6_Debug_Mode.md", "PRD-Tools-G_Debug_Tools.md"],
)
e(
    "C6-T04",
    description="JS/TS/Python/Go/Rust 계측 패턴 라이브러리.",
    acceptanceCriteria=["언어별 템플릿 ≥3", "폴백"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T05",
    description="DebugLogServer HTTP/WS. truncate/maxLines. 종료 시 정리.",
    acceptanceCriteria=["엔드포인트", "truncate", "메모리 가드"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T06",
    description="collect_runtime_logs: file/socket/journald + filter/since/maxLines.",
    acceptanceCriteria=["필터", "maxLines 기본 1000", "tool result 포맷"],
    prdRefs=["PRD-C6_Debug_Mode.md", "PRD-Tools-G_Debug_Tools.md"],
)
e(
    "C6-T07",
    description="request_reproduce: 가이드+대기. timeout 5분 알림.",
    acceptanceCriteria=["Reproduced→resume", "timeout 알림", "Stop 취소"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T08",
    description="Reproduce UI: 가이드/스크린샷/Reproduced. 대기 중 채팅 가능.",
    acceptanceCriteria=["가이드", "완료 버튼", "입력 가능"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T09",
    description="로그 분석: 스택+로그+symbol 중 ≥2 → confirmed.",
    acceptanceCriteria=["확정 임계값", "evidence", "미달 시 investigating"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T10",
    description="Targeted Fix 최소 패치 + verification micro-loop.",
    acceptanceCriteria=["최소 diff", "가설 id", "lint/test 훅"],
    prdRefs=["PRD-C6_Debug_Mode.md", "PRD-Harness-10_Verification_MicroLoop.md"],
)
e(
    "C6-T11",
    description="remove_instrumentation 마커 100% 제거.",
    acceptanceCriteria=["잔여 0줄", "원본 복구", "hypothesis 단위"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T12",
    description="Verify & Cleanup: 재현→통과→계측 제거.",
    acceptanceCriteria=["실패 시 계측 유지", "성공 cleanup", "타임라인"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T13",
    description="Debug 타임라인 단계 그룹.",
    acceptanceCriteria=["단계 노드", "접기"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T14",
    description="단위: 계측 apply/remove.",
    acceptanceCriteria=["roundtrip", "다중 삽입"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T15",
    description="단위: DebugLogServer 필터/truncate.",
    acceptanceCriteria=["필터", "truncate"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T16",
    description="단위: LogAnalyzer 2/3 규칙.",
    acceptanceCriteria=["확정", "거부"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T17",
    description="E2E race→가설3→계측→재현→수정→cleanup.",
    acceptanceCriteria=["6단계", "마커 0", "검증 통과"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T18",
    description="E2E Stop 중 계측 롤백.",
    acceptanceCriteria=["계측 제거/Pending 정합", "서버 정리"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T19",
    description="E2E 계측→테스트실패→수정→통과.",
    acceptanceCriteria=["로그 수집", "그린"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T20",
    description="벤치 1000 logs/s, mem<50MB.",
    acceptanceCriteria=["벤치", "결과 기록"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T21",
    description="docs/debug-mode.md.",
    acceptanceCriteria=["가이드 완성"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T22",
    description="Debug 배지+가설 모달+재현 패널.",
    acceptanceCriteria=["배지", "모달", "패널"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T23",
    description="Debug에서 edit_file 허용. Plan whitelist과 분리.",
    acceptanceCriteria=["edit_file 허용", "Plan과 분리", "browser 풀셋은 C7"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T24",
    description="재현 액션→스크립트 초안.",
    acceptanceCriteria=["기록", "export"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T25",
    description="템플릿 console/perf mark/error boundary.",
    acceptanceCriteria=["템플릿 3+", "라이브러리 연동"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T26",
    description="멀티파일 계측→통합 분석.",
    acceptanceCriteria=["다중 path", "타임스탬프 상관"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T27",
    description="디버그 세션 save/load.",
    acceptanceCriteria=["save/load", "재시작 로드"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T28",
    description="Debug 진입 기준 문서.",
    acceptanceCriteria=["docs 존재"],
    prdRefs=["PRD-C6_Debug_Mode.md"],
)
e(
    "C6-T29",
    title="Debug 증거용 browser_screenshot/console/network (Design Mode=C7)",
    description=(
        "PRD-C6 §2.4: screenshot·콘솔·네트워크만. 오버레이는 C7-T03. Playwright는 C7-T01 래퍼 가능."
    ),
    files=["src/debug/BrowserEvidence.ts"],
    priority="P1",
    status="pending",
    dependencies=["C6-T01", "C7-T01"],
    acceptanceCriteria=[
        "screenshot/console/network API",
        "Design overlay 미포함",
        "증거→타임라인/분석 첨부",
    ],
    estimatedHours=4,
    tags=["debug", "browser-evidence", "prd-c6"],
    prdRefs=["PRD-C6_Debug_Mode.md", "PRD-11_Browser_Design_Mode.md"],
)

# ----- C7 thin map -----
C7_MAP = {
    "C7-T01": (
        "Playwright: navigate/click/scroll/wait/screenshot/evaluate + console/network. Tier A deny.",
        ["핵심 API 동작", "Tier A 미노출", "에러 시 세션 정리"],
        ["PRD-C7_Production_Grade.md", "PRD-11_Browser_Design_Mode.md", "PRD-Tools-D_Web_Browser_Media.md"],
    ),
    "C7-T02": (
        "세션 풀 max3 LRU, 쿠키/스토리지, total mem <800MB.",
        ["max3", "LRU", "쿠키 유지"],
        ["PRD-11_Browser_Design_Mode.md"],
    ),
    "C7-T03": (
        "Design Mode 오버레이: 클릭→주석/좌표/셀렉터.",
        ["오버레이", "셀렉터 기록"],
        ["PRD-11_Browser_Design_Mode.md"],
    ),
    "C7-T04": (
        "주석+스크린샷 다음 턴 컨텍스트 첨부.",
        ["주입", "truncate"],
        ["PRD-11_Browser_Design_Mode.md"],
    ),
    "C7-T05": (
        "browser_* ToolRegistry 등록 (Tools-D).",
        ["Zod 스키마", "permission meta"],
        ["PRD-Tools-D_Web_Browser_Media.md"],
    ),
    "C7-T06": (
        "Webview 브라우저 프리뷰.",
        ["프리뷰", "세션 연결"],
        ["PRD-11_Browser_Design_Mode.md"],
    ),
    "C7-T07": (
        "git worktree CRUD/list.",
        ["create/list/delete", "경로 격리"],
        ["PRD-13_Worktree_BestOfN.md"],
    ),
    "C7-T08": (
        "Best-of-N 병렬 Agent.",
        ["N병렬", "실패 isolation"],
        ["PRD-13_Worktree_BestOfN.md"],
    ),
    "C7-T09": (
        "비교 UI: diff+테스트+비용.",
        ["카드 UI", "선택"],
        ["PRD-13_Worktree_BestOfN.md"],
    ),
    "C7-T10": (
        "승자 adopt/merge, 패자 cleanup.",
        ["메인 적용", "잔여 0"],
        ["PRD-13_Worktree_BestOfN.md"],
    ),
    "C7-T11": (
        "/review diff→정적+LM.",
        ["finding", "빈 diff 가드"],
        ["PRD-14_Agent_Review.md"],
    ),
    "C7-T12": (
        "Finding UI Accept/Dismiss.",
        ["리스트", "Dismiss"],
        ["PRD-14_Agent_Review.md"],
    ),
    "C7-T13": (
        "Accept Fix micro-agent + lint.",
        ["단일 edit", "lint"],
        ["PRD-14_Agent_Review.md"],
    ),
    "C7-T14": (
        "Memories 고도화 영구+UI+주입.",
        ["재시작 유지", "슬롯"],
        ["PRD-15_Memories.md"],
    ),
    "C7-T15": (
        "Chat Search 인덱스+웹뷰.",
        ["검색", "갱신"],
        ["PRD-C7_Production_Grade.md"],
    ),
    "C7-T16": (
        "Artifacts 갤러리.",
        ["저장", "갤러리"],
        ["PRD-C7_Production_Grade.md"],
    ),
    "C7-T17": (
        "MCP SDK, mcp_<server>_<tool>.",
        ["등록", "충돌 없음"],
        ["PRD-10_MCP.md"],
    ),
    "C7-T18": (
        "MCP deferred + tool_search.",
        ["지연 로드", "검색 후 스키마"],
        ["PRD-10_MCP.md", "PRD-Tools-F_Orchestration_Extension.md"],
    ),
    "C7-T21": (
        "task 서브에이전트 위임.",
        ["별도 컨텍스트", "타입별"],
        ["PRD-Tools-F_Orchestration_Extension.md"],
    ),
    "C7-T22": (
        "서브에이전트 요약만 부모 반환.",
        ["원문 미전파", "캡"],
        ["PRD-Tools-F_Orchestration_Extension.md"],
    ),
    "C7-T23": (
        "gh API PR/Issue.",
        ["auth 에러", "이슈 생성"],
        ["PRD-C7_Production_Grade.md"],
    ),
    "C7-T24": (
        "커밋/PR 설명 생성.",
        ["생성", "편집 후 적용"],
        ["PRD-C7_Production_Grade.md"],
    ),
    "C7-T25": (
        "테스트 생성/수정 루프.",
        ["종료 조건", "maxTurns"],
        ["PRD-Harness-10_Verification_MicroLoop.md"],
    ),
    "C7-T26": (
        "Secrets Vault UI SecretStorage only.",
        ["평문 금지", "프로파일"],
        ["PRD-21_Secrets.md", "PRD-29_Settings_Hub.md"],
    ),
    "C7-T27": (
        "InlineCompletionItemProvider.",
        ["제안", "동일 엔드포인트"],
        ["PRD-C7_Production_Grade.md"],
    ),
    "C7-T28": (
        "Selection Diff Apply.",
        ["DiffEditor", "WorkspaceEdit"],
        ["PRD-C7_Production_Grade.md"],
    ),
    "C7-T29": (
        "병렬 검색/읽기 concurrency.",
        ["p-limit", "취소"],
        ["PRD-Tools-A_Search_Explore.md"],
    ),
    "C7-T30": (
        "Codebase indexing.",
        ["빌드", "@codebase"],
        ["PRD-08_Codebase_Indexing.md"],
    ),
    "C7-T31": (
        "Semantic search 또는 rg 폴백.",
        ["없으면 grep 유도"],
        ["PRD-08_Codebase_Indexing.md"],
    ),
    "C7-T32": (
        "DGX/vLLM 프로바이더 카탈로그.",
        ["등록", "연결 테스트"],
        ["PRD-02_Provider_Adapters.md"],
    ),
    "C7-T33": (
        "Model Router Cost/Balance/Intel.",
        ["라우팅", "오버라이드"],
        ["PRD-Harness-12_Routing_Heuristics.md"],
    ),
    "C7-T34": (
        "Firmware SVD 뷰어(B).",
        ["TreeView/Webview"],
        ["PRD-C7_Production_Grade.md"],
    ),
    "C7-T35": (
        "Legacy scan report(B).",
        ["리포트"],
        ["PRD-C7_Production_Grade.md"],
    ),
    "C7-T36": (
        "MISRA/Lint AI 설명.",
        ["diagnostic→제안"],
        ["PRD-C7_Production_Grade.md"],
    ),
    "C7-T37": (
        "Serial Monitor(B).",
        ["포트", "로그"],
        ["PRD-C7_Production_Grade.md"],
    ),
    "C7-T38": (
        "E2E Browser+Design→수정→재캡처.",
        ["시나리오 그린"],
        ["PRD-11_Browser_Design_Mode.md"],
    ),
    "C7-T39": (
        "E2E BoN 3→비교→채택.",
        ["merge", "cleanup"],
        ["PRD-13_Worktree_BestOfN.md"],
    ),
    "C7-T40": (
        "E2E /review→Accept Fix.",
        ["finding→edit"],
        ["PRD-14_Agent_Review.md"],
    ),
    "C7-T41": (
        "E2E Memories 재시작.",
        ["주입 확인"],
        ["PRD-15_Memories.md"],
    ),
    "C7-T42": (
        "E2E MCP 호출.",
        ["성공"],
        ["PRD-10_MCP.md"],
    ),
    "C7-T44": (
        "벤치 browser start/screenshot.",
        ["벤치 기록"],
        ["PRD-11_Browser_Design_Mode.md"],
    ),
    "C7-T45": (
        "Production 가이드(Browser/Worktree/Review/MCP/Skills).",
        ["docs", "Skills=PRD-28"],
        ["PRD-C7_Production_Grade.md", "PRD-28_Skills_Pinned.md"],
    ),
}
for tid, (desc, ac, refs) in C7_MAP.items():
    e(tid, description=desc, acceptanceCriteria=ac, prdRefs=refs, tags=["c7", "enriched"])

e("C7-T19", prdRefs=["PRD-28_Skills_Pinned.md", "PRD-Tools-F_Orchestration_Extension.md"])
e("C7-T20", prdRefs=["PRD-28_Skills_Pinned.md"])
e("C7-T43", prdRefs=["PRD-28_Skills_Pinned.md"])
e("C7-T46", prdRefs=["PRD-29_Settings_Hub.md"])

# ----- HARB -----
HARB = {
    "HARB-T01": ("Tier A/B/C 타입·라우팅.", ["enum", "헬퍼"], ["PRD-Harness-01_Model_Tiers.md"]),
    "HARB-T02": ("Verification-First 프롬프트.", ["문구", "티어별"], ["PRD-Harness-02_Verification_First.md"]),
    "HARB-T03": ("Think→Act→Verify 턴 구조.", ["템플릿", "경고"], ["PRD-Harness-03_Cursor_Pattern.md"]),
    "HARB-T04": ("Memories minimal 게이트(C4 연동).", ["예산", "CRUD"], ["PRD-Harness-04_Memories_Minimal.md"]),
    "HARB-T05": ("Design slogans 반영.", ["목록", "주입"], ["PRD-Harness-05_Design_Slogans.md"]),
    "HARB-T07": ("턴 도구 캡·read-before-edit.", ["캡 deny", "read-before-edit"], ["PRD-Harness-07_Prompt_Turn_Structure.md"]),
    "HARB-T08": ("Harness Duties 체크리스트.", ["9종", "훅"], ["PRD-Harness-08_Harness_Duties.md"]),
    "HARB-T09": ("Prefetch 패턴 게이트.", ["멘션/스택"], ["PRD-Harness-09_Prefetch_Pattern.md"]),
    "HARB-T10": ("Verification micro-loop 게이트(C2 중복=완성).", ["재시도", "max"], ["PRD-Harness-10_Verification_MicroLoop.md"]),
    "HARB-T11": ("Context rules 예산.", ["예산"], ["PRD-Harness-11_Context_Rules.md"]),
    "HARB-T12": ("Routing heuristics.", ["함수"], ["PRD-Harness-12_Routing_Heuristics.md"]),
    "HARB-T13": ("UX for Medium 버튼.", ["3종"], ["PRD-Harness-13_UX_For_Medium.md"]),
    "HARB-T14": ("Don't Do Medium 가드.", ["안티패턴"], ["PRD-Harness-14_Dont_Do_Medium.md"]),
    "HARB-T15": ("Harness-15 AC-1.", ["테스트"], ["PRD-Harness-15_Acceptance_Criteria.md"]),
    "HARB-T16": ("Harness-15 AC-2.", ["테스트"], ["PRD-Harness-15_Acceptance_Criteria.md"]),
    "HARB-T17": ("Harness-15 AC-3.", ["테스트"], ["PRD-Harness-15_Acceptance_Criteria.md"]),
    "HARB-T18": ("Harness-15 AC-4.", ["테스트"], ["PRD-Harness-15_Acceptance_Criteria.md"]),
    "HARB-T19": ("Harness-15 리포트.", ["산출"], ["PRD-Harness-15_Acceptance_Criteria.md"]),
    "HARB-T20": ("Spec-01 Provider/Tool JSON.", ["3계층"], ["PRD-Spec-01_Provider_ToolJSON.md"]),
    "HARB-T21": ("Spec-02 Patch format.", ["검증"], ["PRD-Spec-02_Patch_Format.md"]),
    "HARB-T22": ("Spec-03 Context budget.", ["compact"], ["PRD-Spec-03_Context_Budget.md"]),
    "HARB-T23": ("Spec-04 Terminal allowlist.", ["allowlist", "deny"], ["PRD-Spec-04_Terminal_Execution.md"]),
    "HARB-T25": ("Spec-06 Checkpoint 게이트.", ["스냅샷"], ["PRD-Spec-06_Checkpoint_Rollback.md"]),
    "HARB-T26": ("Spec-07 Compaction 게이트.", ["4단계"], ["PRD-Spec-07_Context_Compaction.md"]),
    "HARB-T27": ("Tools-A 갭필(재구현 금지).", ["스키마 일치", "C1 deps"], ["PRD-Tools-A_Search_Explore.md"]),
    "HARB-T28": ("Tools-B 갭필.", ["Search-Replace"], ["PRD-Tools-B_Edit_File.md"]),
    "HARB-T29": ("Tools-C 갭필.", ["allowlist terminal"], ["PRD-Tools-C_Terminal.md"]),
    "HARB-T30": ("Tools-D Browser — C7 이후 갭필.", ["C7 dep", "read_lints"], ["PRD-Tools-D_Web_Browser_Media.md"]),
    "HARB-T31": ("Tools-E Session UX.", ["ask/todo/switch"], ["PRD-Tools-E_Session_UX.md"]),
    "HARB-T32": ("Tools-F + PRD-28 skill/task.", ["skill", "task"], ["PRD-Tools-F_Orchestration_Extension.md", "PRD-28_Skills_Pinned.md"]),
    "HARB-T33": ("Tools-G Debug, C6 deps.", ["4 tools", "collect_runtime_logs"], ["PRD-Tools-G_Debug_Tools.md"]),
    "HARB-T34": ("A–G 등록+Zod+permission.", ["레지스트리"], ["PRD-Infra-04_Tool_Registry.md"]),
    "HARB-T35": ("벤치 Flash 안정성.", ["실패율"], ["PRD-Harness-01_Model_Tiers.md"]),
    "HARB-T36": ("하네스 통합 스모크.", ["게이트"], ["PRD-Harness-15_Acceptance_Criteria.md"]),
    "HARB-T37": ("하네스 문서 인덱스.", ["링크"], ["PRD-Harness-01_Model_Tiers.md"]),
    "HARB-T38": ("Tier A whitelist 스냅샷 테스트.", ["스냅샷"], ["PRD-Harness-06_A_Tier_Whitelist.md"]),
}
for tid, (desc, ac, refs) in HARB.items():
    kw: dict = {
        "description": desc,
        "acceptanceCriteria": ac,
        "prdRefs": refs,
        "tags": ["harb", "enriched", "gap-fill"],
    }
    if tid == "HARB-T30":
        kw["dependencies"] = ["C7-T05", "HARB-T06"]
    elif tid == "HARB-T33":
        kw["dependencies"] = ["C6-T03", "HARB-T06"]
    elif tid == "HARB-T32":
        kw["dependencies"] = ["C7-T19", "HARB-T06"]
    e(tid, **kw)

e("HARB-T06", prdRefs=["PRD-Harness-06_A_Tier_Whitelist.md"])
e("HARB-T24", prdRefs=["PRD-Spec-05_Permission_Autorun.md", "PRD-29_Settings_Hub.md"])


def apply() -> None:
    updated = created = thin_left = 0
    for ph in ("C5", "C6", "C7", "HARB"):
        d = TASKS / ph
        if ph == "C6" and "C6-T29" in E and not (d / "C6-T29.json").exists():
            meta = E["C6-T29"]
            t = {
                "id": "C6-T29",
                "phase": "C6",
                "title": meta["title"],
                "description": meta["description"],
                "files": meta["files"],
                "priority": meta.get("priority", "P1"),
                "status": "pending",
                "dependencies": meta["dependencies"],
                "acceptanceCriteria": meta["acceptanceCriteria"],
                "estimatedHours": meta.get("estimatedHours", 4),
                "tags": meta.get("tags", []),
                "prdRefs": meta.get("prdRefs", []),
                "notes": "Gap: PRD-C6 browser evidence without Design Mode (C7).",
            }
            (d / "C6-T29.json").write_text(json.dumps(t, ensure_ascii=False, indent=2) + "\n")
            created += 1

        for f in sorted(d.glob("*.json")):
            t = json.loads(f.read_text())
            tid = t["id"]
            if tid in E:
                for k, v in E[tid].items():
                    if k == "tags":
                        t["tags"] = list(dict.fromkeys(list(t.get("tags") or []) + list(v)))
                    else:
                        t[k] = v
                t["notes"] = (
                    t.get("notes")
                    or "Enriched 2026-07-25 from phase PRD for C5–HARB coding kickoff."
                )
                f.write_text(json.dumps(t, ensure_ascii=False, indent=2) + "\n")
                updated += 1
            if "Details: MASTER" in (t.get("description") or ""):
                thin_left += 1

    print(f"updated={updated} created={created} thin_left={thin_left}")
    for ph in ("C5", "C6", "C7", "HARB"):
        files = list((TASKS / ph).glob("*.json"))
        thin = sum(
            1
            for f in files
            if "Details: MASTER" in json.loads(f.read_text()).get("description", "")
        )
        print(f"{ph}: n={len(files)} thin={thin}")


if __name__ == "__main__":
    apply()
