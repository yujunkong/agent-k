# PRD-Tools-B: Edit · File (편집 · 파일 변경)

> **Category**: Tool Catalog — B. Edit · File  
> **Phase**: C2~C4 (edit + Review UI) · `write_file` 신규는 C2부터 · `delete_file`는 C4+  
> **Related PRDs**:  
> - `../01_S_Tier_Immediate_Impact/PRD-05_Selection_Diff_Apply.md`  
> - `../02_A_Tier_Production_Grade/PRD-09_MultiFile_Apply_PatchReview.md`  
> - `../04_Implementation_Phases/PRD-C2_Agent_SingleTurn.md`  
> - `../04_Implementation_Phases/PRD-C4_Infrastructure.md`  
> - `../05_Core_Infrastructure/PRD-Infra-05_Permission_Autorun.md`  
> - `../05_Core_Infrastructure/PRD-Infra-09_Checkpoints_Rollback.md`  
> - `../07_Medium_Model_Harness/PRD-Harness-06_A_Tier_Whitelist.md`  
> - `../08_Advanced_Specs/PRD-Spec-02_Patch_Format.md`  
> **Out of Scope**: 읽기 전용 탐색(A), 터미널(C), Debug 계측 전용(G — 일반 `edit_file`과 분리)

---

## 1. Overview

`Extension_high_impact.md` **B. 편집 · 파일 변경**과 동일 축. **부분 수정이 1급 시민**, 전체 rewrite는 예외.

| 도구 | 역할 |
|------|------|
| `edit_file` / `apply_patch` | Search–Replace 부분 수정 (**권장 기본**) |
| `write_file` | **신규** 또는 **짧은** 파일만 |
| `delete_file` | 삭제 (고위험 → 승인) |
| `reapply` | 실패한 패치 재시도 |
| `notebook_edit` | Jupyter 셀 수정 |
| `multiedit` | 한 파일 다중 hunk (또는 `edit_file`×N으로 묶음) |

Plus: **Review UI** — PendingStore, 파일 그룹, hunk 미리보기, Keep/Undo.

---

## 2. Tool Definitions

### 2.1 `edit_file` (primary) / `apply_patch` (alias)

```typescript
// 의도: old_string 유일 매칭 → WorkspaceEdit.replace. unified diff 라인번호보다 성공률↑
{
  name: "edit_file", // alias registered as apply_patch
  description: "Partial edit via search-replace. Prefer over write_file for existing files.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      old_string: { type: "string", description: "Exact text to find (must be unique unless replace_all)" },
      new_string: { type: "string", description: "Replacement text" },
      replace_all: { type: "boolean", default: false }
    },
    required: ["path", "old_string", "new_string"],
    additionalProperties: false
  }
}
```

**실패 힌트**: `SEARCH 0건` 또는 `2건+` → `read_file` 후 정확한 `old_string` 재시도.

```ts
// 개념 스케치 — 확장 핸들러
const full = doc.getText();
const start = full.indexOf(oldString);
if (start < 0 || (!replaceAll && full.indexOf(oldString, start + 1) >= 0)) {
  return { ok: false, error: "unique match required — re-read and fix old_string" };
}
// WorkspaceEdit.replace(uri, range, newString)
```

**tool result**: `{ ok, path, linesAdded, linesRemoved }` — 본문 재출력 금지.

---

### 2.2 `write_file`

```typescript
// 의도: 신규 생성 또는 짧은 파일(< NEW_FILE_MAX_LINES). 기존 긴 파일 overwrite 거절 → edit_file 유도
{
  name: "write_file",
  description: "Create a new file or overwrite a short file. For existing large files use edit_file.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      contents: { type: "string" }
    },
    required: ["path", "contents"],
    additionalProperties: false
  }
}
```

| 규칙 | 동작 |
|------|------|
| 경로 없음 | 생성 허용 |
| 경로 있음 + 줄 수 ≥ N (예: 200) | **거절** + scaffold/`edit_file` hint |
| `contents` 줄 수 > N | **거절** — 스캐폴드 후 청크 edit |
| tool result | `{ ok, path, created, lines }` — contents 재출력 금지 |

긴 신규 시퀀스: `write_file`(골격) → `edit_file` × N (~100–200줄 청크).

---

### 2.3 `delete_file`

```typescript
{
  name: "delete_file",
  description: "Delete a file. Always requires user approval (or Tier policy ban).",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string }
    },
    required: ["path"],
    additionalProperties: false
  }
}
```

Tier A: **LOCKED** (ask-or-ban). Tier B: C4+ + Permission.

---

### 2.4 `reapply`

```typescript
{
  name: "reapply",
  description: "Retry the last failed edit_file/apply_patch with smarter matching (optional Pro).",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      attempt_id: { type: "string", description: "Id from failed tool result" }
    },
    required: ["path"],
    additionalProperties: false
  }
}
```

