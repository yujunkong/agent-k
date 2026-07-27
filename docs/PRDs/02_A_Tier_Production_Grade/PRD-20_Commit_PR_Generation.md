# PRD-20: 커밋 메시지 · PR 설명 생성 (Commit Message & PR Description Generation)

> **Priority**: A급 (매일 쓰는 짧은 생산성)  
> **Phase**: C4~C7  
> **관련 PRD**: `PRD-Tools-B_Edit_File.md`, `PRD-18_PR_Issue_Agent.md`, `PRD-06_Workspace_Tools.md`

---

## 1. Overview

### 목적
`git diff`(스테이징/커밋/브랜치 범위)를 분석해 **Conventional Commits** 규약에 맞는 커밋 메시지와 **구조화된 PR 설명**을 자동 생성한다. 개발자가 "커밋 메시지 뭐 쓰지?" 고민하는 시간 단축.

### 비즈니스 가치
- **일관성**: 팀 전체 Conventional Commits 강제
- **리뷰 효율**: PR 설명에 변경 요약·테스트·스크린샷 자동 포함
- **히스토리 품질**: `git log --oneline`이 바로 릴리스 노트급

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, `git commit` 전 `/commit` 치면 적절한 메시지 초안이 떠서 Enter만 치고 싶다 |
| US-02 | 개발자로서, PR 열기 전 `/pr-description`으로 본문 초안 생성해 복사·붙여넣기만 하고 싶다 |
| US-03 | 팀 리더로서, 커밋 메시지 프리픽스(`feat:`, `fix:`, `refactor:` 등) 규칙을 `.agentk/commit-rules.md`로 강제하고 싶다 |

---

## 2. Functional Requirements

### 2.1 커밋 메시지 생성 (`/commit` 또는 `git commit` 훅 연동)
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 트리거 | 명령 `/commit` 또는 `git commit` 시 프리커밋 훅(옵션) |
| FR-02 | 입력 소스 | `git diff --cached` (스테이징) 또는 `git diff HEAD~n` (최근 N커밋) |
| FR-03 | 출력 포맷 | Conventional Commits: `<type>(<scope>): <subject>\n\n<body>\n\n<footer>` |
| FR-04 | 타입 추론 | `feat`/`fix`/`refactor`/`perf`/`docs`/`style`/`test`/`chore`/`build`/`ci` |
| FR-05 | 스코프 추론 | 변경 파일 경로에서 공통 접두사 추출 (예: `src/auth/` → `auth`) |
| FR-06 | 본문 생성 | 변경 파일별 한 줄 요약 + 주요 로직 변경 이유 |
| FR-07 | 푸터 | `Closes #123`, `Co-authored-by:`, `Breaking Change:` 자동 감지 |
| FR-08 | 편집/승인 | 모달에서 편집 가능 → Enter로 확정 → `git commit -m "..."` 실행 |

### 2.2 PR 설명 생성 (`/pr-description`)
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-09 | 입력 소스 | 현재 브랜치 vs 베이스(`main`) 전체 diff + 커밋 메시지들 |
| FR-10 | 템플릿 섹션 | `## Summary`, `## Changes`, `## Testing`, `## Breaking Changes`, `## Screenshots`, `## Checklist` |
| FR-11 | 변경사항 분류 | 파일별/기능별 그룹핑, 신규/수정/삭제 아이콘 |
| FR-12 | 테스트 결과 임베드 | 로컬 테스트 실행 결과 요약(통과/실패/커버리지) |
| FR-13 | 스크린샷/아티팩트 | Design Mode 스크린샷, Diff 카드 링크 자동 포함 |
| FR-14 | 마크다운 출력 | 클립보드 복사 또는 `.github/pull_request_template.md` 덮어쓰기 |

### 2.3 규칙 커스터마이징
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-15 | 커밋 규칙 | `.agentk/commit-rules.md`: 타입 정의, 스코프 매핑, 금지 단어, 최대 길이 |
| FR-16 | PR 템플릿 | `.github/pull_request_template.md` 있으면 확장, 없으면 기본 템플릿 |
| FR-17 | 팀 공유 | 규칙 파일 Git 커밋으로 팀 동기화 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 생성 지연 | diff 500라인 기준 < 2초 (Flash 모델) |
| NFR-02 | 메시지 길이 | Subject ≤ 50자, Body ≤ 72자/줄 (자동 줄바꿈) |
| NFR-03 | 정확도 | 타입/스코프 추론 정확도 > 90% (규칙 파일로 보정) |
| NFR-04 | 훅 오버헤드 | 프리커밋 훅 활성화 시 `git commit` 지연 < 1초 |

