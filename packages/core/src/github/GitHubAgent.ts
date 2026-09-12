/**
 * GitHubAgent — GH-001~003: GitHub agent workflow (gh CLI)
 * (v2.1 동작 동등 이식 — node 빌트인 execFileSync, raw strings passed directly to gh)
 */
import { execFileSync } from 'child_process';

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
    try {
      const result = execFileSync('gh', args, {
        cwd: this.repoRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
      });
      return result.trim();
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
      // gh binary not found in PATH
      if (err.code === 'ENOENT') {
        throw new Error(
          'GitHub CLI (gh) is not installed or not found in PATH. ' +
            'Please install it from https://cli.github.com/',
        );
      }

      const stderr =
        err.stderr?.toString()?.trim() ||
        err.stdout?.toString()?.trim() ||
        err.message ||
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
   * Returns a structured result instead of throwing.
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
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string; message?: string };
      // gh binary not found
      if (err.code === 'ENOENT') {
        return {
          authenticated: false,
          error:
            'GitHub CLI (gh) is not installed or not found in PATH. Please install it.',
        };
      }

      const stderr: string =
        err.stderr?.toString()?.trim() || '';
      const stdout: string =
        err.stdout?.toString()?.trim() || '';
      const combined = (stderr + '\n' + stdout).trim();

      // The user might still appear in the output even when the command fails
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
          combined || err.message || 'Authentication check failed.',
      };
    }
  }

  // -----------------------------------------------------------------------
  // Issues
  // -----------------------------------------------------------------------

  /**
   * List issues in the repository.
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

    return (JSON.parse(raw) as Record<string, unknown>[]).map((item) => ({
      number: item.number as number,
      title: item.title as string,
      state: item.state as string,
      url: item.url as string,
      createdAt: item.createdAt as string,
      labels: ((item.labels ?? []) as { name: string; color?: string }[]).map((l) => ({
        name: l.name,
        color: l.color,
      })),
      user: (item.author as { login?: string } | undefined)?.login ?? '',
    }));
  }

  /**
   * Create a new issue.
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

    return (JSON.parse(raw) as Record<string, unknown>[]).map((item) => ({
      number: item.number as number,
      title: item.title as string,
      state: item.state as string,
      url: item.url as string,
      createdAt: item.createdAt as string,
      user: (item.author as { login?: string } | undefined)?.login ?? '',
      mergeable:
        item.mergeable === 'MERGEABLE' || item.mergeable === true,
    }));
  }

  /**
   * Create a new pull request.
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

    const items = JSON.parse(raw) as Record<string, unknown>[];
    return items.map((item) => ({
      id: item.id as number,
      body: item.body as string,
      path: item.path as string,
      line: item.line as number,
      author: item.author as string,
      createdAt: item.createdAt as string,
    }));
  }

  /**
   * Post a **non-review** comment on a PR (appears in the PR's issue-style
   * timeline).
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
