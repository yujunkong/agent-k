# PRD-Spec-02: Patch Format (edit/apply_patch 포맷)

> **Category**: Advanced Specs  
> **Priority**: ② (Provider/JSON 다음)  
> **Phase**: C2 (Agent 1턴 쓰기부터)  
> **관련 PRD**: `PRD-C2_Agent_SingleTurn.md`, `PRD-C4_Infrastructure.md`, `PRD-Infra-09_Checkpoints_Rollback.md`

---

## 1. Overview

### 목적
로컬 모델(Flash급)이 **unified diff hunk 라인번호**를 자주 틀리는 문제를 해결하기 위해, **Search–Replace (Apply Patch)**를 **기본 포맷**으로 강제한다. "기존 코드 블록 ↔ 새 코드 블록" 매칭으로 유일성·스테일니스 검증까지 한 번에 해결.

### 비즈니스 가치
- **성공률 ↑**: Flash 모델이 unified diff 라인번호 틀리는 문제 원천 차단
- **안전성**: 유일 매칭(0회/2회+ 매칭 시 거절) + 스테일니스 체크(mtime/hash) 기본 탑재
- **구현 단순**: unified diff 파서보다 Search-Replace 파서가 훨씬 단순/견고

---

## 2. Patch Format (Search–Replace)

### 2.1 기본 포맷 (Apply Patch)

```text
*** Begin Patch
*** Update File: src/auth/login.ts
@@ function login(creds: Credentials): Promise<Token> {
-  const user = await findUser(creds.email);
+  const user = await findUser(creds.email);
+  if (!user) throw new AuthError('User not found');
   return generateToken(user);
 }
*** End Patch
```

### 2.2 파일 생성 (Add File)

```text
*** Begin Patch
*** Add File: src/utils/newHelper.ts
export function newHelper(): string {
  return 'hello';
}
*** End Patch
```

### 2.3 파일 삭제 (Delete File)

```text
*** Begin Patch
*** Delete File: src/legacy/oldModule.ts
*** End Patch
```

### 2.4 멀티 헌크 (같은 파일 내 여러 변경)

```text
*** Begin Patch
*** Update File: src/auth/login.ts
@@ function login(creds: Credentials) {
-  const user = await findUser(creds.email);
+  const user = await findUser(creds.email);
+  if (!user) throw new AuthError('User not found');
   return generateToken(user);
 }
@@ function logout(token: string) {
-  await revokeToken(token);
+  await revokeToken(token);
+  await clearSession(token);
 }
*** End Patch
```

---

## 3. Parsing & Validation Rules

### 3.1 파싱 규칙

| 규칙 | 설명 |
|------|------|
| `*** Begin Patch` / `*** End Patch` | 패치 블록 경계 (필수) |
| `*** Update File: <path>` | 수정 대상 파일 (상대 경로, 워크스페이스 루트 기준) |
| `*** Add File: <path>` | 신규 파일 생성 |
| `*** Delete File: <path>` | 파일 삭제 |
| `@@ <context>` | 헌크 헤더: 변경 전후 컨텍스트 라인 포함 (옵션) |
| `- ` | 삭제 라인 |
| `+ ` | 추가 라인 |
| `  ` (space) | 컨텍스트 라인 (변경 없음) |

### 3.2 검증 규칙 (Validation Pipeline)

```typescript
function validatePatch(patch: ParsedPatch): ValidationResult {
  // 1. 파일 존재 확인 (Add는 없어야 함, Update/Delete는 있어야 함)
  // 2. 인코딩/바이너리 체크
  // 3. 헌크별 유일 매칭 검증 (핵심!)
  // 4. 스테일니스 체크 (mtime/hash)
  // 5. 중복 헌크 병합 가능 여부
}

function findUniqueMatch(fileLines: string[], searchLines: string[], hintLine?: number): MatchResult {
  // 1. 정확 매칭 위치 모두 찾기
  // 2. 매칭 0개 → "Hunk not found"
  // 3. 매칭 2개+ → "Multiple matches, refine search block"
  // 4. 매칭 1개 → 성공 (라인 번호 반환)
  // 힌트 라인 주어지면 근처 우선
}
```

