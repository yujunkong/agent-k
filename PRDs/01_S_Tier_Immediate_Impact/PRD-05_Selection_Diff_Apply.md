# PRD-05: 선택 영역 → 수정 제안 + Diff (Selection to Diff Apply)

> **Priority**: S급 (Ctrl+K 대체 70-80%)  
> **Phase**: C2 (Agent 1턴과 공유: Search-Replace + Diff 승인)  
> **관련 PRD**: `PRD-C2_Agent_SingleTurn.md`, `PRD-Spec-02_Patch_Format.md`, `PRD-Infra-05_Permission_Autorun.md`

---

## 1. Overview

### 목적
에디터에서 코드를 **드래그 선택 → 우클릭/단축키 → 자연어 지시** → 모델이 **Search-Replace Diff 생성** → 사용자 승인 후 적용. Cursor `Ctrl+K`의 핵심 UX를 확장 API로 구현.

### 비즈니스 가치
- 컨텍스트 스위칭 없음: 에디터에서 바로 수정
- Diff 프리뷰로 안전성 확보 (로컬 모델 실수 방지)
- 채팅 열 필요 없이 빠른 수정 루프

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, 함수 내부 5줄을 선택하고 "이거 null 체크 추가해줘"라고 말하면 Diff가 떠서 바로 적용하고 싶다 |
| US-02 | 개발자로서, 변수명을 선택하고 "이름을 더 명확하게 바꿔줘"라고 하면 레퍼런스까지 일괄 수정 제안을 받고 싶다 |
| US-03 | 개발자로서, 선택 영역이 빈 줄이면 "여기에 로그 추가해줘"라고 해서 새 코드 삽입 제안을 받고 싶다 |

---

## 2. Functional Requirements

| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 선택 영역 감지 | `vscode.window.activeTextEditor.selection` 비어있지 않을 때 활성화 |
| FR-02 | 진입점 | 컨텍스트 메뉴 "Agent K: Modify Selection", 단축키 `Ctrl+Shift+K` (또는 사용자 지정) |
| FR-03 | 입력 모달 | 소형 입력 박스 (플레이스홀더: "수정 지시..."), Enter로 전송, Esc로 취소 |
| FR-04 | 컨텍스트 구성 | 선택 영역 코드 + 파일 전체 경로 + 주변 ±50줄 + 열려 있는 관련 탭 요약 |
| FR-05 | 모델 프롬프트 | "선택 영역만 수정하라. Search-Replace 포맷으로만 응답하라. 주변 컨텍스트는 참고만." |
| FR-06 | Diff 파싱 | 모델 응답에서 `*** Begin Patch` 블록 추출 → `Search-Replace` 파서 (`Spec-02`) |
| FR-07 | Diff 프리뷰 | 인라인 Diff 에디터 또는 모달 (기존 코드 ↔ 제안 코드, 라인 넘버 표시) |
| FR-08 | 부분 수락 | Diff hunk 단위 체크박스 → 선택한 hunk만 적용 |
| FR-09 | 적용 실행 | `WorkspaceEdit`으로 원자적 적용, 적용 후 체크포인트 생성 (`Infra-09`) |
| FR-10 | 되돌리기 | 적용 후 5초간 "Undo" 토스트, 이후 Command Palette "Agent K: Undo Last Selection Edit" |
| FR-11 | 빈 선택 영역 처리 | 커서 위치 기준 현재 블록(함수/클래스) 자동 확장 또는 새 코드 삽입 모드 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 응답 지연 | 모델 호출→Diff 표시 < 2초 (로컬 Flash) |
| NFR-02 | Diff 정확도 | Search 블록 유일 매칭률 > 95% (중복 매칭 시 거절) |
| NFR-03 | Undo 신뢰도 | 체크포인트 기반 100% 원상 복구 |
| NFR-04 | 대용량 선택 | 500줄 이상 선택 시 경고 + 청크 분할 옵션 |

---

## 4. API & Technical Spec

### 4.1 명령 등록 (`package.json`)

```json
{
  "contributes": {
    "commands": [
      {
        "command": "agentK.modifySelection",
        "title": "Agent K: Modify Selection",
        "category": "Agent K",
        "icon": "$(edit)"
      }
    ],
    "menus": {
      "editor/context": [
        { "command": "agentK.modifySelection", "when": "editorHasSelection", "group": "navigation@1" }
      ],
      "editor/title": [
        { "command": "agentK.modifySelection", "when": "editorHasSelection", "group": "navigation" }
      ]
    },
    "keybindings": [
      { "command": "agentK.modifySelection", "key": "ctrl+shift+k", "when": "editorHasSelection" }
    ]
  }
}
```

