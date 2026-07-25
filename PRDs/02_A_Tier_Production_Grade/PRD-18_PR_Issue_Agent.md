# PRD-18: PR/이슈 연동 에이전트 (PR & Issue Agent Integration)

> **Priority**: A급 (리뷰·이슈 자동화)  
> **Phase**: C7  
> **관련 PRD**: `PRD-10_MCP_Client.md` (GitHub MCP), `PRD-14_Agent_Review_Bugbot.md`, `PRD-Tools-F_Orchestration_Extension.md`

---

## 1. Overview

### 목적
GitHub API(MCP 또는 `gh` CLI)를 통해 **PR 리뷰 자동화, 이슈→구현, PR 설명 생성**을 에이전트 태스크로 수행한다. 팀 워크플로에 에이전트를 네이티브하게 녹인다.

### 비즈니스 가치
- "이슈 #123 구현해줘" → 브랜치 생성 → 커밋 → PR 열기 → 리뷰 요청까지 원클릭
- PR 열리면 자동으로 로컬 Bugbot 리뷰 실행 → 코멘트 달기
- PR 설명·릴리스 노트 자동 생성

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, "이슈 #456 구현해줘"라고 하면 브랜치 따고 구현·테스트·PR까지 알아서 하고 싶다 |
| US-02 | 팀 리더로서, PR 열리면 자동으로 `/review` 돌고 보안/정합성 코멘트 달게 하고 싶다 |
| US-03 | 개발자로서, PR 설명 "## Changes\n- Refactor auth\n- Add tests" 자동 생성되길 원한다 |

---

## 2. Functional Requirements

### 2.1 GitHub MCP 도구 세트 (또는 `gh` CLI 래퍼)
| 도구 | 기능 | 파라미터 |
|------|------|----------|
| `gh_create_branch` | 베이스에서 새 브랜치 생성 | `{ base: 'main', name: 'feat/issue-123' }` |
| `gh_create_pr` | PR 생성 | `{ title, body, head, base, draft?, reviewers? }` |
| `gh_get_pr` | PR 상세 조회 | `{ number }` |
| `gh_list_pr_files` | 변경 파일 목록 | `{ number }` |
| `gh_get_pr_diff` | Diff 전체 조회 | `{ number }` |
| `gh_post_review_comment` | 라인 단위 리뷰 코멘트 | `{ prNumber, file, line, body }` |
| `gh_add_pr_labels` | 라벨 추가 | `{ number, labels[] }` |
| `gh_request_review` | 리뷰어 요청 | `{ number, reviewers[] }` |
| `gh_get_issue` | 이슈 조회 | `{ number }` |
| `gh_create_issue` | 이슈 생성 | `{ title, body, labels?, assignees? }` |
| `gh_search_issues` | 이슈 검색 | `{ query, state: 'open'|'closed' }` |

### 2.2 이슈→구현 파이프라인
| FR-ID | 단계 | 상세 |
|-------|------|------|
| FR-01 | 이슈 파싱 | `#123` 멘션 또는 `/implement 123` → `gh_get_issue`로 상세 가져오기 |
| FR-02 | 브랜치 생성 | `gh_create_branch` (이슈 번호 포함 네이밍) |
| FR-03 | 플랜 수립 | Plan 모드로 이슈 분석 → 접근법 Mermaid + TODO |
| FR-04 | 구현 실행 | Agent 모드로 TODO 순회 구현 |
| FR-05 | 테스트/린트 | `run_terminal_cmd`로 CI 로컬 실행 |
| FR-06 | 커밋/PR | `gh_create_pr`에 본문 자동 생성 (변경 요약 + 테스트 결과) |
| FR-07 | 리뷰 요청 | 팀 규칙에 따라 리뷰어 자동 할당 |

### 2.3 PR 자동 리뷰
| FR-ID | 트리거 | 동작 |
|-------|--------|------|
| FR-08 | PR 열림/업데이트 | Webhook(또는 폴링) 감지 → `gh_get_pr_diff` → 로컬 `/review` 실행 |
| FR-09 | 코멘트 포스팅 | Finding → `gh_post_review_comment` (라인 단위) |
| FR-10 | 요약 코멘트 | PR 전체 요약 + 통과/실패 배지 → `gh_post_pr_comment` |

### 2.4 PR 설명·릴리스 노트 생성
| FR-ID | 기능 | 상세 |
|-------|------|------|
| FR-11 | PR 설명 생성 | Diff + 커밋 메시지 → 구조화된 본문 (Changes, Testing, Breaking, Screenshots) |
| FR-12 | 릴리스 노트 | 마일스톤/라벨 기준 PR 모아 → 카테고리별(Features, Fixes, Chores) 마크다운 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | API 레이트 리밋 | GitHub API 5000/hr 준수, 백오프 내장 |
| NFR-02 | 인증 | GitHub App 설치 토큰 또는 PAT (SecretStorage) |
| NFR-03 | 프라이버시 | 코드/이슈 내용이 로컬 밖으로 나가지 않음 (로컬 모델 시) |
| NFR-04 | 동시성 | 동시 PR 리뷰 3개까지, 큐잉 처리 |

---

## 4. API & Technical Spec

### 4.1 GitHub 클라이언트 (`src/github/client.ts`)

```typescript
// MCP 서버 사용 시: mcp_github_* 도구 호출
// 직접 API 사용 시: Octokit 래퍼
export class GitHubClient {
  private octokit: Octokit;
  private repo: { owner: string; repo: string };

  constructor(token: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    const [owner, name] = repo.split('/');
    this.repo = { owner, repo: name };
  }

  async createPR(params: CreatePRParams): Promise<PullRequest> {
    const { data } = await this.octokit.pulls.create({
      ...this.repo,
      title: params.title,
      body: params.body,
      head: params.head,
      base: params.base || 'main',
      draft: params.draft || false,
    });
    if (params.reviewers?.length) {
      await this.octokit.pulls.requestReviewers({ ...this.repo, pull_number: data.number, reviewers: params.reviewers });
    }
    return data;
  }

  async postReviewComment(prNumber: number, comments: ReviewComment[]): Promise<void> {
    // 배치로 한 번에 (API 호출 수 절약)
    await this.octokit.pulls.createReview({
      ...this.repo,
      pull_number: prNumber,
      comments: comments.map(c => ({
        path: c.file,
        line: c.line,
        body: c.body,
        side: 'RIGHT',
      })),
      event: 'COMMENT',
    });
  }

  async getPRDiff(prNumber: number): Promise<string> {
    const { data } = await this.octokit.pulls.get({ ...this.repo, pull_number: prNumber, mediaType: { format: 'diff' } });
    return data as unknown as string; // raw diff
  }

  // Webhook 검증 (서버 사이드 필요 시)
  verifyWebhook(payload: string, signature: string): boolean {
    return crypto.createHmac('sha256', this.webhookSecret).update(payload).digest('hex') === signature.replace('sha256=', '');
  }
}
```

### 4.2 이슈 구현 에이전트 (`src/agents/issueAgent.ts`)

```typescript
export class IssueAgent {
  constructor(
    private github: GitHubClient,
    private agentLoop: AgentLoopFactory,
    private reviewAgent: AgentReviewer
  ) {}

  async implementIssue(issueNumber: number): Promise<ImplementationResult> {
    // 1. 이슈 조회
    const issue = await this.github.getIssue(issueNumber);
    
    // 2. 브랜치 생성
    const branchName = `feat/issue-${issueNumber}-${slugify(issue.title).slice(0, 40)}`;
    await this.github.createBranch({ base: 'main', name: branchName });
    
    // 3. 플랜 수립 (Plan 모드)
    const planPrompt = `Implement GitHub issue #${issueNumber}: ${issue.title}

