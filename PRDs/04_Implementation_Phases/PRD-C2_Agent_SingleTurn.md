# PRD-C2: Agent 1턴 (Agent Single Turn)

> **Phase**: C2 (C1 Ask 모드 안정화 후)  
> **Priority**: 높음 (첫 쓰기 경험)  
> **관련 PRD**: `PRD-C0_Chat_UI_Streaming.md`, `PRD-C1_Ask_Mode.md`, `PRD-Spec-02_Patch_Format.md`, `PRD-Infra-05_Permission_Autorun.md`

---

## 📋 Quick Reference

| 항목 | 값 |
|------|-----|
| **구현 순서** | C0 → C1 → **C2** |
| **예상 소요** | 3-5일 |
| **핵심 파일** | `src/patches/`, `src/review/`, `src/tools/edit/`, `src/hooks/` |
| **테스트 명령** | `npm test -- src/patches/`, `npm run test:e2e -- tests/e2e/c2-single-turn.spec.ts` |
| **완료 기준** | Diff 승인 후 적용, 자동 lint 검증, 1회 재시도 성공률 80%+ |

---

## 1. Overview

### 목적
Agent 모드에서 **단일 턴(1-turn)** 쓰기 작업을 안전하게 수행한다: 사용자 요청 → 모델이 `edit_file`/`write_file` 호출 → **Diff 프리뷰 + 승인** → 적용 → 완료.

### 비즈니스 가치
- "이 함수에 null 체크 추가해줘" → Diff 확인 → Enter → 끝
- 로컬 모델(Flash)도 Search-Replace 패치로 80% 이상 성공
- 실수 방지: Diff 없이 바로 적용 불가, 항상 사용자 승인

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, "이 함수에 early return 추가해줘"라고 하면 Diff가 뜨고 Enter로 적용되게 하고 싶다 |
| US-02 | 팀 리더로, 로컬 모델이 잘못된 패치를 만들어도 내 승인 없이는 디스크에 안 써지게 하고 싶다 |
| US-03 | 개발자로서, 패치 적용 후 바로 `read_lints`로 검증돼서 에러 있으면 바로 다시 고치게 하고 싶다 |

---

## 2. Sequence Diagram: Single Turn Write Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant ChatUI as Chat Webview
    participant Loop as AgentLoopController
    participant Provider as LLM Provider
    participant Registry as ToolRegistry
    participant Executor as ToolExecutor
    participant Applier as PatchApplier
    participant Review as ReviewUI (Webview)
    participant Hooks as HookSystem
    participant Checkpoint as CheckpointManager
    participant Lint as LintRunner

    User->>ChatUI: "Add null check to getUser()"
    ChatUI->>Loop: sendMessage(text, mode='agent')
    
    Loop->>Provider: chatCompletionStream(messages, tools=[edit_file, read_file...])
    Provider-->>Loop: stream: tool_call {name: "edit_file", args: {...}}
    
    Loop->>Registry: validate tool schema (edit_file allowed in agent mode)
    Registry-->>Loop: OK
    
    Loop->>ChatUI: tool_call_start {id, name: "edit_file", args}
    ChatUI->>ChatUI: show "Editing..." in timeline
    
    Loop->>Executor: execute(edit_file, args)
    Executor->>Applier: apply(patchDocument)
    
    par Patch Processing
        Applier->>Applier: parse Search-Replace
        Applier->>Applier: validate unique match (0 or 2+ = error)
        Applier->>Applier: check staleness (mtime/hash)
        Applier->>Checkpoint: create('pre-edit')
        Applier->>Executor: WorkspaceEdit.replace() atomic
    end
    
    alt Apply Success
        Executor-->>Loop: ToolResult {success: true, diff: {...}}
        Loop->>Hooks: runPostToolUse(edit_file, result)
        
        par Auto-Verification (Hook)
            Hooks->>Lint: read_lints(touchedFiles)
            Lint-->>Hooks: errors[]
            alt Lint Errors Found
                Hooks->>Hooks: injectVerificationError(errors, retryCount=1)
                Hooks-->>Loop: Modified ToolResult with lint errors
                Loop->>Provider: chatCompletionStream (with lint errors)
                Provider-->>Loop: stream: tool_call {name: "edit_file", args: fix}
                Loop->>Executor: execute(edit_file, fixArgs)
                Executor->>Applier: apply(fixPatch)
                Applier-->>Executor: success
                Executor-->>Loop: ToolResult {success: true}
            end
        end
        
        Loop->>Review: pushPendingChanges(diffData)
        Review->>ChatUI: postMessage({type: "review/upsert", files: [...]})
        ChatUI->>ChatUI: render Diff banner + file list
    else Apply Failed
        Checkpoint->>Applier: restore(checkpointId)
        Executor-->>Loop: ToolResult {error: "..."}
    end
    
    Loop->>ChatUI: tool_result {id, output, metadata}
    ChatUI->>ChatUI: update timeline "Edited 2 files" (collapsed group)
    
    User->>Review: click "Apply Selected" / "Keep" / "Undo"
    Review->>Loop: reviewAction {filePath, action: 'keep'|'undo'}
    Loop->>Executor: confirm or revert via checkpoint
    Loop->>ChatUI: final confirmation
