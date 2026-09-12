/**
 * LintRunner — REVIEW-004 기반: 파일 기본 문법 휴리스틱 스캔 (v2.1 C2-T19 동작 동등 이식)
 * fs 기반 휴리스틱 — vscode.languages.getDiagnostics는 host에서 소비.
 */
import * as fs from 'fs';

export interface LintError {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code?: string;
}

export class LintRunner {
  async runLint(filePaths: string[]): Promise<LintError[]> {
    const errors: LintError[] = [];

    for (const filePath of filePaths) {
      try {
        if (!fs.existsSync(filePath)) continue;

        const ext = filePath.split('.').pop()?.toLowerCase();
        if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
          const content = fs.readFileSync(filePath, 'utf-8');
          const tsErrors = this.checkTypeScript(content, filePath);
          errors.push(...tsErrors);
        }
      } catch { /* ignore */ }
    }

    return errors;
  }

  private checkTypeScript(content: string, filePath: string): LintError[] {
    const errors: LintError[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for common issues
      if (line.includes('any ') && !line.includes('// eslint-disable')) {
        errors.push({
          file: filePath,
          line: lineNum,
          column: line.indexOf('any') + 1,
          message: 'Unexpected use of `any` type. Consider using a more specific type.',
          severity: 'warning',
          code: 'no-explicit-any',
        });
      }

      if (/console\.(log|debug)\(/.test(line) && !line.includes('// eslint-disable')) {
        errors.push({
          file: filePath,
          line: lineNum,
          column: line.indexOf('console') + 1,
          message: 'Unexpected console statement.',
          severity: 'warning',
          code: 'no-console',
        });
      }

      if (/TODO|FIXME|HACK|XXX/.test(line)) {
        errors.push({
          file: filePath,
          line: lineNum,
          column: line.search(/TODO|FIXME|HACK|XXX/) + 1,
          message: 'Unresolved TODO/FIXME marker.',
          severity: 'info',
          code: 'no-todo',
        });
      }
    }

    return errors;
  }
}
