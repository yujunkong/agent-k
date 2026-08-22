/**
 * AgentReviewLoop — git diff 수집 → 정적 힌트 + LM 리뷰 프롬프트 (C7-T11 / ADDON-T14)
 */
import { execSync } from 'child_process';

/** Minimal LM provider surface AgentReviewLoop needs — no LiteLLMProvider coupling */
export interface ReviewLMProvider {
  complete: (prompt: string) => Promise<string>;
}

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
   * Run review on current staged/unstaged changes.
   * Empty diff → no-op (ADDON-T14 AC): skip static hint scans entirely.
   */
  reviewDiff(baseBranch: string = 'HEAD'): ReviewResult {
    const diffOutput = execSync(
      `git diff ${baseBranch} --stat`,
      { cwd: this.repoRoot, stdio: 'pipe' }
    ).toString().trim();

    if (!diffOutput) {
      return { findings: [], diffSummary: '', totalFiles: 0, totalInsertions: 0, totalDeletions: 0 };
    }

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

  /** Full unified diff (not just --stat) — input to the LM review prompt */
  getFullDiff(baseBranch: string = 'HEAD'): string {
    try {
      return execSync(
        `git diff ${baseBranch}`,
        { cwd: this.repoRoot, stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 }
      ).toString();
    } catch {
      return '';
    }
  }

  /** Prompt asking the LM to return findings as a JSON array only */
  buildDiffReviewPrompt(diff: string): string {
    return [
      '## Code Review Request',
      '',
      'Review the following git diff and report issues as a JSON array ONLY — no prose, no markdown fences.',
      'Each item: { "file": string, "line": number, "severity": "error"|"warning"|"info", "message": string, "suggestion"?: string, "rule"?: string }',
      'If there are no issues, return [].',
      '',
      '```diff',
      diff.slice(0, 20000),
      '```'
    ].join('\n');
  }

  /**
   * LM-backed review: static hints + an LM pass over the full diff, merged.
   * - Empty diff → no-op (same as reviewDiff).
   * - No provider → falls back to static reviewDiff only.
   * - LM call/parse failure → static findings only (never throws to the caller).
   */
  async reviewWithLM(
    provider?: ReviewLMProvider,
    baseBranch: string = 'HEAD'
  ): Promise<ReviewResult> {
    const staticResult = this.reviewDiff(baseBranch);
    if (!staticResult.diffSummary || !provider) {
      return staticResult;
    }

    try {
      const diff = this.getFullDiff(baseBranch);
      if (!diff.trim()) return staticResult;

      const raw = await provider.complete(this.buildDiffReviewPrompt(diff));
      const lmFindings = parseReviewFindingsJson(raw).map((f, i) => ({
        ...f,
        id: f.id || `lm-${staticResult.findings.length + i + 1}`
      }));

      return {
        ...staticResult,
        findings: [...staticResult.findings, ...lmFindings]
      };
    } catch {
      return staticResult;
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

/**
 * Robustly extract a JSON findings array from LM output (pure — unit-tested).
 * Tries, in order: direct JSON.parse, a fenced ```json``` block, then the
 * first `[...]` span in the text. Malformed/partial items are dropped
 * rather than throwing. Never throws — returns [] on total failure.
 */
export function parseReviewFindingsJson(text: string): ReviewFinding[] {
  if (!text || !text.trim()) return [];

  const tryParse = (raw: string): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  };

  let parsed = tryParse(text.trim());

  if (parsed === undefined) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) parsed = tryParse(fenced[1].trim());
  }

  if (parsed === undefined) {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start >= 0 && end > start) {
      parsed = tryParse(text.slice(start, end + 1));
    }
  }

  if (parsed === undefined) return [];

  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.findings)
      ? (parsed as Record<string, unknown>).findings as unknown[]
      : undefined;
  if (!Array.isArray(arr)) return [];

  const out: ReviewFinding[] = [];
  arr.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const obj = item as Record<string, unknown>;
    const message = String(obj.message ?? obj.description ?? '').trim();
    if (!message) return;
    const severityRaw = String(obj.severity ?? 'info').toLowerCase();
    const severity: ReviewFinding['severity'] =
      severityRaw === 'error' || severityRaw === 'warning' ? severityRaw : 'info';
    out.push({
      id: String(obj.id ?? `lm-${i + 1}`),
      file: String(obj.file ?? obj.path ?? 'unknown'),
      line: Number(obj.line ?? obj.lineNumber ?? 0) || 0,
      severity,
      message,
      suggestion: obj.suggestion != null ? String(obj.suggestion) : undefined,
      rule: obj.rule != null ? String(obj.rule) : undefined
    });
  });
  return out;
}