### 4.2 구현 (`src/features/selectionEdit.ts`)

```typescript
export async function modifySelection() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    return handleEmptySelection(editor); // FR-11
  }

  const selection = editor.selection;
  const document = editor.document;
  const selectedText = document.getText(selection);
  const filePath = document.uri.fsPath;
  const fullText = document.getText();

  // 주변 컨텍스트 (±50줄)
  const startLine = Math.max(0, selection.start.line - 50);
  const endLine = Math.min(document.lineCount - 1, selection.end.line + 50);
  const contextRange = new vscode.Range(startLine, 0, endLine, 0);
  const contextText = document.getText(contextRange);

  // 입력 모달
  const instruction = await vscode.window.showInputBox({
    placeHolder: '수정 지시 (예: "null 체크 추가", "변수명 명확하게", "try-catch 감싸기")',
    prompt: `선택 영역: ${filePath}:${selection.start.line+1}-${selection.end.line+1}`,
    validateInput: v => v.trim().length < 3 ? '최소 3자 이상 입력하세요' : undefined,
  });
  if (!instruction) return;

  // 모델 호출 (Ask 모드와 유사하지만 쓰기 프롬프트)
  const prompt = buildSelectionPrompt(filePath, selectedText, contextText, instruction);
  
  const response = await provider.chatCompletion({
    model: config.quickEditModel || config.defaultModel,
    messages: [
      { role: 'system', content: SELECTION_EDIT_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1,
    max_tokens: 1024,
    stream: false,
  });

  // 패치 파싱 (Spec-02)
  const patches = parseSearchReplacePatches(response.content);
  if (patches.length === 0) {
    vscode.window.showWarningMessage('유효한 패치를 생성하지 못했습니다. 다시 시도해보세요.');
    return;
  }

  // Diff 프리뷰 (Webview 또는 DiffEditor)
  const approved = await showDiffPreview(patches, document.uri);
  if (!approved) return;

  // 체크포인트 생성 후 적용
  await checkpointManager.create(`Selection edit: ${filePath}:${selection.start.line}`);
  const edit = new vscode.WorkspaceEdit();
  for (const patch of approvedPatches) {
    applyPatchToEdit(edit, document.uri, patch);
  }
  await vscode.workspace.applyEdit(edit);

  vscode.window.showInformationMessage('적용 완료', 'Undo').then(sel => {
    if (sel === 'Undo') checkpointManager.restoreLast();
  });
}

const SELECTION_EDIT_SYSTEM_PROMPT = `당신은 코드 수정 전문가입니다.
규칙:
1. 사용자가 선택한 영역(SECTION)만 수정하세요.
2. 응답은 반드시 Search-Replace 패치 포맷만 포함하세요.
3. SEARCH 블록은 선택 영역 코드와 정확히 일치해야 합니다 (공백/들여쓰기 포함).
4. 설명·마크다운·코드펜스 없이 패치 블록만 출력하세요.
5. 선택 영역이 비어있다면(커서만), 주변 블록을 읽고 적절한 위치에 삽입하는 패치를 만드세요.`;

function buildSelectionPrompt(file: string, selected: string, context: string, instruction: string): string {
  return `파일: ${file}

주변 컨텍스트 (±50줄):
\`\`\`${getLanguageId(file)}
${context}
\`\`\`

선택 영역 (수정 대상):
\`\`\`${getLanguageId(file)}
${selected}
\`\`\`

지시: ${instruction}

위 선택 영역만 수정하는 Search-Replace 패치를 출력하세요.`;
}
```

### 4.3 Diff 프리뷰 Webview (`src/views/selectionDiffPreview.ts`)

```typescript
// Webview HTML 템플릿: 좌측 원본 / 우측 제안, hunk별 체크박스
// 적용 시 선택된 hunk만 WorkspaceEdit에 추가
```

---

## 5. UI/UX Specification

### 5.1 진입 플로우
```
1. 코드 드래그 선택
2. 우클릭 → "Agent K: Modify Selection" (또는 Ctrl+Shift+K)
3. 입력 모달 표시
   ┌─────────────────────────────────┐
   │ 선택 영역: src/auth.ts:42-47    │
   │ [수정 지시 입력...            ] │
   │ [취소]              [전송]      │
   └─────────────────────────────────┘