Tier A에서는 보통 스키마 제외 (Harness deny 목록과 정렬).

---

### 2.5 `notebook_edit`

```typescript
{
  name: "notebook_edit",
  description: "Edit a Jupyter notebook cell.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      cell_id: { type: "string" },
      new_source: { type: "string" },
      is_new_cell: { type: "boolean", default: false },
      cell_language: { type: "string", enum: ["python", "markdown", "raw"] }
    },
    required: ["path", "new_source"],
    additionalProperties: false
  }
}
```

---

### 2.6 `multiedit`

```typescript
// 의도: 한 파일 다중 hunk. UX상 edit_file 연속 호출로 대체 가능
{
  name: "multiedit",
  description: "Apply multiple search-replace hunks to one file atomically when possible.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      edits: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            old_string: { type: "string" },
            new_string: { type: "string" }
          },
          required: ["old_string", "new_string"]
        }
      }
    },
    required: ["path", "edits"],
    additionalProperties: false
  }
}
```

---

## 3. Review UI (PendingStore · Keep/Undo)

`Extension_high_impact.md` B절 Review UI — **Phase C2~C4**.

```
edit_file / write_file 성공
  → PendingStore.add({ path, before, after, hunks })
  → Chat Webview: Review · N files 배너
  → Keep / Undo / Keep All / Undo All / Open Diff
```

| UI | 동작 |
|----|------|
| 파일 그룹 | `path · +/− · [Keep][Undo][Diff]` |
| hunk 미리보기 | 컨텍스트 ±N줄만 (전문 금지) |
| Keep | overlay 제거, checkpoint accepted |
| Undo | before 스냅샷 → `WorkspaceEdit` 복구 |

완료 기준: 파일 그룹 배너 · 일부 미리보기 · Keep/Undo All · 세션 종료 시 Pending 정책 명시.

상세: `PRD-09_MultiFile_Apply_PatchReview.md`.

---

## 4. Tier Availability Matrix

| 도구 | Tier A (Flash) | Tier B (Pro) |
|------|----------------|--------------|
| `edit_file` (S–R) | ✅ | ✅ |
| `write_file` (new/short) | ✅ | ✅ |
| `delete_file` | 🔒 LOCKED (ask/ban) | ✅ (승인) |
| `reapply` | 🔒 | ✅ |
| `notebook_edit` | ⚪ | ✅ |
| `multiedit` | ⚪ (`edit_file`×N 권장) | ✅ |

**Tier A LOCKED (관련)**: 임의 전체 overwrite, bulk MCP, Browser, multi-subagent.

> Tier A **CAN** use allowlisted `run_terminal_cmd` (see C) — terminal is not banned for Tier A.

---

## 5. Mode Whitelist Notes

| Mode | Edit · File |
|------|-------------|
| **Ask** | ❌ 전부 차단 (디스크 변경 0) |
| **Agent** | 정책 전체 (`edit_file`/`write_file` + Review) |
| **Plan** | ❌ 코드 쓰기 금지 (계획 md는 별도 Plan 파이프라인) |
| **Debug** | 최소 패치용 `edit_file` 허용; 계측은 **G** 도구 |

---

## 6. MVP vs Full Set Mapping

| 단계 | 포함 |
|------|------|
| **C1** | 편집 도구 없음 |
| **C2~C3 MVP** | `edit_file`, `write_file` + Review UI 기초 |
| **C4+** | + `delete_file`, Pending/checkpoint 연동, Keep/Undo All |
| **C5~C7** | + `notebook_edit`, `multiedit`, `reapply` |

---

## 7. Acceptance Criteria

- [ ] Given existing long file, When `write_file` called, Then harness rejects and hints `edit_file`
- [ ] Given `edit_file` with non-unique `old_string`, When applied, Then fail with re-read hint (no partial apply)
- [ ] Given successful edit, When UI updates, Then Review banner shows file group + Keep/Undo
- [ ] Given Tier A, When schemas assembled, Then `delete_file` absent; `edit_file`+`write_file`(short) present
- [ ] Primary name in prompts/registry is `edit_file` (alias `apply_patch` ok)

---

## 8. Dependencies

| 관심사 | Owner |
|--------|--------|
| Patch format / staleness | `PRD-Spec-02_Patch_Format.md` |
| Review UI | `PRD-09_MultiFile_Apply_PatchReview.md` |
| Checkpoints | `PRD-Infra-09_Checkpoints_Rollback.md` |
| Permission | `PRD-Infra-05_Permission_Autorun.md` / `PRD-Spec-05_Permission_Autorun.md` |
| C2 Agent | `PRD-C2_Agent_SingleTurn.md` |

---

## 9. Out of Scope

- Semantic search / grep → A  
- Shell로 `sed`/`echo >` 파일 CRUD → 금지 유도, 전용 도구 사용  
- Debug instrumentation insert/remove → G (`add_instrumentation` / `remove_instrumentation`)
