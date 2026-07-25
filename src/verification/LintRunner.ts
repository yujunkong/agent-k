/**
 * LintRunner - vscode.languages.getDiagnostics 파싱 (C2-T19)
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
  async runLint(filePaths: string[]): Promise<LintError[]> {
    const errors: LintError[] = [];

    // Stub: In real VS Code extension, use vscode.languages.getDiagnostics()
    // For now, scan files for basic syntax issues
    for (const filePath of filePaths) {
      try {
        const fs = require('fs');
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
          code: 'no-explicit-any'
        });
      }

      if (line.match(/console\.(log|warn|error)\(/) && !line.includes('// eslint-disable')) {
        errors.push({
          file: filePath,
          line: lineNum,
          column: line.indexOf('console') + 1,
          message: 'Unexpected console statement. Remove before committing.',
          severity: 'warning',
          code: 'no-console'
        });
      }

      // Detect unused variables (simple heuristic: declared but only used once)
      const declaredVar = line.match(/(?:const|let|var)\s+(\w+)/);
      if (declaredVar) {
        const varName = declaredVar[1];
        const usageCount = (content.match(new RegExp(varName, 'g')) || []).length;
        if (usageCount <= 1) {
          errors.push({
            file: filePath,
            line: lineNum,
            column: line.indexOf(varName) + 1,
            message: `Variable '${varName}' is declared but never used.`,
            severity: 'warning',
            code: 'no-unused-vars'
          });
        }
      }
    }

    return errors;
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