4. 스트리밍 인디케이터 (모달 내 스피너)
5. Diff 프리뷰 모달
   ┌────────────────────────────────────────────┐
   │ src/auth.ts:42-47                          │
   │ ☑ Hunk 1                                   │
   │ ➖  const token = getToken();              │
   │ ➕  const token = getToken() ?? '';        │
   │                                            │
   │ [취소]  [선택된 것만 적용]  [모두 적용]    │
   └────────────────────────────────────────────┘
6. 적용 완료 토스트 + 5초간 Undo 버튼
```

### 5.2 Diff 프리뷰 색상 (VS Code 테마 연동)
- 삭제: `diffEditor.removedTextBackground` (빨강 계열)
- 추가: `diffEditor.insertedTextBackground` (초록 계열)
- 변경: `diffEditor.modifiedTextBackground` (파랑 계열)

---

## 6. Acceptance Criteria

```gherkin
Feature: Selection to Diff Apply

  Scenario: Modify selected block with null check
    Given user selects lines 10-15 in "src/utils.ts" (a function body)
    When user triggers "Modify Selection" and enters "Add null check for user parameter"
    Then model returns Search-Replace patch
    And diff preview shows the exact selected lines with null check added
    When user clicks "Apply"
    Then file is modified and git diff shows only the null check addition

  Scenario: Rename variable in selection
    Given user selects a variable name "data" in a 20-line block
    When user enters "Rename to userData for clarity"
    Then patch includes all occurrences within the selection
    And references outside selection are NOT modified (scope limited)

  Scenario: Empty selection inserts new code
    Given cursor is at line 50 (empty selection)
    When user triggers command and enters "Add console.log for debugging"
    Then model detects empty selection and wraps current block
    And patch inserts log statement at cursor position

  Scenario: Reject diff preview
    Given diff preview is shown
    When user clicks "Cancel"
    Then no file modifications occur
    And editor state unchanged

  Scenario: Partial hunk acceptance
    Given diff has 3 hunks (two good, one wrong)
    When user unchecks the wrong hunk and clicks "Apply Selected"
    Then only 2 hunks are applied
    And the third hunk is ignored
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-Spec-02_Patch_Format.md` | 선행 | Search-Replace 파서, 유일 매칭 검증 |
| `PRD-C2_Agent_SingleTurn.md` | 병행 | Diff 승인 UI, WorkspaceEdit 적용 공통 로직 |
| `PRD-Infra-09_Checkpoints_Rollback.md` | 후속 | 적용 전 체크포인트, Undo 지원 |
| `PRD-Infra-05_Permission_Autorun.md` | 병행 | 승인 게이트 (기본 ask) |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | 명령 등록 + 선택 영역 감지 + 입력 모달 | 기본 플로우 동작 |
| 2 | 프롬프트 템플릿 + 모델 호출 + 패치 파싱 | Search-Replace 생성 |
| 3 | Diff 프리뷰 Webview (기존/제안, hunk 체크박스) | 시각적 검증 |
| 4 | WorkspaceEdit 적용 + 체크포인트 + Undo 토스트 | 원자적 적용/복구 |
| 5 | 빈 선택 영역 처리 (블록 자동 확장/삽입) | 커서 위치 삽입 지원 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| Search 블록이 파일에서 중복 매칭 | 높음 | `Spec-02`: 유일 매칭 강제, 0건/2건+ → 거절 + 힌트 반환 |
| 모델이 선택 영역 밖 코드 수정 시도 | 중간 | 시스템 프롬프트로 "선택 영역만" 강조, 패치 파싱 시 경로/라인 검증 |
| 큰 선택 영역(>500줄) 토큰 초과 | 중간 | 선택 영역 청크 분할(함수 단위) + 순차 처리 옵션 |
| 적용 후 포맷터(Prettier)가 코드 망침 | 낮음 | 적용 후 `vscode.commands.executeCommand('editor.action.formatDocument')` 옵션 |

---


## Out of Scope

- 네이티브 Ctrl+K 애니메이션 100% 복제
- Cloud Agents SaaS
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **S급: 선택 영역 → 수정 제안 + Diff**
- VS Code WorkspaceEdit: https://code.visualstudio.com/api/references/vscode-api#WorkspaceEdit
- DiffEditor API: https://code.visualstudio.com/api/references/vscode-api#DiffEditor