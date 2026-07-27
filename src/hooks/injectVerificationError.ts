/**
 * injectVerificationError - tool_result에 린트/테스트 실패 주입 (C2-T20 / ADDON-T01)
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

/** ADDON-T01: related test failure → model-facing tool_result payload */
export function injectTestVerificationError(
  output: string,
  testFiles: string[],
  retryCount: number,
  maxRetries: number
): { content: string; shouldStop: boolean } {
  const fileList = testFiles.map((f) => `  - ${f}`).join('\n');
  const clipped = output.slice(0, 8000);

  if (retryCount >= maxRetries) {
    return {
      content:
        `<system>Maximum retries (${maxRetries}/${maxRetries}) reached. Related tests still fail.\n` +
        `<test_files>\n${fileList}\n</test_files>\n` +
        `<test_output>\n${clipped}\n</test_output>\n` +
        'Please ask the user for guidance on how to proceed.</system>',
      shouldStop: true,
    };
  }

  return {
    content:
      `<system>Test verification failed (attempt ${retryCount + 1}/${maxRetries}).\n` +
      `<test_files>\n${fileList}\n</test_files>\n` +
      `<test_output>\n${clipped}\n</test_output>\n` +
      'Fix the failing tests (or the code under test) and try again.</system>',
    shouldStop: false,
  };
}

function formatLintErrors(errors: LintError[]): string {
  const lines = errors.map(e =>
    `  ❌ ${e.file}:${e.line}:${e.column} ${e.message}${e.code ? ` (${e.code})` : ''}`
  );
  return '<lint_errors>\n' + lines.join('\n') + '\n</lint_errors>';
}