```

---

## 3. Functional Requirements

### 3.1 단일 턴 쓰기 플로우
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 모델 도구 호출 | Agent 모드에서 `edit_file`/`write_file` 호출 시 즉시 중단하지 않고 Diff 수집 |
| FR-02 | Diff 프리뷰 렌더링 | 통합 Diff Webview: 파일별, 헌크별 체크박스, 라인 번호, 색상(빨강/초록) |
| FR-03 | 사용자 액션 | [적용] [선택 적용] [취소] [수정 후 재시도] 버튼 |
| FR-04 | 부분 적용 | 파일 단위/헌크 단위 체크박스로 선택적 적용 |
| FR-05 | 적용 실행 | `WorkspaceEdit` 원자적 적용 → 성공/실패 결과 반환 |
| FR-06 | 자동 검증 (옵션) | 적용 직후 `read_lints` 실행 → 에러 있으면 모델에 재주입 (최대 1회 재시도) |

### 3.2 Diff 포맷 및 파싱
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-07 | Search-Replace 포맷 | `*** Begin Patch\n*** Update File: path\noldExactLines\n*** End Patch` |
| FR-08 | 유일 매칭 검증 | Search 블록이 파일에서 **정확히 1회** 매칭돼야 함 (0회/2회+ → 에러) |
| FR-09 | Staleness 체크 | 마지막 `read_file` 후 파일 mtime/hash 변경 시 → "파일 변경됨, 다시 읽으세요" 에러 |
| FR-10 | 멀티 헌크 병합 | 동일 파일 다중 헌크 → 라인 번호 재계산 후 단일 `WorkspaceEdit`로 병합 |

### 3.3 승인 UI
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-11 | Diff 웹뷰 | 좌측 원본 / 우측 제안 (Side-by-side) 또는 Unified (토글) |
| FR-12 | 헌크 내비게이션 | `n`/`p` 다음/이전 헌크, `Space` 토글, `Enter` 적용 |
| FR-13 | 파일 트리 | 좌측 패널: 변경 파일 목록, +/- 라인 수, 체크박스 |
| FR-14 | 키보드 단축키 | `Ctrl+Enter` 전체 적용, `Ctrl+Shift+Enter` 선택 적용, `Esc` 취소 |

---

## 4. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | Diff 렌더링 지연 | 50 파일 × 200 라인 < 500ms |
| NFR-02 | 적용 원자성 | 하나라도 실패 시 전체 롤백 (체크포인트 자동 복원) |
| NFR-03 | Staleness 감지율 | 100% (mtime + xxhash64) |
| NFR-04 | 재시도율 감소 | 자동 `read_lints` 후 재시도 시 1회 내 수정 성공률 > 80% |

---

## 5. API & Technical Spec

### 5.1 패치 파서 & 적용기 (`src/patches/applier.ts`)

```typescript
export interface SearchReplaceHunk {
  search: string;      // 원본 코드 (최소 3줄, 유일 매칭)
  replace: string;     // 새 코드
  filePath: string;
  lineStart?: number;  // 힌트 (파싱 시 계산)
}

export interface PatchDocument {
  hunks: SearchReplaceHunk[];
  metadata: { generatedBy: string; timestamp: number };
}

// 파서: 모델 응답에서 *** Begin Patch ... *** End Patch 추출
export function parsePatches(text: string): PatchDocument {
  const regex = /\*\*\* Begin Patch\n([\s\S]*?)\n\*\*\* End Patch/g;
  const hunks: SearchReplaceHunk[] = [];
  
  for (const match of text.matchAll(regex)) {
    const patch = match[1];
    const fileMatch = patch.match(/^\*\*\* Update File: (.+)$/m);
    if (!fileMatch) continue;
    const filePath = fileMatch[1].trim();
    
    // 헌크 분할: *** Update File: ... 이나 *** Add File: ... 로 분할
    const hunkRegex = /^\*\*\* (?:Update|Add) File: .+$\n([\s\S]*?)(?=\n\*\*\* (?:Update|Add|Delete) File:|\n\*\*\* End Patch)/gm;
    for (const hunkMatch of patch.matchAll(hunkRegex)) {
      const hunkBody = hunkMatch[1];
      const [search, replace] = hunkBody.split('\n***\n').map(s => s.trim());
      if (search && replace) {
        hunks.push({ search, replace, filePath });
      }
    }
  }
  return { hunks, metadata: { generatedBy: 'model', timestamp: Date.now() } };
}