---

## 4. API & Technical Spec

### 4.1 커밋 메시지 생성기 (`src/git/commitGenerator.ts`)

```typescript
export interface CommitMessage {
  type: CommitType;
  scope?: string;
  subject: string;
  body?: string;
  footer?: string;
  raw: string;  // 최종 포맷팅된 문자열
}

export type CommitType = 'feat' | 'fix' | 'refactor' | 'perf' | 'docs' | 'style' | 'test' | 'chore' | 'build' | 'ci' | 'revert';

export class CommitGenerator {
  constructor(
    private git: GitWrapper,
    private provider: LLMProvider,
    private rules: CommitRules
  ) {}

  async generate(options: { staged?: boolean; range?: string; edit?: boolean }): Promise<CommitMessage> {
    // 1. Diff 수집
    const diff = options.staged 
      ? await this.git.diffCached()
      : await this.git.diff(options.range || 'HEAD~1');
    
    if (!diff.trim()) throw new Error('No changes to commit');

    // 2. 파일 리스트로 스코프 추론
    const files = this.git.parseDiffFiles(diff);
    const scope = this.inferScope(files);

    // 3. 프롬프트 구성
    const prompt = this.buildPrompt(diff, files, scope);
    
    // 4. 모델 호출 (JSON 강제)
    const response = await this.provider.chatCompletion({
      model: this.rules.model || 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: COMMIT_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    // 5. 파싱 + 규칙 검증
    const parsed = this.parseAndValidate(response.content, scope);
    
    // 6. 선택적 편집 모드
    if (options.edit) {
      return await this.showEditModal(parsed);
    }
    
    return parsed;
  }

  private buildPrompt(diff: string, files: string[], inferredScope: string): string {
    return `Generate a Conventional Commit message for the following diff.

FILES CHANGED:
${files.map(f => `- ${f}`).join('\n')}

INFERRED SCOPE: ${inferredScope || '(none)'}

RULES:
${this.rules.content}

DIFF:
\`\`\`diff
${diff.slice(0, 8000)}  // 토큰 예산 보호
\`\`\`

OUTPUT JSON SCHEMA:
{
  "type": "feat|fix|refactor|perf|docs|style|test|chore|build|ci|revert",
  "scope": "string (optional)",
  "subject": "string (imperative, <=50 chars)",
  "body": "string (optional, wrapped at 72 chars)",
  "footer": "string (optional, e.g. Closes #123)"
}`;
  }

  private inferScope(files: string[]): string {
    // 공통 디렉토리 접두사 추출
    const dirs = files.map(f => path.dirname(f)).filter(d => d !== '.');
    if (dirs.length === 0) return '';
    
    let prefix = dirs[0];
    for (const dir of dirs.slice(1)) {
      let i = 0;
      while (i < prefix.length && i < dir.length && prefix[i] === dir[i]) i++;
      prefix = prefix.slice(0, i);
      if (!prefix) break;
    }
    // 마지막 경로 세그먼트만 (src/auth/ → auth)
    return prefix.split('/').pop() || '';
  }

  private parseAndValidate(json: string, fallbackScope: string): CommitMessage {
    const obj = JSON.parse(json);
    const type = this.rules.validTypes.includes(obj.type) ? obj.type : this.inferTypeFromDiff(obj.subject);
    const scope = obj.scope || fallbackScope;
    const subject = this.truncate(obj.subject, 50);
    const body = obj.body ? this.wrapLines(obj.body, 72) : undefined;
    const footer = obj.footer;
    
    const parts = [`${type}${scope ? `(${scope})` : ''}: ${subject}`];
    if (body) parts.push('', body);
    if (footer) parts.push('', footer);
    
    return { type, scope, subject, body, footer, raw: parts.join('\n') };
  }
}

const COMMIT_SYSTEM_PROMPT = `You are a commit message generator following Conventional Commits 1.0.0.
Rules:
- type: feat (new feature), fix (bug fix), refactor (code restructure), perf (performance), docs (documentation), style (formatting), test (tests), chore (maintenance), build (build system), ci (CI config), revert (revert)
- subject: imperative mood, lowercase, no period, <=50 chars
- body: explain WHAT and WHY, not HOW, wrap at 72 chars
- footer: "Closes #123", "Breaking Change: ...", "Co-authored-by: ..."
- Output ONLY valid JSON. No markdown, no explanation.`;
```

### 4.2 PR 설명 생성기 (`src/git/prDescriptionGenerator.ts`)

```typescript
export class PRDescriptionGenerator {
  async generate(baseBranch = 'main'): Promise<string> {
    // 1. 브랜치 diff 수집
    const diff = await this.git.diff(`${baseBranch}...HEAD`);
    const commits = await this.git.log({ format: '%s', since: baseBranch });
    
    // 2. 변경 파일 분류
    const fileChanges = this.categorizeChanges(diff);
    
    // 3. 테스트 실행 (선택적)
    const testResult = await this.runTestsIfConfigured();
    
    // 4. 프롬프트 구성
    const prompt = this.buildPrompt(diff, commits, fileChanges, testResult);
    
    // 5. 모델 호출
    const response = await this.provider.chatCompletion({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: PR_DESC_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    });
    
    return response.content;
  }