${issue.body}

Repository context: ${await this.getRepoContext()}

Create a detailed plan with Mermaid diagram and TODO list.`;
    
    const planSession = await this.agentLoop.createSession({ mode: 'plan', initialMessage: planPrompt });
    const plan = await planSession.runToCompletion();
    
    // 4. 사용자 승인 (UI에서)
    if (!await this.requestPlanApproval(plan)) {
      return { success: false, reason: 'Plan rejected by user' };
    }
    
    // 5. 구현 실행 (Agent 모드, TODO 순회)
    const implSession = await this.agentLoop.createSession({ 
      mode: 'agent', 
      initialMessage: `Execute the approved plan. Follow TODOs strictly. Run tests after each.`,
      context: { plan, issue },
      maxTurns: 30,
    });
    
    const implResult = await implSession.runToCompletion();
    
    // 6. 로컬 리뷰 실행
    const review = await this.reviewAgent.review({ since: 'HEAD' });
    
    // 7. 커밋 & PR 생성
    const prBody = this.generatePRBody(issue, implResult, review);
    const pr = await this.github.createPR({
      title: `${issue.title} (fixes #${issueNumber})`,
      body: prBody,
      head: branchName,
      base: 'main',
      reviewers: this.getDefaultReviewers(),
    });
    
    // 8. 자동 리뷰 요청
    await this.github.requestReview(pr.number, this.getDefaultReviewers());
    
    return { success: true, pr, review };
  }

  private generatePRBody(issue: Issue, impl: ImplResult, review: ReviewResult): string {
    return `## Summary
Implements #${issue.number}: ${issue.title}

## Changes
${impl.fileChanges.map(f => `- ${f.path}: ${f.summary}`).join('\n')}

## Testing
${impl.testResults.map(t => `- ${t.suite}: ${t.passed}/${t.total} passed`).join('\n')}

## Review Findings (Auto)
${review.findings.length === 0 ? 'No issues found ✅' : review.findings.map(f => `- [${f.severity}] ${f.file}:${f.line} ${f.title}`).join('\n')}

## Checklist
- [ ] Tests pass
- [ ] Lint clean
- [ ] No security findings
- [ ] Documentation updated
`;
  }
}
```

### 4.3 PR 리뷰 자동화 (Webhook 서버 - 선택적)

```typescript
// 별도 경량 HTTP 서버 (확장 내장 또는 별도 프로세스)
import { createServer } from 'http';

const server = createServer(async (req, res) => {
  if (req.url === '/webhook/github' && req.method === 'POST') {
    const payload = await parseBody(req);
    const event = req.headers['x-github-event'];
    
    if (event === 'pull_request' && (payload.action === 'opened' || payload.action === 'synchronize')) {
      // 비동기 처리
      processPRReview(payload.pull_request.number).catch(console.error);
    }
    
    res.writeHead(200); res.end('OK');
  }
});

async function processPRReview(prNumber: number) {
  const diff = await github.getPRDiff(prNumber);
  const review = await reviewer.review({ diff, rules: '.agentk/review-rules.md' });
  
  if (review.findings.length > 0) {
    const comments = review.findings.map(f => ({
      file: f.file,
      line: f.line,
      body: `**[${f.severity.toUpperCase()}] ${f.category}**\n${f.description}\n\n> ${f.suggestion}`,
    }));
    await github.postReviewComment(prNumber, comments);
  }
  
  // 요약 코멘트
  await github.postPRComment(prNumber, `## 🤖 Auto Review Summary
${review.summary}
${review.findings.length === 0 ? '✅ No issues found' : `⚠️ ${review.findings.filter(f=>f.severity==='error').length} errors, ${review.findings.filter(f=>f.severity==='warning').length} warnings`}
`);
}
```

---

## 5. UI/UX Specification

### 5.1 `/implement` 명령 플로우
```
User: /implement 123

