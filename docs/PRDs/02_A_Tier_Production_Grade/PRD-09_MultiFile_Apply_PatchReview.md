# PRD-09: 멀티파일 Apply / 패치 리뷰 UI (Multi-file Apply & Patch Review UI)

> **Priority**: A급 (한 번에 여러 파일 수정)  
> **Phase**: C4 (C2~C3 단일 파일 수정 안정화 후)  
> **관련 PRD**: `PRD-C2_Agent_SingleTurn.md`, `PRD-Spec-02_Patch_Format.md`, `PRD-Infra-09_Checkpoints_Rollback.md`

---

## 1. Overview

### 목적
에이전트가 **여러 파일을 한 턴에 수정**할 때, 각 파일의 Diff를 **통합 리뷰 UI**에서 확인하고 **파일 단위/헌크 단위**로 선택 적용한다. Cursor의 "멀티파일 에디트" UX를 확장으로 구현.

### 비즈니스 가치
- 대규모 리팩터링(10~50파일) 한 번에 검토·적용
- 실수 수정(잘못된 파일) 방지: 파일별 체크박스 + 헌크별 세부 제어
- 적용 전 체크포인트 자동 생성 → 실패 시 원클릭 롤백

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, "전역 import 경로 @/ → @src/ 로 바꿔줘" 하면 30개 파일 Diff가 한 화면에 뜨고 선택 적용하고 싶다 |
| US-02 | 개발자로서, 30개 중 2개 파일만 맘에 안 들면 그 2개만 체크 해제하고 나머지 적용하고 싶다 |
| US-03 | 개발자로서, 적용 후 테스트 깨지면 "Undo All"로 1초 만에 원상복구하고 싶다 |

---

## 2. Functional Requirements

### 2.1 멀티파일 패치 수집
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 도구 호출 수집 | 한 턴 내 `edit_file`/`write_file` 다중 호출 → 패치 블록 배열로 수집 |
| FR-02 | 파일별 병합 | 동일 파일 다중 헌크 → 단일 Diff로 병합 (라인 번호 재계산) |
| FR-03 | 충돌 감지 | 동일 파일 중복 헌크, 스테일니스(mtime/hash 변경) → 경고 표시 |
| FR-04 | 신규/삭제 구분 | `write_file`(신규), `delete_file`(삭제) 아이콘 구분 |

### 2.2 패치 리뷰 UI (Webview)
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-05 | 파일 트리 | 좌측: 변경 파일 목록 (아이콘: 신규/수정/삭제, +/- 라인 수) |
| FR-06 | 통합 Diff 뷰 | 우측: 선택 파일 Side-by-side 또는 Unified Diff |
| FR-07 | 파일 단위 체크박스 | 파일 행 좌측 ☑ → 해당 파일 전체 헌크 토글 |
| FR-08 | 헌크 단위 체크박스 | Diff 내 각 헌크 좌측 ☑ → 세부 선택 |
| FR-09 | 검색/필터 | 파일명, 변경 유형(추가/수정/삭제), 내용 검색 |
| FR-10 | 키보드 내비게이션 | `j/k` 파일 이동, `n/p` 헌크 이동, `Space` 토글, `Enter` Diff 포커스 |
| FR-11 | 적용 버튼 | [선택된 것만 적용] [모두 적용] [취소] |

### 2.3 적용 및 롤백
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-12 | 원자적 적용 | `WorkspaceEdit`으로 전체 적용 (하나라도 실패하면 전체 롤백) |
| FR-13 | 체크포인트 자동 생성 | 적용 직전 `CheckpointManager.create()` → 타임라인에 노드 추가 |
| FR-14 | Undo 토스트 | 적용 후 10초간 "전체 되돌리기" 토스트 표시 |
| FR-15 | 부분 실패 처리 | 일부 파일 적용 실패 시 성공분만 유지 + 실패 목록 보고 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | Diff 렌더링 성능 | 50파일 × 200라인 < 1초 렌더링 (가상화) |
| NFR-02 | 메모리 | Diff 데이터 < 50MB |
| NFR-03 | 체크포인트 생성 시간 | < 500ms (전체 워크스페이스 스냅샷) |
| NFR-04 | 롤백 시간 | < 1초 |

---

## 4. API & Technical Spec

### 4.1 패치 수집기 (`src/patches/collector.ts`)

