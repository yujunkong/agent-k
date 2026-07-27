# PRD-Tools-A: Search · Explore (검색 · 탐색)

> **Category**: Tool Catalog — A. Search · Explore  
> **Phase**: C1 (Ask, 읽기 전용) → C2~C3 (Agent 탐색) → C4+ (`codebase_search` / `lsp_*` 옵션)  
> **Related PRDs**:  
> - `../01_S_Tier_Immediate_Impact/PRD-07_Parallel_File_Search.md`  
> - `../02_A_Tier_Production_Grade/PRD-08_Codebase_Indexing.md`  
> - `../04_Implementation_Phases/PRD-C1_Ask_Mode.md`  
> - `../05_Core_Infrastructure/PRD-Infra-03_Indexing_SemanticSearch.md`  
> - `../05_Core_Infrastructure/PRD-Infra-04_Tool_Registry.md`  
> - `../07_Medium_Model_Harness/PRD-Harness-06_A_Tier_Whitelist.md`  
> **Out of Scope**: 파일 쓰기/삭제, 터미널 실행, 브라우저, 서브에이전트 (각각 B~F 카탈로그)

---

## 1. Overview

워크스페이스를 **읽고 찾는** 도구 축이다. `Extension_high_impact.md` **A. 검색 · 탐색**과 이름이 1:1로 일치해야 한다.

| 도구 | 역할 |
|------|------|
| `codebase_search` | 의미(임베딩) 검색 |
| `grep` | 정규식 내용 검색 |
| `glob` / `file_search` | 경로·이름 패턴 |
| `list_dir` | 디렉터리 목록 |
| `read_file` | 파일·이미지 구간 읽기 |
| `lsp_*` | 정의/참조/진단 (Language Features) |

설계 원칙: **탐색은 확장이 병렬로**, 모델은 결과 요약·다음 행동만. Ask 모드에서는 이 카테고리만 허용한다.

---

## 2. Tool Definitions

### 2.1 `grep`

```typescript
// 의도: ripgrep 기반 내용 검색 — 모델은 query만, 확장이 병렬 실행
{
  name: "grep",
  description: "Search file contents with regex (ripgrep). Prefer over shell grep.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern" },
      path: { type: "string", description: "File or directory scope (default: workspace root)" },
      glob: { type: "string", description: "File filter e.g. *.ts" },
      case_insensitive: { type: "boolean", default: false },
      context_before: { type: "integer", minimum: 0, maximum: 10, default: 0 },
      context_after: { type: "integer", minimum: 0, maximum: 10, default: 0 },
      head_limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
      multiline: { type: "boolean", default: false }
    },
    required: ["pattern"],
    additionalProperties: false
  }
}
```

**tool result (짧게)**: `{ matches: [{ path, line, text }], count, truncated }` — 전문 dump 금지.

---

### 2.2 `glob` / `file_search`

```typescript
// 의도: 이름·경로 패턴 탐색. 내부 alias: file_search ≡ glob
{
  name: "glob", // alias: file_search
  description: "Find files by glob pattern. Returns paths only.",
  parameters: {
    type: "object",
    properties: {
      glob_pattern: { type: "string", description: "e.g. **/*.{ts,tsx}" },
      target_directory: { type: "string", description: "Absolute or workspace-relative root" },
      head_limit: { type: "integer", default: 200, maximum: 2000 }
    },
    required: ["glob_pattern"],
    additionalProperties: false
  }
}
```

구현 힌트: `vscode.workspace.findFiles` + ignore (`node_modules` 등).

---

### 2.3 `list_dir`

```typescript
{
  name: "list_dir",
  description: "List directory entries (name, type). Prefer over shell ls.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path" },
      depth: { type: "integer", minimum: 1, maximum: 3, default: 1 },
      include_hidden: { type: "boolean", default: false }
    },
    required: ["path"],
    additionalProperties: false
  }
}
```

---

### 2.4 `read_file`

```typescript
// 의도: 구간 읽기 강제 — 큰 파일 전체 dump로 context 폭증 방지
{
  name: "read_file",
  description: "Read a file (optional line range). Supports images (jpeg/png/gif/webp) as vision payload.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      offset: { type: "integer", description: "1-indexed start line; negative = from end" },
      limit: { type: "integer", minimum: 1, maximum: 500, description: "Max lines (Tier A default cap 250)" }
    },
    required: ["path"],
    additionalProperties: false
  }
}
```

| 규칙 | 값 |
|------|-----|
| Tier A 기본 캡 | 250줄 |
| 미지정 시 | 앞 N줄 + “file continues…” hint |
| 바이너리(이미지 제외) | 거절 + MIME 안내 |

---

### 2.5 `codebase_search`