### 3.3 검증 실패 시 ToolResult (모델에 반환)

```json
{
  "callId": "call_abc123",
  "error": true,
  "output": "Patch validation failed:\n- Hunk 1: Multiple matches (3 found) for search block in src/auth.ts\n  Hint: Make search block more specific (add 2 more context lines)\n- Hunk 2: Search block not found in src/utils.ts\n  Hint: Re-read the file first (file may have been modified externally)",
  "metadata": {
    validationErrors: [
      { hunkIndex: 0, code: "MULTIPLE_MATCHES", matches: 3, hint: "Add 2 more context lines" },
      { hunkIndex: 1, code: "NOT_FOUND", hint: "File modified externally, re-read first" }
    ]
  }
}
```

---

## 4. Application Pipeline (적용 파이프라인)

```
Model emits patch
      │
      ▼
Parse patch → ParsedPatch[]
      │
      ▼
For each file:
  1. Read current content (cached if recent)
  2. Compute hash (xxhash64)
  3. For each hunk:
     a. Find unique match (search lines)
     b. If 0 or 2+ matches → ValidationError
     c. If stale (mtime/hash changed) → StalenessError
  3. Merge hunks per file (line offset recalc)
  4. Build WorkspaceEdit
      │
      ▼
Create Checkpoint (CheckpointManager)
      │
      ▼
Apply WorkspaceEdit (atomic)
      │
      ▼
Post-apply: verify hash matches expected
      │
      ▼
Auto-lint (read_lints) → if errors → inject to model
      │
      ▼
Success → return { ok, path, linesChanged }
```

---

## 4. Reapply (실패 복구)

| 상황 | 처리 |
|------|------|
| Search block 0 matches | "Hunk not found" → 모델에 힌트 + 재시도 유도 |
| Search block 2+ matches | "Multiple matches" → 컨텍스트 라인 추가 요구 |
| Stale (mtime/hash changed) | "File modified externally" → re-read 유도 |
| Apply 실패 (permission 등) | Checkpoint로 자동 롤백 → 에러 리턴 |

---

## 5. Acceptance Criteria

```gherkin
Feature: Search-Replace Patch Format

  Scenario: Successful edit with unique match
    Given file src/auth.ts has function login() with 10 lines
    When model sends Search-Replace patch with exact 5-line search block
    And search block matches exactly once
    Then patch applies successfully
    And file updated with replacement lines
    And checkpoint created before apply

  Scenario: Duplicate match rejected
    Given file has two identical functions "function helper() {}"
    When model sends patch with search block matching both
    Then patch rejected with "Multiple matches (2 found)"
    And hint: "Add 2 more context lines to make unique"

  Scenario: No match rejected
    Given model sends search block not in file
    Then patch rejected with "Search block not found"
    And hint: "Re-read file first (may have been modified externally)"

  Scenario: Stale file detection
    Given agent read file at turn 1
    And external process modified file at turn 3
    When agent sends edit at turn 5
    Then staleness detected (mtime/hash mismatch)
    And error: "File modified externally since last read"

  Scenario: Multi-hunk merge
    Given patch with 3 hunks for same file
    When applied
    Then hunks merged with correct line offsets
    And single WorkspaceEdit applied atomically

  Scenario: Failed apply rolls back
    Given permission denied on file write
    When applyWorkspaceEdit fails
    Then checkpoint automatically restored
    And error returned to model
```

---


## Out of Scope

- Spec 범위를 넘는 제품 기능 (Feature PRD로 위임)
- 상세: Canonical Owner Matrix

## 6. References

- `PRD-C2_Agent_SingleTurn.md` — Diff Preview + Approval UI
- `PRD-Infra-09_Checkpoints_Rollback.md` — Checkpoint 자동 생성/롤백
- `PRD-Harness-10_Verification_MicroLoop.md` — 수정 후 자동 린트/테스트
- Myers Diff Algorithm: https://blog.jcoglan.com/2017/02/12/the-myers-diff-algorithm-part-1/