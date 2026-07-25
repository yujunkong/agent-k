/**
 * AgentReviewLoop — git diff 수집 → 정적 힌트 + LM 리뷰 프롬프트 (C7-T11)
 */
import { execSync } from 'child_process';

export interface ReviewFinding {
  id: string;
  file: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
  rule?: string;
  accepted?: boolean;
}

export interface ReviewResult {
  findings: ReviewFinding[];
  diffSummary: string;
  totalFiles: number;
  totalInsertions: number;
  totalDeletions: number;
}

export class AgentReviewLoop {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Run review on current staged/unstaged changes
   */
  reviewDiff(baseBranch: string = 'HEAD'): ReviewResult {
    const diffOutput = execSync(
      `git diff ${baseBranch} --stat`,
      { cwd: this.repoRoot, stdio: 'pipe' }
    ).toString().trim();

    const diffLines = diffOutput.split('\n').filter(l => l.trim());
    const files = diffLines.filter(l => l.includes('|')).length;

    // Parse insertions/deletions
    let insertions = 0;
    let deletions = 0;
    for (const line of diffLines) {
      const insMatch = line.match(/(\d+)\s*\+{1}(?!\+)/);
      const delMatch = line.match(/(\d+)\s*-{1}(?!-)/);
      if (insMatch) insertions += parseInt(insMatch[1], 10);
      if (delMatch) deletions += parseInt(delMatch[1], 10);
    }

    // Generate static hints
    const findings = this.generateStaticHints();

    return {
      findings,
      diffSummary: diffOutput,
      totalFiles: files,
      totalInsertions: insertions,
      totalDeletions: deletions
    };
  }

  /**
   * Generate LM review prompt
   */
  buildLMPrompt(findings: ReviewFinding[]): string {
    if (findings.length === 0) return '';

    return [
      '## Code Review Request',
      '',
      `Please review the following ${findings.length} finding(s) and provide suggestions:`,
      '',
      ...findings.map((f, i) =>
        `${i + 1}. [${f.severity.toUpperCase()}] ${f.file}:${f.line} — ${f.message}` +
        (f.suggestion ? `\n   Suggestion: ${f.suggestion}` : '')
      ),
      '',
      'For each finding, indicate: Accept (fix automatically), Dismiss, or needs discussion.'
    ].join('\n');
  }

  /**
   * Get diff content for a specific file
   */
  getFileDiff(filePath: string): string {
    try {
      return execSync(
        `git diff HEAD -- "${filePath}"`,
        { cwd: this.repoRoot, stdio: 'pipe' }
      ).toString().trim();
    } catch {
      return '';
    }
  }

  private generateStaticHints(): ReviewFinding[] {
    const findings: ReviewFinding[] = [];

    try {
      // Check for TODO/FIXME markers
      const todoOutput = execSync(
        `git diff HEAD | grep -n 'TODO\\|FIXME\\|HACK\\|XXX' || true`,
        { cwd: this.repoRoot, stdio: 'pipe' }
      ).toString().trim();

      if (todoOutput) {
        findings.push({
          id: `static-${findings.length + 1}`,
          file: 'multiple',
          line: 0,
          severity: 'info',
          message: 'Found TODO/FIXME/HACK markers in diff',
          suggestion: 'Consider addressing these before finalizing.'
        });
      }

      // Check for console.log in diff
      const consoleOutput = execSync(
        `git diff HEAD | grep -n 'console\\.log\\|console\\.debug' || true`,
        { cwd: this.repoRoot, stdio: 'pipe' }
      ).toString().trim();

      if (consoleOutput) {
        findings.push({
          id: `static-${findings.length + 1}`,
          file: 'multiple',
          line: 0,
          severity: 'warning',
          message: 'Found console.log/debug statements in diff',
          suggestion: 'Remove or replace with proper logging.'
        });
      }

      // Check for large files
      const diffStat = execSync(
        `git diff HEAD --stat`,
        { cwd: this.repoRoot, stdio: 'pipe' }
      ).toString().trim();

      for (const line of diffStat.split('\n')) {
        const match = line.match(/(\d+)\s*\+{1,}/);
        if (match && parseInt(match[1], 10) > 100) {
          const filePath = line.split('|')[0].trim();
          findings.push({
            id: `static-${findings.length + 1}`,
            file: filePath,
            line: 0,
            severity: 'info',
            message: `Large diff: ${match[1]}+ lines`,
            suggestion: 'Consider splitting into smaller changes.'
          });
        }
      }
    } catch { /* ignore static analysis errors */ }

    return findings;
  }
}