```typescript
// 의도: 의미 검색. 인덱스(PRD-08 / Infra-03) 준비 전엔 stub 거절 + grep 유도
{
  name: "codebase_search",
  description: "Semantic search over the workspace index. Returns top chunks with paths.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Natural language question" },
      target_directories: { type: "array", items: { type: "string" }, default: [] },
      num_results: { type: "integer", minimum: 1, maximum: 25, default: 10 }
    },
    required: ["query"],
    additionalProperties: false
  }
}
```

**Phase**: 풀 품질은 **C7** (인덱싱 A급). MVP에서는 미구현 시 clear error.

---

### 2.6 `lsp_*`

권장 이름 세트 (읽기 전용):

| 도구 | 하는 일 |
|------|---------|
| `lsp_definition` | Go to Definition |
| `lsp_references` | Find References |
| `lsp_hover` | Hover / 시그니처 |
| `lsp_diagnostics` | 문서·워크스페이스 진단 (읽기) |

```typescript
{
  name: "lsp_definition",
  description: "Resolve symbol definition at a position via Language Features API.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      line: { type: "integer", minimum: 0 },
      character: { type: "integer", minimum: 0 }
    },
    required: ["path", "line", "character"],
    additionalProperties: false
  }
}
```

`lsp_diagnostics`는 **D카탈로그 `read_lints`**와 겹칠 수 있음 — 레지스트리에서 하나로 alias하거나, LSP 위치 API vs diagnostics 수집 역할을 분리한다.

---

## 3. Tier Availability Matrix

| 도구 | Tier A (Flash) | Tier B (Pro) | Tier C (no-tools) |
|------|----------------|--------------|-------------------|
| `grep` | ✅ | ✅ | ❌ (채팅만) |
| `glob` / `file_search` | ✅ | ✅ | ❌ |
| `list_dir` | ✅ | ✅ | ❌ |
| `read_file` | ✅ (limit 캡) | ✅ | ❌ |
| `codebase_search` | ⚪ C4+ 옵션 (Harness-06 `enableOptionalA`, 인덱스 필요) | ✅ | ❌ |
| `lsp_*` | ⚪ C4+ 옵션 (Harness-06) | ✅ | ❌ |

**Tier A LOCKED (이 카탈로그 밖이지만 혼동 방지)**: Browser, image gen, bulk MCP, `delete_file`, multi-subagent, arbitrary shell.

> **CRITICAL**: Tier A는 allowlist `run_terminal_cmd`를 **쓸 수 있다** (C 카탈로그). 터미널 전면 금지가 아니다.

---

## 4. Mode Whitelist Notes

| Mode | Search · Explore |
|------|------------------|
| **Ask** | 전부 허용 (읽기 전용 축의 핵심) |
| **Agent** | 전부 + 정책에 따른 병렬 |
| **Plan** | 읽기 허용 (`grep`/`read`/`glob`/`list_dir`; 쓰기 없음) |
| **Debug** | 읽기 허용 + G 카탈로그 계측과 병행 |

---

## 5. MVP vs Full Set Mapping

| 단계 | 포함 |
|------|------|
| **C1~C3 MVP** | `grep`, `glob`/`file_search`, `list_dir`, `read_file` |
| **C4+** | 동일 + 결과 truncate·병렬 정책 강화 |
| **C5~C7** | + `codebase_search`, `lsp_*` 풀세트 |

---

## 6. Acceptance Criteria

- [ ] Given Ask mode, When agent runs, Then only read tools from A(+E ask/todo) are in schema; no `edit_file`/`write_file`
- [ ] Given `read_file` without limit on large file, When executed, Then harness applies line cap and returns truncated meta
- [ ] Given parallel `grep`+`glob`+`read_file`, When Agent emits multiple tool calls, Then extension runs via `Promise.all` / concurrency queue
- [ ] Given no index, When `codebase_search` called, Then clear error + hint to use `grep`
- [ ] Tool names match `Extension_high_impact.md` A절 exactly (no `search_symbols` as primary name — use `lsp_*`)

---

## 7. Dependencies (canonical owners)

| 관심사 | Owner |
|--------|--------|
| Tool Registry / schema filter | `PRD-Infra-04_Tool_Registry.md` |
| Parallel search | `PRD-07_Parallel_File_Search.md` |
| Semantic index | `PRD-08_Codebase_Indexing.md`, `PRD-Infra-03_Indexing_SemanticSearch.md` |
| Tier A whitelist | `PRD-Harness-06_A_Tier_Whitelist.md` |
| Ask mode | `PRD-C1_Ask_Mode.md` |

---

## 8. Out of Scope

- Search–Replace / Review UI → **B. Edit · File**
- 셸 `rg`/`find` 대용 강제 → 전용 도구 우선; Bash는 C절 allowlist만
- 도메인 전용 스캐너(펌웨어 SVD 등) → `PRD-24`~`PRD-27` (B-tier), 도구 카탈로그 G 아님