  private buildPrompt(diff: string, commits: string[], changes: FileChanges, tests: TestResult): string {
    return `Generate a comprehensive PR description in Markdown.

COMMITS:
${commits.map(c => `- ${c}`).join('\n')}

FILE CHANGES:
${Object.entries(changes).map(([cat, files]) => `## ${cat}\n${files.map(f => `- ${f.icon} ${f.path}: ${f.summary}`).join('\n')}`).join('\n\n')}

TEST RESULTS:
${tests ? `- ${tests.passed}/${tests.total} passed, coverage: ${tests.coverage}%` : 'Not run'}

TEMPLATE SECTIONS REQUIRED:
## Summary
## Changes (grouped by feature/area)
## Testing
## Breaking Changes (if any)
## Screenshots (if Design Mode artifacts exist)
## Checklist

OUTPUT: Pure Markdown, no extra commentary.`;
  }
}
```

### 4.3 Git 래퍼 (`src/git/wrapper.ts`)

```typescript
export class GitWrapper {
  constructor(private cwd: string) {}

  async diffCached(): Promise<string> {
    return this.exec('diff', '--cached', '--no-color');
  }

  async diff(range: string): Promise<string> {
    return this.exec('diff', '--no-color', range);
  }

  async log(options: { format?: string; since?: string; maxCount?: number } = {}): Promise<string[]> {
    const args = ['log', '--oneline'];
    if (options.format) args.push(`--format=${options.format}`);
    if (options.since) args.push(options.since);
    if (options.maxCount) args.push(`-n ${options.maxCount}`);
    const out = await this.exec(...args);
    return out.trim().split('\n').filter(Boolean);
  }

  async commit(message: string, options: { amend?: boolean; noVerify?: boolean } = {}): Promise<void> {
    const args = ['commit', '-m', message];
    if (options.amend) args.push('--amend');
    if (options.noVerify) args.push('--no-verify');
    await this.exec(...args);
  }

  private async exec(...args: string[]): Promise<string> {
    const proc = spawn('git', args, { cwd: this.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    return new Promise((resolve, reject) => {
      proc.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
    });
  }

  parseDiffFiles(diff: string): string[] {
    const files = new Set<string>();
    const regex = /^diff --git a\/(.+?) b\//gm;
    let match;
    while ((match = regex.exec(diff)) !== null) {
      files.add(match[1]);
    }
    return Array.from(files);
  }

  categorizeChanges(diff: string): Record<string, FileChange[]> {
    const files = this.parseDiffFiles(diff);
    const categories: Record<string, FileChange[]> = { Features: [], Fixes: [], Refactor: [], Tests: [], Docs: [], Config: [], Other: [] };
    
    for (const file of files) {
      const cat = this.categorizeFile(file);
      const summary = this.summarizeFileChange(diff, file);
      categories[cat].push({ path: file, summary, icon: this.getIcon(cat) });
    }
    return Object.fromEntries(Object.entries(categories).filter(([,v]) => v.length > 0));
  }
}
```

---

## 5. UI/UX Specification

### 5.1 `/commit` 모달
```
┌─ Commit Message ──────────────────────────────────────────────────────┐
│  Type:  [feat ▼]  Scope: [auth ▼]                                     │
│  Subject: Add PKCE support to OAuth2 flow                            │
│  ──────────────────────────────────────────────────────────────────── │
│  Body:                                                                │
│  - Implement RFC 7636 PKCE for authorization code flow               │
│  - Add code_verifier/code_challenge generation                       │
│  - Store verifier in session with 10min TTL                          │
│  ──────────────────────────────────────────────────────────────────── │
│  Footer: Closes #234                                                 │
│  ──────────────────────────────────────────────────────────────────── │
│  Raw: feat(auth): Add PKCE support to OAuth2 flow                    │
│                                                                       │
│  - Implement RFC 7636 PKCE for authorization code flow               │
│  - Add code_verifier/code_challenge generation                       │
│  - Store verifier in session with 10min TTL                          │
│                                                                       │
│  Closes #234                                                         │
│  ──────────────────────────────────────────────────────────────────── │
│  [Cancel]  [Edit Manually]  [Commit]                                 │
└───────────────────────────────────────────────────────────────────────┘
```

### 5.2 `/pr-description` 결과 (마크다운 프리뷰)
```
┌─ PR Description Preview ─────────────────────────────────────────────┐
│ ## Summary                                                           │
│ Adds PKCE support to OAuth2 authorization flow (RFC 7636).          │
│ Closes #234.                                                         │
│                                                                       │
│ ## Changes                                                           │
│ ### Features                                                         │
│ ✨ src/auth/oauth2.ts: Add PKCE challenge/verifier generation        │
│ ✨ src/auth/session.ts: Store verifier with TTL cleanup              │
│                                                                       │
│ ### Tests                                                            │
│ 🧪 tests/auth/oauth2.test.ts: Add PKCE happy/error cases             │
│                                                                       │
│ ## Testing                                                           │
│ - 12/12 tests passed                                                 │
│ - Coverage: 94% (auth module)                                        │
│ - Manual verified: Google OAuth2 login flow                          │
│                                                                       │
│ ## Breaking Changes                                                  │
│ None                                                                 │
│                                                                       │
│ ## Screenshots                                                       │
│ ![OAuth2 Flow](artifact:oauth-flow.png)                              │
│                                                                       │
│ ## Checklist                                                         │
│ - [x] Tests pass                                                     │
│ - [x] Lint clean                                                     │
│ - [x] No breaking changes                                            │
│ - [x] Documentation updated                                          │
│                                                                       │
│ [Copy to Clipboard]  [Save as PR Template]  [Open in GitHub]         │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Commit Message & PR Description Generation

  Scenario: Generate commit message from staged changes
    Given user staged changes in src/auth/*.ts (new PKCE feature)
    When user runs "/commit"
    Then modal shows type=feat, scope=auth, subject="Add PKCE support to OAuth2 flow"
    And body explains RFC 7636 implementation
    And footer has "Closes #234" (from issue reference in branch name)
    When user clicks Commit
    Then git commit executes with generated message

  Scenario: Generate PR description
    Given feature branch has 5 commits vs main
    When user runs "/pr-description"
    Then markdown includes Summary, Changes (grouped), Testing, Checklist
    And test results embedded if local tests run
    And Design Mode screenshots linked if artifacts exist

  Scenario: Custom commit rules applied
    Given .agentk/commit-rules.md defines "type: perf allowed, scope: max 20 chars"
    When generating commit for performance optimization
    Then type=perf used, scope truncated to 20 chars

  Scenario: Pre-commit hook integration
    Given user enables "Git hook integration" in settings
    When user runs "git commit" without -m
    Then commit message modal appears automatically
    And on confirm, commit proceeds with generated message
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-06_Workspace_Tools.md` | 선행 | `run_terminal_cmd`로 git 실행 |
| `PRD-18_PR_Issue_Agent.md` | 병행 | PR 생성 시 설명 자동 적용 |
| `simple-git` 또는 `git` CLI | 런타임 | Git 래퍼 구현체 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | Git 래퍼 + Diff 파싱 + 파일 분류 | `GitWrapper` 클래스 |
| 2 | 커밋 메시지 생성기 + Conventional Commits 검증 | `/commit` 명령 동작 |
| 3 | 편집 모달 + 프리커밋 훅 옵션 | UX 완성 |
| 4 | PR 설명 생성기 + 템플릿 엔진 | `/pr-description` 명령 |
| 4 | 규칙 파일(`.agentk/commit-rules.md`) 파서 | 팀 커스터마이징 |
| 5 | 아티팩트(스크린샷/Diff) 자동 임베드 | PR 설명 풍부화 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| Diff 너무 커서 토큰 초과 | 중간 | `diff.slice(0, 8000)`, 파일별 요약 후 합성 |
| 타입 추론 오류 (feat vs fix) | 낮음 | 규칙 파일로 오버라이드, 사용자 편집 허용 |
| 훅에서 모달 열기 UX 어색 | 낮음 | 설정으로 on/off, CLI 플래그 `--no-verify`로 우회 |

---


## Out of Scope

- Team MCP 마켓 풀 복제 / Cloud 상시 에이전트
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **A급: 커밋 메시지 · PR 설명 생성**
- Conventional Commits: https://www.conventionalcommits.org/
- Git Hooks: https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks