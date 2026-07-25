/**
 * askOnMaxRetries - 최대 재시도 초과 시 사용자 개입 유도 (C2-T25)
 */
export function askOnMaxRetries(
  toolName: string,
  filePath: string,
  error: string,
  attempts: number
): string {
  return [
    `<system type="max_retries_exceeded">`,
    `Tool "${toolName}" failed after ${attempts} attempts on "${filePath}".`,
    `Last error: ${error.slice(0, 500)}`,
    ``,
    `The verification loop has been exhausted. Please review the situation:`,
    `1. Check if the file content is correct`,
    `2. Consider a different approach to the edit`,
    `3. Try switching to Plan mode for complex changes`,
    `</system>`,
    ``,
    `Question for user: I've tried ${attempts} times to fix the ${error.includes('lint') ? 'lint' : 'verification'} errors in "${filePath}" but haven't succeeded. Could you review the file and suggest a different approach?`
  ].join('\n');
}
