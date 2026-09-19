/**
 * LintRunner - lint diagnostics surface (C2-T19).
 * B-2: the webview cannot read fs/vscode — the host owns lint execution
 * (`read_lints` micro-loop). runLint degrades to [] in the webview.
 */
export interface LintError {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code?: string;
}

export class LintRunner {
  /** Host-owned lint execution — webview returns no diagnostics. */
  async runLint(_filePaths: string[]): Promise<LintError[]> {
    return [];
  }

  /**
   * 에러가 있는 파일:줄 블록 구성
   */
  formatErrors(errors: LintError[]): string {
    if (errors.length === 0) return '';

    const groups = new Map<string, LintError[]>();
    for (const err of errors) {
      if (!groups.has(err.file)) groups.set(err.file, []);
      groups.get(err.file)!.push(err);
    }

    const blocks: string[] = [];
    blocks.push('<lint_errors>');

    for (const [file, fileErrors] of groups) {
      blocks.push(`File: ${file}`);
      for (const err of fileErrors) {
        const level = err.severity === 'error' ? '❌' : err.severity === 'warning' ? '⚠️' : 'ℹ️';
        blocks.push(`  ${level} L${err.line}:${err.column} ${err.message}${err.code ? ` (${err.code})` : ''}`);
      }
      blocks.push('');
    }

    blocks.push('</lint_errors>');
    return blocks.join('\n');
  }
}