🔄 Implementing Issue #123: "Add OAuth2 PKCE support"
  ├─ Fetching issue... ✓
  ├─ Creating branch feat/issue-123-oauth2-pkce... ✓
  ├─ Planning (Plan mode)... ████████░░
  │   Plan generated: 5 TODOs, Mermaid diagram
  │   [View Plan] [Approve] [Modify]
  ├─ Executing (Agent mode)... ████░░░░░░
  │   TODO 1/5: Add PKCE types... ✓
  │   TODO 2/5: Implement authorize endpoint... ████████░░
  ├─ Running tests... ████████████ (12/12 passed)
  ├─ Auto review... ✓ (0 errors, 1 warning)
  ├─ Creating PR #456... ✓
  └─ Requesting reviewers... ✓

✅ Done! PR #456 created: https://github.com/org/repo/pull/456
```

### 5.2 PR 자동 리뷰 결과 (GitHub UI)
```
🤖 Auto Review Summary
✅ No issues found

Or:

⚠️ 2 errors, 3 warnings
Files reviewed: 5

Inline comments on diff:
src/auth/oauth.ts:42  🔴 [SECURITY] State parameter not validated
> Validate state parameter to prevent CSRF attacks
```

---

## 6. Acceptance Criteria

```gherkin
Feature: PR/Issue Agent Integration

  Scenario: Implement issue from GitHub
    Given issue #123 exists with clear requirements
    When user runs "/implement 123"
    Then branch created, plan generated, user approves
    And agent implements following plan
    And tests pass, PR created with auto-generated description
    And reviewers requested

  Scenario: Auto review on PR open
    Given webhook configured (or polling enabled)
    When PR #456 opened with 3 file changes
    Then local review runs on diff
    And review comments posted on GitHub diff lines
    And summary comment posted on PR

  Scenario: PR description auto-generated
    Given PR has 10 commits with conventional messages
    When user runs "/pr-description 456"
    Then structured markdown generated (Changes, Testing, Breaking)
    And posted as PR body update

  Scenario: Release notes generation
    Given milestone v2.0 has 15 PRs merged
    When user runs "/release-notes v2.0"
    Then markdown with Features/Fixes/Chores categories generated
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-10_MCP_Client.md` | 선행 | GitHub MCP 도구 세트 |
| `PRD-14_Agent_Review_Bugbot.md` | 선행 | 리뷰 엔진 재사용 |
| `@octokit/rest` | 런타임 | GitHub API 클라이언트 (MIT) |
| `gh` CLI | 대체 | MCP 없을 때 폴백 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | GitHub API 클라이언트 (MCP + Octokit 폴백) | 인증, 기본 CRUD 동작 |
| 2 | 이슈→구현 파이프라인 (브랜치, 플랜, 실행, PR) | E2E 워크플로 |
| 3 | PR 리뷰 자동화 (Webhook 서버 또는 폴링) | GitHub 코멘트 포스팅 |
| 4 | PR 설명/릴리스 노트 생성기 | 마크다운 템플릿 엔진 |
| 5 | 팀 설정: 리뷰어 규칙, 라벨, 브랜치 네이밍 | `.agentk/github-config.json` |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| GitHub API 레이트 리밋 | 중간 | 백오프 + 큐잉, 조건부 요청(ETag), GraphQL로 배치 |
| Webhook 서버 보안/배포 복잡도 | 높음 | 폴링 모드 기본 제공 (5분 간격), 웹훅은 선택적 |
| PR 난수로 인한 병합 충돌 | 중간 | 브랜치 생성 시 `rebase` 옵션, 충돌 시 사용자 알림 |

---


## Out of Scope

- Team MCP 마켓 풀 복제 / Cloud 상시 에이전트
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **A급: PR/이슈 연동 에이전트**
- GitHub REST API: https://docs.github.com/en/rest
- GitHub Webhooks: https://docs.github.com/en/webhooks