```typescript
export interface CollectedPatch {
  filePath: string;
  isNew: boolean;
  isDeleted: boolean;
  hunks: SearchReplaceHunk[];
  originalContent?: string;  // 스테일니스 체크용
  originalHash?: string;
}

export class PatchCollector {
  private patches: CollectedPatch[] = [];
  private fileReadCache = new Map<string, { content: string; hash: string; mtime: number }>();

  recordEdit(filePath: string, hunks: SearchReplaceHunk[], isNew = false): void {
    const existing = this.patches.find(p => p.filePath === filePath);
    if (existing) {
      existing.hunks.push(...hunks);
    } else {
      this.patches.push({ filePath, isNew, isDeleted: false, hunks });
    }
  }

  recordWrite(filePath: string, content: string): void {
    this.patches.push({ filePath, isNew: true, isDeleted: false, hunks: [], originalContent: content });
  }

  recordDelete(filePath: string): void {
    this.patches.push({ filePath, isNew: false, isDeleted: true, hunks: [] });
  }

  async finalize(): Promise<CollectedPatch[]> {
    // 1. 원본 파일 읽기 (캐시 활용) + 해시 계산
    for (const patch of this.patches) {
      if (!patch.isNew && !patch.isDeleted) {
        const content = await this.readFileCached(patch.filePath);
        patch.originalContent = content;
        patch.originalHash = xxhash64(content);
      }
    }
    // 2. 동일 파일 헌크 병합 + 라인 번호 재계산
    for (const patch of this.patches) {
      if (patch.hunks.length > 1) {
        patch.hunks = this.mergeHunks(patch.hunks, patch.originalContent);
      }
    }
    // 3. 스테일니스 체크
    for (const patch of this.patches) {
      if (patch.originalHash) {
        const current = await this.readFileCached(patch.filePath);
        if (xxhash64(current) !== patch.originalHash) {
          patch.stale = true;
        }
      }
    }
    return this.patches;
  }

  private async readFileCached(path: string): Promise<string> {
    const cached = this.fileReadCache.get(path);
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(path));
    if (cached && cached.mtime === stat.mtime) return cached.content;
    const content = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(path))).toString('utf8');
    this.fileReadCache.set(path, { content, hash: xxhash64(content), mtime: stat.mtime });
    return content;
  }

  private mergeHunks(hunks: SearchReplaceHunk[], original: string): SearchReplaceHunk[] {
    // 라인 번호 기준 정렬, 겹치는 헌크 병합, 중복 제거
    // 구현 생략: 라인 단위 병합 알고리즘
    return hunks;
  }
}
```

### 4.2 패치 리뷰 Webview (`src/views/patchReview.ts`)

```typescript
// Webview로 전달할 데이터 구조
interface PatchReviewData {
  patches: PatchViewModel[];
  checklist: { filePath: string; checked: boolean; hunks: { index: number; checked: boolean }[] }[];
}

interface PatchViewModel {
  filePath: string;
  isNew: boolean;
  isDeleted: boolean;
  isStale: boolean;
  lineChanges: { added: number; removed: number };
  hunks: HunkViewModel[];
}

interface HunkViewModel {
  index: number;
  search: string;
  replace: string;
  startLine: number;
  endLine: number;
  checked: boolean;
}
```

```html
<!-- Webview HTML 구조 -->
<div class="patch-review">
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
        <span class="badge stale" hidden>STALE</span>
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

### 4.3 적용 실행기 (`src/patches/applier.ts`)

```typescript
export class PatchApplier {
  constructor(
    private checkpointManager: CheckpointManager,
    private patchCollector: PatchCollector
  ) {}

  async apply(patches: CollectedPatch[], options: { selectedFiles?: string[]; selectedHunks?: Map<string, number[]> } = {}): Promise<ApplyResult> {
    // 1. 필터링
    const toApply = patches.filter(p => 
      !options.selectedFiles || options.selectedFiles.includes(p.filePath)
    ).map(p => ({
      ...p,
      hunks: options.selectedHunks?.get(p.filePath) 
        ? p.hunks.filter((_, i) => options.selectedHunks!.get(p.filePath)!.includes(i))
        : p.hunks
    }));

    // 2. 체크포인트 생성
    const checkpointId = await this.checkpointManager.create('Multi-file apply');

    // 3. WorkspaceEdit 구성
    const edit = new vscode.WorkspaceEdit();
    for (const patch of toApply) {
      const uri = vscode.Uri.file(patch.filePath);
      if (patch.isNew) {
        edit.createFile(uri, { overwrite: true });
        edit.insert(uri, new vscode.Position(0, 0), patch.originalContent || '');
      } else if (patch.isDeleted) {
        edit.deleteFile(uri);
      } else {
        for (const hunk of patch.hunks) {
          const range = this.findRange(patch.originalContent!, hunk.search);
          if (!range) throw new Error(`Hunk not found in ${patch.filePath}`);
          edit.replace(uri, range, hunk.replace);
        }
      }
    }

    // 4. 원자적 적용
    const success = await vscode.workspace.applyEdit(edit);
    if (!success) {
      await this.checkpointManager.restore(checkpointId);
      return { success: false, error: 'WorkspaceEdit apply failed', checkpointId };
    }

    // 5. 적용 후 검증 (선택적)
    // await this.verifyApplied(toApply);

    return { success: true, appliedFiles: toApply.map(p => p.filePath), checkpointId };
  }

  private findRange(content: string, search: string): vscode.Range | null {
    const lines = content.split('\n');
    const searchLines = search.split('\n');
    for (let i = 0; i <= lines.length - searchLines.length; i++) {
      if (lines.slice(i, i + searchLines.length).join('\n') === searchLines.join('\n')) {
        return new vscode.Range(i, 0, i + searchLines.length, 0);
      }
    }
    return null;
  }
}
```

---

## 5. UI/UX Specification

### 5.1 리뷰 패널 레이아웃
```
┌─ Multi-file Review (12 files, 47 hunks) ────────────────────────────────────┐
│ 🔍 [Filter...]                    [Apply Selected (8)] [Apply All] [Cancel]  │
├──────────────────────────────────────────────────────────────────────────────┤
│ ▼ src/                            ▼ tests/                                   │
│   ☑ auth.ts            +12 -5     ☐ auth.test.ts        +8 -2              │
│   ☑ token.ts           +5  -3     ☐ token.test.ts       +3 -1              │
│   ☐ middleware.ts      +20 -10    ☑ utils.test.ts       +15 -0             │
│   ✨ newHelper.ts      +45 -0     ✨ fixtures.ts        +30 -0             │
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

### 5.2 키보드 단축키
| 키 | 액션 |
|----|------|
| `j` / `k` | 파일 트리 위/아래 이동 |
| `Space` | 파일 체크 토글 |
| `Enter` | 파일 선택 → Diff 뷰 포커스 |
| `n` / `p` | 다음/이전 헌크 |
| `Space` (Diff 포커스 시) | 헌크 체크 토글 |
| `a` | 전체 적용 |
| `s` | 선택된 것만 적용 |
| `Esc` | 취소/닫기 |

---

## 6. Acceptance Criteria

```gherkin
Feature: Multi-file Apply & Patch Review

  Scenario: Review and selectively apply 10-file refactor
    Given agent proposes 10 file edits in one turn
    When review panel opens
    Then all 10 files listed with stats
    And user can uncheck 2 files
    And clicks "Apply Selected"
    Then only 8 files modified
    And checkpoint created before apply
    And "Undo All" toast appears for 10s

  Scenario: Hunk-level selection
    Given a file with 3 hunks
    When user unchecks hunk 2 in diff view
    And applies
    Then only hunks 1 & 3 applied to that file

  Scenario: Stale file warning
    Given user edited file externally after agent read it
    When review panel opens
    Then file shows "STALE" badge
    And applying shows confirmation dialog

  Scenario: Rollback via checkpoint
    Given multi-file apply completed
    When user clicks "Undo All" within 10s
    Then all files revert to pre-apply state
    And checkpoint removed from timeline

  Scenario: Partial failure handling
    Given one file has permission error on apply
    When apply executes
    Then other files applied successfully
    And error reported for failed file
    And checkpoint still available for full rollback
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-C2_Agent_SingleTurn.md` | 선행 | 단일 파일 edit_file 안정화 |
| `PRD-Spec-02_Patch_Format.md` | 선행 | Search-Replace 파서/검증 |
| `PRD-Infra-09_Checkpoints_Rollback.md` | 선행 | 체크포인트 생성/복원 |
| `vscode.WorkspaceEdit` | 런타임 | 원자적 적용 API |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | PatchCollector + SearchReplaceHunk 병합/스테일니스 | 패치 데이터 모델 |
| 2 | PatchReview Webview (파일 트리 + Diff 뷰 + 가상화) | 리뷰 UI |
| 3 | 키보드 내비게이션 + 체크박스 상태 동기화 | 키보드 조작 완성 |
| 4 | PatchApplier + WorkspaceEdit + Checkpoint 연동 | 적용/롤백 플로우 |
| 5 | 부분 실패 처리 + 토스트/알림 | 프로덕션 견고성 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| 대량 파일 Diff 렌더링 지연 | 중간 | 가상화 리스트(`react-window` 스타일), 헌크 접기 기본값 |
| 라인 번호 불일치로 헌크 적용 실패 | 높음 | `mergeHunks`에서 라인 재계산, 적용 전 `findRange` 재검증 |
| 체크포인트 용량 과다 | 낮음 | 변경 파일만 스냅샷, 압축 저장, 최대 50개 보관 |

---


## Out of Scope

- Team MCP 마켓 풀 복제 / Cloud 상시 에이전트
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **A급: 멀티파일 Apply / 패치 리뷰 UI**
- VS Code WorkspaceEdit: https://code.visualstudio.com/api/references/vscode-api#WorkspaceEdit