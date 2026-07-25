/**
 * injectVerificationError - tool_result에 린트 에러 주입 + retryCount 증가 (C2-T20)
 */
import type { LintError } from '../verification/LintRunner';

export function injectVerificationError(
  lintErrors: LintError[],
  retryCount: number,
  maxRetries: number
): { content: string; shouldStop: boolean } {
  if (lintErrors.length === 0) {
    return { content: '', shouldStop: false };
  }

  if (retryCount >= maxRetries) {
    return {
      content: `<system>Maximum retries (${maxRetries}/${maxRetries}) reached. ${lintErrors.length} lint error(s) persist.\n` +
        formatLintErrors(lintErrors) +
        '\nPlease ask the user for guidance on how to proceed.</system>',
      shouldStop: true
    };
  }

  return {
    content: `<system>Lint verification failed (attempt ${retryCount + 1}/${maxRetries}).\n` +
      formatLintErrors(lintErrors) +
      `\nFix the issues above and try again.</system>`,
    shouldStop: false
  };
}

function formatLintErrors(errors: LintError[]): string {
  const lines = errors.map(e =>
    `  ❌ ${e.file}:${e.line}:${e.column} ${e.message}${e.code ? ` (${e.code})` : ''}`
  );
  return '<lint_errors>\n' + lines.join('\n') + '\n</lint_errors>';
}