// 적용기: 유일 매칭 + WorkspaceEdit 생성
export class PatchApplier {
  constructor(
    private fs: vscode.FileSystem,
    private checkpointMgr: CheckpointManager,
    private config: ApplierConfig
  ) {}

  async apply(patch: PatchDocument): Promise<ApplyResult> {
    // 1. 파일별 헌크 그룹화
    const byFile = new Map<string, SearchReplaceHunk[]>();
    for (const hunk of patch.hunks) {
      byFile.set(hunk.filePath, [...(byFile.get(hunk.filePath) || []), hunk]);
    }

    // 2. 체크포인트 생성 (첫 쓰기 전)
    const checkpointId = await this.checkpointMgr.create('patch-apply');

    // 3. 각 파일 검증 + WorkspaceEdit 구성
    const edit = new vscode.WorkspaceEdit();
    for (const [filePath, hunks] of byFile) {
      const doc = await vscode.workspace.openTextDocument(filePath);
      const content = doc.getText();
      const lines = content.split('\n');

      // Staleness 체크
      const stat = await this.fs.stat(vscode.Uri.file(filePath));
      if (hunks[0].lineStart && stat.mtime > hunks[0].lineStart) {
        return { success: false, error: `File modified since read: ${filePath}` };
      }

      // 헌크별 적용 (라인 번호 재계산)
      let offset = 0;
      for (const hunk of hunks) {
        const searchLines = hunk.search.split('\n');
        const replaceLines = hunk.replace.split('\n');
        
        // 유일 매칭 검색
        const matchIdx = this.findUniqueMatch(lines, searchLines, hunk.lineStart);
        if (matchIdx === -1) {
          await this.checkpointMgr.restore(checkpointId);
          return { success: false, error: `Hunk not found or multiple matches in ${filePath}` };
        }

        const range = new vscode.Range(matchIdx + offset, 0, matchIdx + offset + searchLines.length, 0);
        edit.replace(vscode.Uri.file(filePath), range, replaceLines.join('\n'));
        offset += replaceLines.length - searchLines.length;
      }
    }

    // 4. 원자적 적용
    const success = await vscode.workspace.applyEdit(edit);
    if (!success) {
      await this.checkpointMgr.restore(checkpointId);
      return { success: false, error: 'WorkspaceEdit apply failed' };
    }

    // 5. 적용 후 자동 린트 검증 (옵션)
    if (this.config.autoLint) {
      const lintResult = await this.runLint(patch.hunks.map(h => h.filePath));
      if (lintResult.errors.length > 0) {
        return { success: true, lintErrors: lintResult.errors, needsRetry: true };
      }
    }

    return { success: true };
  }

  private findUniqueMatch(lines: string[], search: string[], hint?: number): number {
    const matches: number[] = [];
    for (let i = 0; i <= lines.length - search.length; i++) {
      if (lines.slice(i, i + search.length).join('\n') === search.join('\n')) {
        matches.push(i);
      }
    }
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) return -1;
    // 힌트 라인 근처 우선
    if (hint !== undefined) {
      const near = matches.find(m => Math.abs(m - hint) < 5);
      if (near !== undefined) return near;
    }
    return -1; // 다중 매칭
  }
}
```

### 5.2 Diff 프리뷰 Webview (`src/views/patchPreview.ts`)

```html
<!-- Diff Webview Layout -->
<div class="patch-preview">
  <header>
    <h2>Review Changes (<span id="fileCount">0</span> files, <span id="hunkCount">0</span> hunks)</h2>
    <div class="actions">
      <input type="search" placeholder="Filter files..." id="filter">
      <button id="applySelected" class="primary">Apply Selected (<span id="selCount">0</span>)</button>
      <button id="applyAll">Apply All</button>
      <button id="cancel">Cancel</button>
    </div>
  </header>
  
  <div class="panes">
    <!-- 좌측: 파일 트리 -->
    <aside class="file-tree" id="fileTree">
      <div class="file-item" data-path="src/auth.ts" data-checked="true">
        <input type="checkbox" class="file-check" checked>
        <span class="icon modified">📝</span>
        <span class="path">src/auth.ts</span>
        <span class="stats">+12 -5</span>
      </div>
      <div class="file-item" data-path="src/utils/newHelper.ts" data-checked="true">
        <input type="checkbox" class="file-check" checked>
        <span class="icon new">✨</span>
        <span class="path">src/utils/newHelper.ts</span>
        <span class="stats">+45 -0</span>
      </div>
    </aside>

    <!-- 우측: Diff 뷰 -->
    <section class="diff-view" id="diffView">
      <div class="diff-header">
        <span class="file-path">src/auth.ts</span>
        <div class="hunk-nav">
          <button class="prev-hunk" title="Previous hunk (p)">↑</button>
          <span class="hunk-counter">Hunk 1/3</span>
          <button class="next-hunk" title="Next hunk (n)">↓</button>
        </div>
      </div>
      <div class="diff-content unified">
        <div class="hunk" data-index="0">
          <div class="hunk-header">
            <input type="checkbox" class="hunk-check" checked>
            <span>@@ -10,7 +10,7 @@ function login()</span>
          </div>
          <div class="diff-line context">  const user = await findUser(email);</div>
          <div class="diff-line removed">-  if (!user) throw new Error('Not found');</div>
          <div class="diff-line added">+  if (!user) throw new AuthError('User not found');</div>
          <div class="diff-line context">  return generateToken(user);</div>
        </div>
        <div class="hunk" data-index="1">...</div>
      </div>
    </section>
  </div>
</div>
```

---

## 6. UI/UX Specification

### 6.1 Diff 프리뷰 레이아웃
```
┌─ Patch Review (12 files, 47 hunks) ────────────────────────────────────────┐
│ 🔍 [Filter...]                    [Apply Selected (8)] [Apply All] [Cancel] │
├──────────────────────────────────────────────────────────────────────────────┤
│ ▼ src/                            ▼ tests/                                   │
│   ☑ auth.ts            +12 -5     ☐ auth.test.ts       +8 -2               │
│   ☑ token.ts           +5  -3     ☐ token.test.ts      +3 -1               │
│   ☐ middleware.ts      +20 -10    ☑ utils.test.ts      +15 -0              │
│   ✨ newHelper.ts      +45 -0     ✨ fixtures.ts       +30 -0              │
│   🗑 deprecated.ts     -15 -0                                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│ src/auth.ts                                    Hunk 1/3  [↑] [↓]            │
│ ☑ @@ -10,7 +10,7 @@ function login()                                     │
│   const user = await findUser(email);                                       │
│  -  if (!user) throw new Error('Not found');                               │
│  +  if (!user) throw new AuthError('User not found');                      │
│   return generateToken(user);                                               │
│                                                                             │
│ ☐ @@ -45,6 +45,10 @@ function refresh()                                    │
│   ...                                                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 키보드 단축키
| 키 | 액션 |
|----|------|
| `j` / `k` | 파일 트리 위/아래 |
| `Space` | 파일/헝크 체크 토글 |
| `Enter` | 파일 선택 → Diff 뷰 포커스 |
| `n` / `p` | 다음/이전 헌크 |
| `Space` (Diff 포커스) | 헌크 체크 토글 |
| `Ctrl+Enter` | 전체 적용 |
| `Ctrl+Shift+Enter` | 선택된 것만 적용 |
| `Esc` | 취소/닫기 |

---

## 7. Acceptance Criteria

```gherkin
Feature: Multi-file Apply & Patch Review

  Scenario: Review and selectively apply 10-file refactor
    Given agent proposes edits for 10 files in one turn
    When patch review UI opens
    Then all 10 files listed with stats
    And user can uncheck 2 files
    And clicks "Apply Selected"
    Then only 8 files modified
    And checkpoint created before apply
    And "Undo" toast appears for 10s

  Scenario: Hunk-level selection
    Given a file with 3 hunks
    When user unchecks hunk 2 in diff view
    And clicks "Apply Selected"
    Then only hunks 1 & 3 applied to that file
    And hunk 2 remains unchanged

  Scenario: Stale file detection warns user
    Given file was read at turn 3
    And user edited and saved file externally at turn 5
    When agent proposes edit at turn 7
    Then review shows ⚠️ "File modified externally" badge
    And applying shows confirmation dialog

  Scenario: Apply failure rolls back all
    Given 5 files to apply, 3rd file has permission error
    When apply executes
    Then no files modified
    And error reported for failed file
    And checkpoint still available for manual retry

  Scenario: Auto-lint after apply triggers retry
    Given auto-lint enabled
    And agent applies edit introducing TypeScript error
    When lint runs post-apply
    Then error detected, passed to model
    And model retries fix in next turn (max 1 retry)
```

---

