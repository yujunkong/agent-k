import { execFileSync } from 'child_process';
import {
  featureDisabledMessage,
  isFeatureEnabled
} from '../core/featureFlags';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IssueItem {
  number: number;
  title: string;
  state: string;
  url: string;
  createdAt: string;
  labels: { name: string; color?: string }[];
  user: string;
}

export interface PRItem {
  number: number;
  title: string;
  state: string;
  url: string;
  createdAt: string;
  user: string;
  mergeable: boolean;
}

export interface ReviewComment {
  id: number;
  body: string;
  path: string;
  line: number;
  author: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// GitHubAgent
// ---------------------------------------------------------------------------

export class GitHubAgent {
  private repoRoot: string;
  /** Cached "<owner>/<repo>" string, lazily resolved via `gh repo view` */
  private ownerRepo: string | null = null;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  // -----------------------------------------------------------------------
  // Low-level helpers
  // -----------------------------------------------------------------------

  /**
   * Run `gh <args...>` synchronously and return stdout.
   * Throws a human-readable error when `gh` is missing or the command fails.
   */
  private execGh(args: string[]): string {
    if (!isFeatureEnabled('github')) {
      throw new Error(featureDisabledMessage('github'));
    }
    try {
      const result = execFileSync('gh', args, {
        cwd: this.repoRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
      });
      return result.trim();
    } catch (error: any) {
      // gh binary not found in PATH
      if (error.code === 'ENOENT') {
        throw new Error(
          'GitHub CLI (gh) is not installed or not found in PATH. ' +
            'Please install it from https://cli.github.com/',
        );
      }

      const stderr =
        error.stderr?.toString()?.trim() ||
        error.stdout?.toString()?.trim() ||
        error.message ||
        'Unknown error';
      throw new Error(`GitHub CLI error: ${stderr}`);
    }
  }

  /**
   * Resolve (and cache) the "<owner>/<repo>" string for the current repository
   * by running `gh repo view --json nameWithOwner`.
   */
  private async resolveOwnerRepo(): Promise<string> {
    if (this.ownerRepo) return this.ownerRepo;

    const json = this.execGh(['repo', 'view', '--json', 'nameWithOwner']);
    const parsed = JSON.parse(json);
    this.ownerRepo = parsed.nameWithOwner as string;

    if (!this.ownerRepo || !this.ownerRepo.includes('/')) {
      throw new Error(
        `Could not determine repository owner/name from "gh repo view". Got: ${this.ownerRepo}`,
      );
    }

    return this.ownerRepo;
  }

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------

  /**
   * Check whether the user is authenticated with the GitHub CLI.
   *
   * Uses `gh auth status` and parses the output to extract the logged-in user
   * when available. Returns a structured result instead of throwing, making it
   * safe to call without try/catch in consumer code.
   */
  async checkAuth(): Promise<{
    authenticated: boolean;
    user?: string;
    error?: string;
  }> {
    try {
      const result = execFileSync(
        'gh',
        ['auth', 'status'],
        {
          cwd: this.repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 15_000,
        },
      );
      const output = result.trim();

      // Example output:
      //   ✓ Logged in to github.com as <user> (https://...)
      const userMatch = output.match(
        /logged in to github\.com as\s+(\S+)/i,
      );

      return {
        authenticated: true,
        user: userMatch ? userMatch[1] : undefined,
      };
    } catch (error: any) {
      // gh binary not found
      if (error.code === 'ENOENT') {
        return {
          authenticated: false,
          error:
            'GitHub CLI (gh) is not installed or not found in PATH. Please install it.',
        };
      }

      const stderr: string =
        error.stderr?.toString()?.trim() || '';
      const stdout: string =
        error.stdout?.toString()?.trim() || '';
      const combined = (stderr + '\n' + stdout).trim();

      // The user might still appear in the output even when the command fails
      // (e.g. token expired — "not logged in" messages).
      const userMatch = combined.match(
        /logged in to github\.com as\s+(\S+)/i,
      );

      if (
        combined.includes('not logged in') ||
        combined.includes('no oauth token') ||
        combined.includes('auth status')
      ) {
        return {
          authenticated: false,
          user: userMatch ? userMatch[1] : undefined,
          error:
            'Not authenticated with GitHub CLI. Run "gh auth login" first.',
        };
      }

      return {
        authenticated: false,
        user: userMatch ? userMatch[1] : undefined,
        error:
          combined || error.message || 'Authentication check failed.',
      };
    }
  }

  // -----------------------------------------------------------------------
  // Issues
  // -----------------------------------------------------------------------

