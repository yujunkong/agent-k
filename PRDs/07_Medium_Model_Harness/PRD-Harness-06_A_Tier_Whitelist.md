# PRD-Harness-06: A-Tier Tool Whitelist (A티어 도구 화이트리스트)

> **Category**: Medium Model Harness  
> **Phase**: C1~C2 (코어) → C4+ (선택 확장)  
> **관련 PRD**: `PRD-Harness-01_Model_Tiers.md`, `PRD-Harness-05_Design_Slogans.md`, `PRD-Infra-04_Tool_Registry.md`, `PRD-Tools-A_Search_Explore.md` ~ `PRD-Tools-G_Debug_Tools.md`  
> **Canonical**: Tier A 노출 목록 Primary = 본 문서. 도구 스키마 상세는 Tools A–G.

---

## 1. Overview

### 목적
**Tier A (Flash/중급 모델)**에 **최소 필요 도구만** 노출해 **토큰 절약·실수 방지·집중도 향상**을 달성한다. "스키마를 좁게(슬로건 4)" 원칙의 구현체.

원본(`Extension_high_impact.md` A티어 화이트리스트)과 **1:1**로 맞춘다.

### 비즈니스 가치
- Full 스키마 대비 토큰 대폭 절약
- 위험 도구(delete, browser, bulk MCP) 원천 차단
- **터미널 전면 금지 아님** — allowlist `run_terminal_cmd`만 허용 (Tools-C)

---

## 2. A-Tier Whitelist

### 2.1 코어 (C1–C3 MVP — 항상 노출)

| # | Tool | Catalog | 허용 사유 | 제한 |
|---|------|---------|-----------|------|
| 1 | `grep` | A | 핵심 탐색 | - |
| 2 | `glob` / `file_search` | A | 경로 패턴 | - |
| 3 | `list_dir` | A | 디렉터리 | - |
| 4 | `read_file` | A | 구간 읽기 | offset/limit, ≤250줄 기본 |
| 5 | `edit_file` (Search–Replace) | B | 부분 수정 | 유일 매칭 |
| 6 | `write_file` | B | 신규·짧은 파일만 | 기존 대형 거절, ≤~200줄 |
| 7 | `run_terminal_cmd` | C | 검증·git | **allowlist만** |
| 8 | `read_lints` | D | edit 후 검증 | 하네스 자동 호출 가능 |

### 2.2 세션 보조 (항상 허용)

| Tool | Catalog | 목적 |
|------|---------|------|
| `ask_question` | E | 확인 질문 |
| `todo_write` | E | 진행 가시화 |

### 2.3 선택 확장 (C4+ · 플래그 on일 때만)

| Tool | Catalog | 조건 |
|------|---------|------|
| `codebase_search` | A | 임베딩 인덱스 준비 시 (Tools-A: 인덱스 없으면 grep 유도) |
| `lsp_*` | A | LSP/인덱스 폴백 가능 시 |
| `switch_mode` | E | 모드 피커와 중복 가능 — 제품 선택 |
| `fetch_rules` | E | 기본은 Infra-01 자동 주입; 도구 노출은 선택 |

> **구현 기본값**: 코어 8 + `ask_question` + `todo_write` = **10 schemas**.  
> `codebase_search` / `lsp_*` 는 기본 off → C4+ 옵션.

---

## 3. Explicitly Denied (A-Tier)

| Tool | 금지 사유 | Tier B |
|------|-----------|--------|
| `delete_file` | 실수 비용↑ | ask |
| unified-diff / 라인번호 의존 패치 | Search–Replace `edit_file`만 | 검증기 있으면 가능 |
| `browser_*` / `generate_image` | 루프 길·환각↑ | ✅ (C7) |
| bulk `mcp_*` | 스키마·선택 혼란 | ✅ + deferred |
| 다중 `task` / subagent | 조율 실패↑ | ✅ |
| 임의 셸 | allowlist 밖 | permission |
| `web_search` / `web_fetch` | 기본 잠금 | ✅ |

---

## 4. Parameter Presets

| Parameter | Tier A | Tier B |
|-----------|--------|--------|
| `temperature` | 0~0.3 (도구 턴) | 여유 |
| 턴당 tool_calls | ≤ 4 | 여유 |
| 활성 도구 수 | ≤ 8~12 | 풀세트 |

---

## 5. Implementation Spec

```typescript
// 코어 + 세션 보조 (기본 Tier A) — 원본 화이트리스트
export const TIER_A_CORE = [
  'grep', 'glob', 'list_dir', 'read_file',
  'edit_file', 'write_file', 'run_terminal_cmd', 'read_lints',
  'ask_question', 'todo_write',
] as const;

// C4+ 옵션
export const TIER_A_OPTIONAL = [
  'codebase_search', 'lsp_definition', 'lsp_references',
  'switch_mode', 'fetch_rules',
] as const;

export function getSchemasForTier(
  tier: ModelTier,
  opts: { enableOptionalA?: boolean } = {},
): ToolSchema[] {
  if (tier !== 'A') return ALL_TOOLS.map(t => t.schema);
  const names = opts.enableOptionalA
    ? [...TIER_A_CORE, ...TIER_A_OPTIONAL]
    : [...TIER_A_CORE];
  return names
    .map(n => toolRegistry.get(n)?.schema)
    .filter(Boolean) as ToolSchema[];
}
```

---

## 6. Acceptance Criteria

```gherkin
Feature: A-Tier Tool Whitelist

  Scenario: Flash 기본 스키마는 코어 10개
    Given model Tier A, optionalA=false
    When Agent mode starts
    Then schemas include grep, glob, list_dir, read_file, edit_file,
         write_file, run_terminal_cmd, read_lints, ask_question, todo_write
    And delete_file, browser_*, bulk mcp_* absent
    And run_terminal_cmd present (allowlist at execute time)

  Scenario: C4+ optional search intelligence
    Given Tier A, optionalA=true, index ready
    Then codebase_search and/or lsp_* may be included

  Scenario: Tier B fuller set
    Given Tier B
    Then browser/mcp/delete per permission policy
```

---

## Out of Scope

- 프론티어용 풀 카탈로그를 Tier A 기본값으로 넣기
- Tools A–G 문자 재정의 (원본 고정)

## References

- `Extension_high_impact.md` — A티어 도구 화이트리스트
- `PRD-Harness-01` · `PRD-Harness-05` · `PRD-Harness-14`
- `PRD-Tools-A` ~ `PRD-Tools-G`
- `00_Master_Context.md` Canonical Owner Matrix
