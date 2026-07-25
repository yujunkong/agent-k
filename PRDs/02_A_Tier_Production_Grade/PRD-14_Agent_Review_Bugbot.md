# PRD-14: Agent Review / 로컬 Bugbot (Agent Review / Local Bugbot)

> **Priority**: A급 (푸시 전 버그·보안 리뷰)  
> **Phase**: C7  
> **관련 PRD**: `PRD-Tools-B_Edit_File.md`, `PRD-Infra-09_Checkpoints_Rollback.md`, `PRD-Harness-10_Verification_MicroLoop.md`

---

## 1. Overview

### 목적
`git diff`(스테이징/커밋 범위)를 수집해 **체크리스트 프롬프트**(correctness, security, tests, performance)로 LLM에 넘기고, **파일별 Finding 리스트 UI**로 보여준다. 선택적으로 "Fix" 버튼으로 새 Agent 세션에 Finding 주입해 자동 수정한다. 클라우드 Bugbot 전체 복제 불필요 — **로컬 `/review`만으로도 체감 큼**.

### 비즈니스 가치
- **푸시 전 게이트**: CI 실패·보안 이슈 사전 차단
- **비용 제로**: 로컬 모델로 무제한 리뷰
- **교육 효과**: Finding 설명으로 개발자 자체 역량 향상

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, `git push` 전 `/review` 치면 변경사항 전체를 보안/정합성/테스트 관점에서 리뷰받고 싶다 |
| US-02 | 개발자로서, Finding 클릭 시 해당 파일 Diff 위치로 점프하고 "Fix"로 바로 수정 세션 띄우고 싶다 |
| US-03 | 팀 리더로서, 리뷰 규칙(체크리스트)을 `.agentk/review-rules.md`로 커스터마이즈하고 싶다 |

---

## 2. Functional Requirements

### 2.1 리뷰 트리거 및 범위
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 명령어 | `/review [--staged] [--all] [--since=HEAD~3] [--rules=.agentk/review-rules.md]` |
| FR-02 | 기본 범위 | 스테이징 영역 (`git diff --cached`) — 가장 흔한 사용 케이스 |
| FR-03 | 옵션 | `--all`: 워킹 트리 전체 변경, `--since`: 커밋 범위 지정 |
| FR-04 | 바이너리/대용량 제외 | 1MB 초과 파일, 이미지/바이너리 자동 제외 (설정 가능) |

### 2.2 체크리스트 프롬프트 (시스템 프롬프트)
```markdown
당신은 시니어 코드 리뷰어입니다. 다음 체크리스트로 변경사항을 검토하세요.

## 1. Correctness (정합성)
- 로직 버그, 엣지 케이스 미처리, 타입 불일치
- Null/Undefined 체크 누락, 경계값 오류

## 2. Security (보안)
- SQL 인젝션, XSS, 경로 순회, 시크릿 하드코딩
- 인증/인가 우회, 안전하지 않은 역직렬화

## 3. Tests (테스트)
- 변경 로직 커버하는 테스트 존재 여부
- 엣지 케이스 테스트, 통합 테스트 필요성

## 4. Performance (성능)
- N+1 쿼리, 불필요한 루프, 메모리 누수
- 번들 크기 증가, 렌더링 최적화

## 5. Maintainability (유지보수)
- 명명 규칙, 복잡도(순환/인지), 중복 코드
- 문서/주석 갱신 필요성

출력 형식 (JSON):
{
  "findings": [
    {
      "file": "src/auth.ts",
      "line": 42,
      "severity": "error|warning|info",
      "category": "security|correctness|tests|performance|maintainability",
      "title": "Hardcoded JWT secret",
      "description": "Line 42 uses a hardcoded secret. Should use env var.",
      "suggestion": "Replace with process.env.JWT_SECRET",
      "confidence": 0.95
    }
  ],
  "summary": "3 findings: 1 error, 2 warnings"
}
```