  /**
   * List issues in the repository.
   * Default state is "open"; set `options.state` to "closed" or "all" to
   * override. Use `options.limit` to cap results.
   */
  async listIssues(
    options?: { state?: 'open' | 'closed' | 'all'; limit?: number },
  ): Promise<IssueItem[]> {
    const args: string[] = [
      'issue',
      'list',
      '--json',
      'number,title,state,url,createdAt,labels,author',
    ];

    if (options?.state) {
      args.push('--state', options.state);
    }
    if (options?.limit != null) {
      args.push('--limit', String(options.limit));
    }

    const raw = this.execGh(args);
    if (!raw) return [];

    return (JSON.parse(raw) as any[]).map((item) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      url: item.url,
      createdAt: item.createdAt,
      labels: (item.labels ?? []).map((l: any) => ({
        name: l.name,
        color: l.color,
      })),
      user: item.author?.login ?? '',
    }));
  }

  /**
   * Create a new issue.
   *
   * Labels are optional. Titles and bodies may contain arbitrary text
   * (newlines, quotes, etc.) – raw strings are passed directly to `gh` via
   * `execFileSync`, so no shell-escaping issues arise.
   */
  async createIssue(params: {
    title: string;
    body: string;
    labels?: string[];
  }): Promise<{ url: string; number: number }> {
    const args: string[] = [
      'issue',
      'create',
      '--title',
      params.title,
      '--body',
      params.body,
      '--json',
      'url,number',
    ];

    if (params.labels && params.labels.length > 0) {
      for (const label of params.labels) {
        args.push('--label', label);
      }
    }

    const raw = this.execGh(args);
    const parsed = JSON.parse(raw);
    return { url: parsed.url, number: parsed.number };
  }

  // -----------------------------------------------------------------------
  // Pull Requests
  // -----------------------------------------------------------------------

  /**
   * List pull requests in the repository.
   * Default state is "open"; set `options.state` to "closed" or "all" to
   * override. Use `options.limit` to cap results.
   */
  async listPRs(
    options?: { state?: 'open' | 'closed' | 'all'; limit?: number },
  ): Promise<PRItem[]> {
    const args: string[] = [
      'pr',
      'list',
      '--json',
      'number,title,state,url,createdAt,author,mergeable',
    ];

    if (options?.state) {
      args.push('--state', options.state);
    }
    if (options?.limit != null) {
      args.push('--limit', String(options.limit));
    }

    const raw = this.execGh(args);
    if (!raw) return [];

    return (JSON.parse(raw) as any[]).map((item) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      url: item.url,
      createdAt: item.createdAt,
      user: item.author?.login ?? '',
      mergeable:
        item.mergeable === 'MERGEABLE' || item.mergeable === true,
    }));
  }

  /**
   * Create a new pull request.
   *
   * `base` is the target branch (e.g. "main") and `head` is the source branch
   * (e.g. "feature/foo"). The PR is created immediately without opening an
   * editor because both `--title` and `--body` are supplied.
   */
  async createPR(params: {
    title: string;
    body: string;
    base: string;
    head: string;
  }): Promise<{ url: string; number: number }> {
    const args: string[] = [
      'pr',
      'create',
      '--title',
      params.title,
      '--body',
      params.body,
      '--base',
      params.base,
      '--head',
      params.head,
      '--json',
      'url,number',
    ];

    const raw = this.execGh(args);
    const parsed = JSON.parse(raw);
    return { url: parsed.url, number: parsed.number };
  }

  /**
   * Return all **review comments** (line-level diff comments) for a given PR.
   *
   * Uses `gh api` to call `GET /repos/:owner/:repo/pulls/:number/comments`.
   */
  async getPRReviews(prNumber: number): Promise<ReviewComment[]> {
    const ownerRepo = await this.resolveOwnerRepo();

    const args: string[] = [
      'api',
      `repos/${ownerRepo}/pulls/${prNumber}/comments`,
      '--jq',
      '[.[] | {id, body, path, line, author: .user.login, createdAt: .created_at}]',
    ];

    const raw = this.execGh(args);

    // An empty result set produces an empty string from `gh api` when using
    // `--jq` with an array constructor; treat it as an empty array.
    if (!raw || raw === 'null') return [];

    const items = JSON.parse(raw) as any[];
    return items.map((item) => ({
      id: item.id,
      body: item.body,
      path: item.path,
      line: item.line,
      author: item.author,
      createdAt: item.createdAt,
    }));
  }

  /**
   * Post a **non-review** comment on a PR (appears in the PR's issue-style
   * timeline).
   *
   * Equivalent to clicking "Comment" in the PR conversation tab.
   */
  async createPRComment(prNumber: number, body: string): Promise<void> {
    this.execGh([
      'pr',
      'comment',
      String(prNumber),
      '--body',
      body,
    ]);
  }

  /**
   * Post a **line-specific review comment** on a PR diff.
   *
   * Unlike `createPRComment` (which posts to the conversation timeline), this
   * creates a review comment attached to a specific file and line in the diff.
   *
   * @param prNumber – The PR number.
   * @param body     – The comment text.
   * @param commitId – The SHA of the commit the comment is being made on.
   * @param path     – The file path (relative to repo root) being commented on.
   * @param line     – The line number in the file (must be part of the diff).
   */
  async createReviewComment(
    prNumber: number,
    body: string,
    commitId: string,
    path: string,
    line: number,
  ): Promise<void> {
    const ownerRepo = await this.resolveOwnerRepo();

    this.execGh([
      'api',
      `repos/${ownerRepo}/pulls/${prNumber}/comments`,
      '--method',
      'POST',
      '--field',
      `body=${body}`,
      '--field',
      `commit_id=${commitId}`,
      '--field',
      `path=${path}`,
      '--field',
      `line=${line}`,
    ]);
  }
}