## 8. Test Plan

| 테스트 파일 | 설명 | 커버리지 목표 |
|------------|------|---------------|
| `src/patches/parser.test.ts` | Search-Replace 파싱, 유일 매칭, staleness | 100% |
| `src/patches/applier.test.ts` | WorkspaceEdit 생성, 체크포인트 연동, 롤백 | 95% |
| `src/review/pendingStore.test.ts` | Pending 변경사항 상태 관리, 파일/헌크 선택 | 90% |
| `src/review/reviewUIProvider.test.ts` | Diff 렌더링, 가상화, 키보드 내비게이션 | 85% |
| `src/hooks/autoVerificationHook.test.ts` | Post-edit lint 실행, 에러 주입, 재시도 카운트 | 95% |
| `tests/e2e/c2-single-turn.spec.ts` | 전체 플로우: 요청 → edit_file → Diff → 적용 → 검증 | E2E |

### 실행 명령어
```bash
# 단위 테스트
npm test -- src/patches/parser.test.ts
npm test -- src/patches/applier.test.ts
npm test -- src/hooks/autoVerificationHook.test.ts

# E2E 테스트 (VS Code Extension Test Host)
npm run test:e2e -- tests/e2e/c2-single-turn.spec.ts

# 전체 테스트 + 커버리지
npm test -- --coverage

# 성능 벤치마크 (Diff 렌더링)
npm run bench:diff
```

---

## 9. Implementation Checklist

| 단계 | 작업 | 파일 생성/수정 | 완료 기준 |
|------|------|----------------|-----------|
| 1 | `PatchDocument` 파서 + Search-Replace 검증 | `src/patches/parser.ts` (신규) | 단위 테스트 100% 통과 |
| 2 | `PatchApplier` + 유일 매칭 + Staleness + WorkspaceEdit | `src/patches/applier.ts` (신규) | 50파일 적용 < 2초, 롤백 검증 |
| 3 | Diff Webview (파일 트리 + 통합 Diff + 가상화) | `src/review/ReviewUIProvider.tsx` (신규) | 50파일 렌더 < 500ms |
| 4 | 키보드 내비게이션 + 체크박스 상태 동기화 | `src/review/DiffView.tsx` (신규) | 접근성 테스트 통과 |
| 5 | 체크포인트 연동 + 자동 린트 + 재시도 플로우 | `src/hooks/AutoVerificationHook.ts` (신규) | 1회 재시도 후 성공률 > 80% |
| 6 | 부분 실패 시 롤백 + 체크포인트 복원 | `src/patches/applier.ts` (수정) | 실패 시 전체 롤백 확인 |
| 7 | 통합 E2E: 10파일 리팩터링 → 선택 적용 → 검증 | `tests/e2e/c2-single-turn.spec.ts` (신규) | CI 그린 |

---

## 10. Debugging Tips

```bash
# 1. 패치 파싱 디버그
# Extension 콘솔:
# [PATCH] Parsed 3 hunks from model response
# [PATCH] File: src/auth.ts, Hunks: 2
# [PATCH] Unique match: true, Line: 42

# 2. Diff Webview 검사
# F12 → Webview Developer Tools:
# > window.agentK.debug.review.getPendingChanges()

# 3. 체크포인트 상태
# > window.agentK.debug.checkpoint.list()
# > window.agentK.debug.checkpoint.restore('patch-apply-123')

# 4. 자동 검증 훅 로그
# [HOOK] PostToolUse: auto-verification
# [HOOK] Lint errors found: 2, retryCount: 1
# [HOOK] Injected verification error into tool_result
```

---

## Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-Spec-02_Patch_Format.md` | 선행 | Search-Replace 파서, 유일 매칭 |
| `PRD-C1_Ask_Mode.md` | 선행 | 읽기 도구 안정화 |
| `PRD-Infra-05_Permission_Autorun.md` | 선행 | 승인 게이트 (Diff 승인 = 기본 ask) |
| `PRD-Infra-09_Checkpoints_Rollback.md` | 선행 | 체크포인트 생성/복원 |
| `vscode.WorkspaceEdit` | 런타임 | 원자적 적용 API |

---

## Out of Scope

- 해당 Phase 밖 기능을 완료로 간주하지 말 것 (특히 Browser=C7)
- 상세: `00_Master_Context.md` Non-Goals

## References

- `PRD-Spec-02_Patch_Format.md` — Search-Replace 포맷 상세
- `PRD-Infra-09_Checkpoints_Rollback.md` — 체크포인트/롤백
- VS Code WorkspaceEdit: https://code.visualstudio.com/api/references/vscode-api#WorkspaceEdit