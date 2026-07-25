/**
 * CommitMessageGenerator — git diff 기반 커밋 메시지 / PR 설명 생성 (C7-T24)
 *
 * - Staged diff / branch diff 읽기
 * - LM 연동을 통한 커밋 메시지 / PR 설명 자동 생성
 * - 사용자 편집 가능 (메모리 상 반환)
 * - gh CLI 연동 (PR 생성)
 * - Conventional commits 형식 기본 지원
 */
import { execFileSync } from 'child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChangeSummary {
  file: string;
  type: 'added' | 'modified' | 'deleted';
  insertions: number;
  deletions: number;
}

export interface CommitMessageOptions {
  /** 커밋 메시지 스타일 (기본값: 'conventional') */
  style?: 'conventional' | 'simple' | 'detailed';
}

export interface CommitResult {
  success: boolean;
  hash?: string;
  error?: string;
}

export interface DiffSummary {
  stats: string;
  files: string[];
  insertions: number;
  deletions: number;
}

export interface GeneratedCommitMessage {
  title: string;
  body: string;
}

export interface GeneratedPRDescription {
  title: string;
  body: string;
  changes: ChangeSummary[];
}

/**
 * LM 제공자가 구현해야 할 최소 인터페이스.
 * `generate(prompt, system?)`는 완성된 텍스트를 반환한다.
 */