### 2.3 Finding 리스트 UI (Webview)
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-05 | 트리 뷰 | 파일별 그룹핑 → Finding 리스트 (심볼 아이콘: 🔴🟡🔵) |
| FR-06 | Diff 점프 | Finding 클릭 → 에디터에서 해당 라인 하이라이트 + Diff 사이드바 |
| FR-07 | 필터/정렬 | 심각도, 카테고리, 파일명 필터 |
| FR-08 | Fix 액션 | Finding 행에 [Fix] 버튼 → 새 Agent 세션에 `{ finding, fileContext }` 주입 |
| FR-09 | 일괄 내보내기 | Markdown/JSON/SARIF 내보내기 (CI 연동용) |

### 2.4 Fix 세션 주입
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-10 | 컨텍스트 구성 | Finding JSON + 해당 파일 전체/관련 구간 + 관련 테스트 파일 |
| FR-11 | Agent 지시 | "아래 Finding을 수정하라. 수정 후 `read_lints`와 테스트로 검증하라." |
| FR-12 | 검증 루프 | 수정 → lint/test → 통과 시 Finding 해결 표시, 실패 시 재시도 (최대 2회) |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 리뷰 지연 시간 | 500라인 diff 기준 < 10초 (Flash 모델) |
| NFR-02 | 거짓 양성률 | 보안 카테고리 < 10% (규칙 튜닝으로) |
| NFR-03 | 대용량 diff 처리 | 10k 라인 이상 시 청크 분할 + 병렬 리뷰 + 결과 병합 |
| NFR-04 | 프라이버시 | 코드가 로컬 밖으로 나가지 않음 (로컬 모델 필수) |

---

## 4. API & Technical Spec

### 4.1 리뷰 실행기 (`src/review/reviewer.ts`)

```typescript
export class AgentReviewer {
  constructor(
    private provider: LLMProvider,
    private toolRegistry: ToolRegistry,
    private config: ReviewConfig
  ) {}

  async review(options: ReviewOptions): Promise<ReviewResult> {
    // 1. Diff 수집
    const diff = await this.collectDiff(options);
    if (!diff.trim()) return { findings: [], summary: 'No changes to review' };

    // 2. 청크 분할 (대용량 대응)
    const chunks = this.splitDiff(diff, this.config.maxChunkLines || 500);
    
    // 3. 병렬 리뷰 (청크당 독립 호출)
    const chunkResults = await Promise.all(
      chunks.map(chunk => this.reviewChunk(chunk, options.rules))
    );

    // 4. 병합 + 중복 제거
    const allFindings = this.mergeFindings(chunkResults.flat());
    
    return {
      findings: allFindings,
      summary: this.summarize(allFindings),
      reviewedAt: Date.now(),
      diffStats: this.getDiffStats(diff),
    };
  }

  private async reviewChunk(diff: string, rules?: string): Promise<Finding[]> {
    const prompt = this.buildPrompt(diff, rules);
    
    const response = await this.provider.chatCompletion({
      model: this.config.model || 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: REVIEW_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });

    return this.parseFindings(response.content);
  }

  private buildPrompt(diff: string, rules?: string): string {
    return `Review the following git diff:
\`\`\`diff
${diff}
\`\`\`

${rules ? `Additional rules:\n${rules}\n` : ''}

Output ONLY valid JSON matching the Finding schema.`;
  }

  private splitDiff(diff: string, maxLines: number): string[] {
    const lines = diff.split('\n');
    const chunks: string[] = [];
    let current: string[] = [];
    let currentFile = '';

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        if (current.length > 0) chunks.push(current.join('\n'));
        current = [line];
        currentFile = line;
      } else {
        current.push(line);
      }
      if (current.length >= maxLines) {
        chunks.push(current.join('\n'));
        current = [currentFile];
      }
    }
    if (current.length > 0) chunks.push(current.join('\n'));
    return chunks;
  }
}
```

### 4.2 Fix 세션 런처 (`src/review/fixLauncher.ts`)

```typescript
export async function launchFixSession(finding: Finding, workspaceRoot: string): Promise<void> {
  // 1. 관련 파일 컨텍스트 수집
  const fileContent = await readFile(finding.file);
  const relatedTests = await findRelatedTests(finding.file);
  const lints = await readLints(finding.file);

  // 2. Fix용 시스템 프롬프트
  const fixPrompt = `You are fixing a specific code review finding.

FINDING:
${JSON.stringify(finding, null, 2)}

FILE CONTEXT (${finding.file}):
${fileContent}

RELATED TESTS:
${relatedTests.map(t => `${t.file}:\n${t.content}`).join('\n\n')}

CURRENT LINTS:
${lints.map(l => `${l.line}: ${l.message}`).join('\n')}

INSTRUCTIONS:
1. Apply minimal fix for the finding.
2. Run read_lints on the file after edit.
3. Run related tests if available.
4. If lint/test fails, retry once with adjusted fix.
5. Output only the Search-Replace patch.`;

  // 3. 새 Agent 세션 시작 (Agent 모드, 단일 태스크)
  const sessionId = `fix-${finding.file}-${finding.line}-${Date.now()}`;
  await agentLoopManager.startSession({
    id: sessionId,
    mode: 'agent',
    initialMessage: fixPrompt,
    toolWhitelist: ['read_file', 'edit_file', 'read_lints', 'run_terminal_cmd'],
    maxTurns: 5,
    onComplete: (result) => {
      if (result.success) {
        reviewUI.markFindingFixed(finding.id);
      }
    },
  });
}
```

### 4.3 Review UI Webview (`src/views/reviewView.ts`)

```html
<!-- Webview HTML 구조 -->
<div class="review-header">
  <h2>🔍 Code Review: ${diffStats.filesChanged} files, +${diffStats.added}/-${diffStats.removed}</h2>
  <div class="filters">
    <select id="severityFilter"><option value="">All</option><option>error</option><option>warning</option><option>info</option></select>
    <select id="categoryFilter"><option value="">All</option><option>security</option><option>correctness</option>...</select>
    <button id="exportBtn">Export SARIF</button>
  </div>
</div>

<div class="findings-tree" id="tree">
  <!-- 동적 트리 렌더링 -->
  <div class="file-group" data-file="src/auth.ts">
    <div class="file-header">📄 src/auth.ts (3 findings)</div>
    <div class="finding error" data-id="f1">
      <span class="icon">🔴</span>
      <span class="title">Hardcoded JWT secret</span>
      <span class="line">Line 42</span>
      <button class="fix-btn" data-finding="f1">Fix</button>
    </div>
    <div class="finding warning" data-id="f2">...</div>
  </div>
</div>

<div class="diff-preview" id="diffPreview" style="display:none">
  <!-- DiffEditor 임베드 또는 iframe -->
</div>
```

---

## 5. UI/UX Specification

### 5.1 `/review` 명령 실행 플로우
```
User: /review --staged

🔍 Reviewing staged changes (3 files, +120/-45)
  ├─ Collecting diff... ✓
  ├─ Chunking... 2 chunks
  ├─ Reviewing chunk 1/2 (flash)... ████████████ Done (2.3s)
  ├─ Reviewing chunk 2/2 (flash)... ████████████ Done (1.8s)
  ├─ Merging findings... ✓
  └─ Review complete: 5 findings (1 error, 3 warning, 1 info)

[Open Review Panel]  [Export SARIF]
```

### 5.2 리뷰 패널
```
┌─ Code Review Results ────────────────────────────────────────────────────┐
│  🔴 1 error   🟡 3 warning   🔵 1 info   [Filters ▼]  [Export]            │
├────────────────────────────────────────────────────────────────────────────┤
│ 📄 src/auth.ts (2)                                                         │
│   🔴 [security] Line 42: Hardcoded JWT secret              [Fix] [Jump]   │
│   🟡 [maintainability] Line 18: Function too complex (cognitive 28) [Fix] │
│                                                                             │
│ 📄 src/payment/processor.ts (2)                                            │
│   🔵 [info] Line 10: Unused import 'lodash'                   [Fix] [Jump] │
│   🟡 [performance] Line 88: N+1 query in loop                  [Fix] [Jump]│
│                                                                             │
│ 📄 tests/auth.test.ts (1)                                                  │
│   🔵 [tests] Line 15: Missing test for expired token case      [Fix] [Jump]│
├────────────────────────────────────────────────────────────────────────────┤
│  Diff Preview (src/auth.ts:42)                                             │
│  ➖ const SECRET = 'hardcoded-secret';                                      │
│  ➕ const SECRET = process.env.JWT_SECRET;                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Fix 세션 플로우
```
User clicks [Fix] on "Hardcoded JWT secret"

🛠 Fix Session: f1 (src/auth.ts:42)
  ├─ Context injected: finding + file + tests + lints
  ├─ Agent: edit_file (Search-Replace)
  ├─ Verification: read_lints → ✓ clean
  ├─ Verification: run_terminal_cmd "npm test -- auth" → ✓ 12/12 passed
  └─ ✅ Finding marked FIXED in review panel
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Agent Review / Local Bugbot

  Scenario: Review staged changes with default rules
    Given user has staged changes in 3 files
    When user runs "/review"
    Then diff is collected from --cached
    And findings include severity, category, line, suggestion
    And review panel opens with findings grouped by file

  Scenario: Custom rules file loaded
    Given .agentk/review-rules.md exists with "No console.log in production code"
    When user runs "/review --rules=.agentk/review-rules.md"
    Then findings include "console.log found in production code" if present

  Scenario: Fix button launches agent and verifies
    Given a finding "Unused variable 'x' at line 10"
    When user clicks [Fix]
    Then new agent session starts with finding context
    And agent edits file to remove variable
    And read_lints confirms no unused var warning
    And finding shows green checkmark in review panel

  Scenario: Large diff chunked and reviewed in parallel
    Given a 5000-line diff
    When review runs
    Then diff split into ~500-line chunks
    And chunks reviewed in parallel (max 4 concurrent)
    And findings merged and deduplicated by file+line

  Scenario: Export SARIF for CI integration
    When user clicks "Export SARIF"
    Then .sarif file generated with all findings
    And format compatible with GitHub Code Scanning
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-Tools-B_Edit_File.md` | 선행 | Fix 세션에서 edit_file 사용 |
| `PRD-Infra-09_Checkpoints_Rollback.md` | 선행 | Fix 전 체크포인트 생성 |
| `PRD-Harness-10_Verification_MicroLoop.md` | 병행 | Fix 후 자동 lint/test 검증 |
| `PRD-06_Workspace_Tools.md` | 선행 | read_lints, run_terminal_cmd 도구 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | Diff 수집 + 청킹 + 단일 모델 리뷰 | 기본 리뷰 플로우 동작 |
| 2 | Finding 스키마 파싱 + Webview 트리 UI | 리뷰 패널 표시 |
| 3 | 규칙 파일 로드 + 커스텀 체크리스트 | `.agentk/review-rules.md` 지원 |
| 4 | Fix 세션 런처 + 검증 루프 | [Fix] 버튼 동작 |
| 4 | SARIF/Markdown 내보내기 | CI 연동 아티팩트 |
| 5 | 대용량 diff 병렬 처리 + 캐싱 | 엔터프라이즈 레포 지원 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| 모델이 가짜 Finding 생성 (환각) | 중간 | 저온도(0.1), JSON 강제, 신뢰도 점수 임계값(0.7) 미만 필터링 |
| 대용량 diff 토큰 초과 | 높음 | 청킹 + 병렬 + 결과 병합, 요약 모델로 1차 필터링 |
| Fix 세션이 원본 의도와 다르게 수정 | 중간 | Finding 컨텍스트에 "최소 수정만" 강조, 검증 루프로 회귀 방지 |

---


## Out of Scope

- Team MCP 마켓 풀 복제 / Cloud 상시 에이전트
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **A급: Agent Review / 로컬 Bugbot**
- SARIF Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
- GitHub Code Scanning: https://docs.github.com/en/code-security/code-scanning