export interface MessageGeneratorLM {
  generate(prompt: string, system?: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// CommitMessageGenerator
// ---------------------------------------------------------------------------

export class CommitMessageGenerator {
  private repoRoot: string;
  private lm: MessageGeneratorLM | null = null;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  // -----------------------------------------------------------------------
  // LM provider management
  // -----------------------------------------------------------------------

  /**
   * 커밋 메시지 / PR 설명 생성을 위한 LM 제공자를 등록한다.
   * 등록하지 않으면 템플릿 기반 간이 생성(fallback)을 사용한다.
   */
  setLMProvider(lm: MessageGeneratorLM): void {
    this.lm = lm;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Staged diff 로부터 커밋 메시지를 생성한다.
   *
   * @param options.style  메시지 스타일 (conventional | simple | detailed)
   * @returns 생성된 커밋 메시지 (title + body)
   */
  async generateCommitMessage(
    options?: CommitMessageOptions,
  ): Promise<GeneratedCommitMessage> {
    const style = options?.style ?? 'conventional';

    // 1. Staged diff 정보 수집
    const diffStat = this.execGit([
      'diff',
      '--cached',
      '--stat',
      '--diff-algorithm=minimal',
    ]);
    const diffContent = this.execGit([
      'diff',
      '--cached',
      '--diff-algorithm=minimal',
    ]);

    if (!diffStat) {
      return {
        title: '(no staged changes)',
        body: 'There are no staged changes to commit.',
      };
    }

    // 2. LM 이 있으면 LM 으로 생성, 없으면 fallback
    if (this.lm) {
      return this.generateWithLM(diffStat, diffContent, style);
    }

    // 3. Fallback: 통계 기반 간이 생성
    return this.generateFallback(diffStat, style);
  }

  /**
   * 브랜치 전체 diff (baseBranch...HEAD) 로부터 PR 설명을 생성한다.
   *
   * @param baseBranch  대상 브랜치 (기본값: 'main')
   * @returns PR 제목, 본문, 변경 파일 목록
   */
  async generatePRDescription(
    baseBranch?: string,
  ): Promise<GeneratedPRDescription> {
    const base = baseBranch ?? 'main';

    // 1. 브랜치 diff 정보 수집
    const diffStat = this.execGit([
      'diff',
      `${base}...HEAD`,
      '--stat',
      '--diff-algorithm=minimal',
    ]);
    const diffContent = this.execGit([
      'diff',
      `${base}...HEAD`,
      '--diff-algorithm=minimal',
    ]);

    // 2. ChangeSummary 목록 파싱
    const changes = this.parseChangeSummary(diffStat);

    if (!diffStat) {
      return {
        title: `(no changes from ${base})`,
        body: `There are no changes between the current branch and \`${base}\`.`,
        changes: [],
      };
    }

    // 3. LM 으로 생성
    if (this.lm) {
      return this.generatePRWithLM(diffStat, diffContent, base, changes);
    }

    // 4. Fallback
    return this.generatePRFallback(diffStat, base, changes);
  }

  /**
   * 커밋을 적용한다.
   *
   * @param message  커밋 메시지 (title + optional body)
   * @returns 커밋 결과 (성공 여부, hash, 오류 메시지)
   */
  async commit(
    message: { title: string; body?: string },
  ): Promise<CommitResult> {
    try {
      // 제목 + 본문 결합
      const fullMessage = message.body
        ? `${message.title}\n\n${message.body}`
        : message.title;

      const result = execFileSync(
        'git',
        ['commit', '-m', fullMessage],
        {
          cwd: this.repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 30_000,
        },
      );

      // 결과에서 hash 추출
      const hashMatch = result.match(/\[[\w\-/]+ ([a-f0-9]+)\]/);
      const hash = hashMatch ? hashMatch[1] : undefined;

      return { success: true, hash };
    } catch (error: any) {
      // git binary not found
      if (error.code === 'ENOENT') {
        return {
          success: false,
          error:
            'Git is not installed or not found in PATH. ' +
            'Please install it from https://git-scm.com/',
        };
      }

      const stderr =
        error.stderr?.toString()?.trim() ||
        error.stdout?.toString()?.trim() ||
        error.message ||
        'Unknown error';
      return { success: false, error: stderr };
    }
  }

  /**
   * Diff 요약 정보를 반환한다.
   *
   * @param base  base 브랜치 (생략 시 staged diff, 지정 시 base...HEAD diff)
   * @returns 통계 문자열, 파일 목록, 삽입/삭제 라인 수
   */
  async getDiffSummary(base?: string): Promise<DiffSummary> {
    const args: string[] = base
      ? ['diff', `${base}...HEAD`, '--stat', '--diff-algorithm=minimal']
      : ['diff', '--cached', '--stat', '--diff-algorithm=minimal'];

    const output = this.execGit(args);

    if (!output) {
      return { stats: '', files: [], insertions: 0, deletions: 0 };
    }

    const lines = output.trim().split('\n').filter(Boolean);
    const stats = lines.join('\n');

    // 파일 목록 파싱
    const fileLines = lines.filter((l) => l.startsWith(' ')) // stat 라인은 공백으로 시작
      .length === 0
      ? lines.slice(0, -1) // 마지막 줄(summary) 제외
      : lines.filter((l) => !l.includes('changed') && !l.includes('file'));

    const files = fileLines
      .map((l) => {
        const match = l.match(/^\s*(.+?)\s+\|/);
        return match ? match[1].trim() : '';
      })
      .filter(Boolean);

    // 삽입/삭제 카운트
    const summaryLine = lines[lines.length - 1] || '';
    const insertMatch = summaryLine.match(/(\d+)\s+insertion/);
    const deleteMatch = summaryLine.match(/(\d+)\s+deletion/);

    return {
      stats,
      files,
      insertions: insertMatch ? parseInt(insertMatch[1], 10) : 0,
      deletions: deleteMatch ? parseInt(deleteMatch[1], 10) : 0,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers: git
  // -----------------------------------------------------------------------

  /**
   * git 명령어를 동기적으로 실행하고 stdout 을 반환한다.
   * 명령어가 실패하면 빈 문자열을 반환한다.
   */
  private execGit(args: string[]): string {
    try {
      const result = execFileSync('git', args, {
        cwd: this.repoRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
      });
      return result.trim();
    } catch {
      return '';
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers: parsing
  // -----------------------------------------------------------------------

  /**
   * `git diff --stat` 출력에서 ChangeSummary 목록을 파싱한다.
   */
  private parseChangeSummary(statOutput: string): ChangeSummary[] {
    if (!statOutput) return [];

    const lines = statOutput.trim().split('\n').filter(Boolean);
    const changes: ChangeSummary[] = [];

    for (const line of lines) {
      // " <file> | <count> (+/-)" 형식 또는 " <file> => <file>" (rename)
      const fileMatch = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s+([+-]+)/);
      if (!fileMatch) continue;

      const file = fileMatch[1].trim();
      const insertions = (fileMatch[3].match(/\+/g) || []).length;
      const deletions = (fileMatch[3].match(/-/g) || []).length;

      let type: ChangeSummary['type'] = 'modified';

      // 새 파일 감지 (0 → 0+)
      if (line.includes('new file')) {
        type = 'added';
      } else if (line.includes('deleted')) {
        type = 'deleted';
      } else if (deletions > 0 && insertions === 0) {
        // 삭제만 있는 경우는 diff stat 문맥에 따라 다름
      }

      changes.push({ file, type, insertions, deletions });
    }

    // stat 만으로 new/deleted 를 정확히 파악하기 어려우므로
    // 파일명에 'new file' / 'deleted' 키워드가 없으면 modified 로 간주한다.
    // 더 정확한 파싱을 위해 --diff-filter 옵션을 쓸 수 있지만
    // 여기서는 stat 출력으로 충분히 추론한다.

    return changes;
  }

  // -----------------------------------------------------------------------
  // Private: LM-based generation
  // -----------------------------------------------------------------------

  /**
   * LM 을 통해 커밋 메시지를 생성한다.
   */
  private async generateWithLM(
    diffStat: string,
    diffContent: string,
    style: 'conventional' | 'simple' | 'detailed',
  ): Promise<GeneratedCommitMessage> {
    const styleGuide = this.getStyleGuide(style);

    // Diff 가 너무 길면 stat 만 전달
    const maxDiffLen = 4000;
    const truncatedDiff =
      diffContent.length > maxDiffLen
        ? diffContent.slice(0, maxDiffLen) +
          '\n... (diff truncated, see stat for overview)'
        : diffContent;

    const prompt = [
      'Below is a git diff. Please generate a commit message.',
      '',
      '## Diff Stat',
      '```',
      diffStat,
      '```',
      '',
      '## Diff Content',
      '```diff',
      truncatedDiff,
      '```',
      '',
      '## Instructions',
      styleGuide,
      '',
      'Respond with a JSON object with exactly two fields:',
      '- "title": the commit title (one line)',
      '- "body": the commit body (detailed description, can be empty string if not needed)',
      '',
      'Return ONLY valid JSON, no markdown fences, no extra text.',
    ].join('\n');

    const system =
      'You are an expert software engineer generating git commit messages. ' +
      'Follow the specified style precisely. Output only valid JSON.';

    const response = await this.lm!.generate(prompt, system);
    return this.parseMessageResponse(response, style);
  }

  /**
   * LM 을 통해 PR 설명을 생성한다.
   */
  private async generatePRWithLM(
    diffStat: string,
    diffContent: string,
    baseBranch: string,
    changes: ChangeSummary[],
  ): Promise<GeneratedPRDescription> {
    const maxDiffLen = 4000;
    const truncatedDiff =
      diffContent.length > maxDiffLen
        ? diffContent.slice(0, maxDiffLen) +
          '\n... (diff truncated, see stat for overview)'
        : diffContent;

    const changesSummary = changes
      .map(
        (c) =>
          `- ${c.file} (${c.type}, +${c.insertions}/-${c.deletions})`,
      )
      .join('\n');

    const prompt = [
      'Below is a git diff against the base branch. Please generate a Pull Request description.',
      '',
      `Base branch: ${baseBranch}`,
      '',
      '## Diff Stat',
      '```',
      diffStat,
      '```',
      '',
      '## Changed Files',
      changesSummary,
      '',
      '## Diff Content',
      '```diff',
      truncatedDiff,
      '```',
      '',
      '## Instructions',
      '- Generate a concise PR title that summarizes the changes.',
      '- Write a detailed PR body explaining: what was changed, why, and any important notes.',
      '- Use bullet points for readability.',
      '- Keep the total body under 500 words.',
      '',
      'Respond with a JSON object with exactly two fields:',
      '- "title": the PR title (one line)',
      '- "body": the PR body (markdown, detailed description)',
      '',
      'Return ONLY valid JSON, no markdown fences, no extra text.',
    ].join('\n');

    const system =
      'You are an expert software engineer generating Pull Request descriptions. ' +
      'Output only valid JSON.';

    const response = await this.lm!.generate(prompt, system);
    const parsed = this.parseMessageResponse(response, 'detailed');

    return {
      title: parsed.title,
      body: parsed.body,
      changes,
    };
  }

  /**
   * LM 응답 JSON 을 파싱한다.
   * 파싱 실패 시 fallback 값을 반환한다.
   */
  private parseMessageResponse(
    raw: string,
    _style: string,
  ): { title: string; body: string } {
    try {
      // JSON 만 추출 (markdown fence 제거)
      let json = raw.trim();
      if (json.startsWith('```')) {
        json = json.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      }
      const parsed = JSON.parse(json);

      if (typeof parsed.title === 'string' && parsed.title) {
        return {
          title: parsed.title.trim(),
          body: typeof parsed.body === 'string' ? parsed.body.trim() : '',
        };
      }
    } catch {
      // Parse error — fall through to fallback
    }

    // Fallback: raw 응답에서 title/body 추론
    const lines = raw.split('\n').filter(Boolean);
    const title = lines[0]?.replace(/^#\s*/, '').trim() || 'Update';
    const body = lines.slice(1).join('\n').trim();

    return { title, body };
  }

  // -----------------------------------------------------------------------
  // Private: fallback generation (no LM)
  // -----------------------------------------------------------------------

  /**
   * LM 없이 diff stat 만으로 간이 커밋 메시지를 생성한다.
   */
  private generateFallback(
    diffStat: string,
    style: 'conventional' | 'simple' | 'detailed',
  ): GeneratedCommitMessage {
    const summary = this.parseChangeSummary(diffStat);
    const fileCount = summary.length;
    const insertions = summary.reduce((s, c) => s + c.insertions, 0);
    const deletions = summary.reduce((s, c) => s + c.deletions, 0);

    const files = summary.map((c) => c.file);
    const types = new Set(summary.map((c) => c.type));
    const hasNew = types.has('added');
    const hasDel = types.has('deleted');

    // Conventional commit type 추론
    let commitType = 'chore';
    const fileNames = files.join(' ').toLowerCase();
    if (
      fileNames.includes('test') ||
      fileNames.includes('spec') ||
      fileNames.includes('__tests__')
    ) {
      commitType = 'test';
    } else if (fileNames.includes('fix') || fileNames.includes('bug')) {
      commitType = 'fix';
    } else if (
      fileNames.includes('feat') ||
      fileNames.includes('feature') ||
      fileNames.includes('add')
    ) {
      commitType = 'feat';
    } else if (
      fileNames.includes('refactor') ||
      fileNames.includes('rework')
    ) {
      commitType = 'refactor';
    } else if (fileNames.includes('doc') || fileNames.includes('readme')) {
      commitType = 'docs';
    }

    const scope = files.length <= 3 ? files[0]?.replace(/^.*\//, '') : undefined;
    const scopePart = scope ? `(${scope})` : '';

    // Title
    const action = hasNew && hasDel ? 'Update' : hasNew ? 'Add' : hasDel ? 'Remove' : 'Update';
    const shortDesc =
      fileCount <= 3
        ? files.map((f) => f.split('/').pop()).join(', ')
        : `${fileCount} files`;

    let title: string;
    switch (style) {
      case 'simple':
        title = `${action} ${shortDesc}`;
        break;
      case 'detailed':
        title = `${action} ${shortDesc} (+${insertions}/-${deletions})`;
        break;
      case 'conventional':
      default:
        title = `${commitType}${scopePart}: ${action.toLowerCase()} ${shortDesc}`;
        break;
    }

    // Body
    const bodyParts: string[] = [];
    if (style === 'detailed') {
      bodyParts.push(`## Summary`);
      bodyParts.push(``);
      bodyParts.push(`- **Files changed:** ${fileCount}`);
      bodyParts.push(`- **Insertions:** ${insertions}`);
      bodyParts.push(`- **Deletions:** ${deletions}`);
      bodyParts.push(``);
      bodyParts.push(`### Changes`);
      for (const c of summary) {
        bodyParts.push(`- \`${c.file}\` (${c.type}, +${c.insertions}/-${c.deletions})`);
      }
    }

    return {
      title,
      body: bodyParts.join('\n'),
    };
  }

  /**
   * LM 없이 PR 설명을 간이 생성한다.
   */
  private generatePRFallback(
    diffStat: string,
    baseBranch: string,
    changes: ChangeSummary[],
  ): GeneratedPRDescription {
    const stats = diffStat.trim().split('\n');
    const summaryLine = stats[stats.length - 1] || '';
    const insertions = changes.reduce((s, c) => s + c.insertions, 0);
    const deletions = changes.reduce((s, c) => s + c.deletions, 0);
    const fileCount = changes.length;

    const title = `Update ${fileCount} file${fileCount !== 1 ? 's' : ''} (+${insertions}/-${deletions})`;

    const bodyParts: string[] = [
      `## Description`,
      ``,
      `This PR updates ${fileCount} file${fileCount !== 1 ? 's' : ''} against \`${baseBranch}\`.`,
      ``,
      `## Changes`,
      ``,
    ];

    for (const c of changes) {
      const emoji =
        c.type === 'added'
          ? '🆕'
          : c.type === 'deleted'
            ? '🗑️'
            : '📝';
      bodyParts.push(
        `- ${emoji} **\`${c.file}\`** — ${c.type}, +${c.insertions}/-${c.deletions} lines`,
      );
    }

    bodyParts.push(``);
    bodyParts.push(`## Stats`);
    bodyParts.push(``);
    bodyParts.push(`- **Total changes:** +${insertions} / -${deletions}`);
    bodyParts.push(`- **Files modified:** ${fileCount}`);
    bodyParts.push(`- **Base branch:** \`${baseBranch}\``);

    return {
      title,
      body: bodyParts.join('\n'),
      changes,
    };
  }

  // -----------------------------------------------------------------------
  // Private: style guides
  // -----------------------------------------------------------------------

  private getStyleGuide(
    style: 'conventional' | 'simple' | 'detailed',
  ): string {
    switch (style) {
      case 'conventional':
        return [
          'Use the Conventional Commits format:',
          '  <type>(<scope>): <description>',
          '',
          'Types: feat, fix, docs, style, refactor, perf, test, chore, ci, build, revert',
          'Scope is optional but recommended (e.g., the module/component name).',
          'Description: imperative, lowercase, no period at end.',
          '',
          'Examples:',
          '  feat(auth): add OAuth2 login flow',
          '  fix(parser): handle null input in parseConfig',
          '  docs(readme): update installation instructions',
          '',
          'If multiple scopes are involved, omit the scope or use a general one.',
          'Keep the title under 72 characters.',
          'The body should explain WHAT and WHY, not HOW.',
        ].join('\n');

      case 'simple':
        return [
          'Generate a one-line commit message.',
          '- Capitalize the first word.',
          '- Use imperative mood.',
          '- No period at the end.',
          '- Keep under 72 characters.',
          '- The body can be empty.',
        ].join('\n');

      case 'detailed':
        return [
          'Generate a commit message with:',
          '- A concise title (one line, under 72 chars, imperative mood).',
          '- A detailed body that explains the motivation for the change.',
          '- Use bullet points in the body for multiple points.',
          '- Include any breaking changes or deprecations.',
          '- Reference issue numbers if apparent from the diff.',
        ].join('\n');

      default:
        return 'Generate a clear, concise commit message.';
    }
  }
}
