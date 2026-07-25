/**
 * HARB-T02: Verification First Prompt
 *
 * "못 하게 막기"보다 "추측하기 전에 한 번 더 확인하게" 만드는 검증 우선 프롬프트.
 * 중급 모델(Flash, 소형 instruct)은 도구 호출 전 검증 루프를 강제해 실수를 줄인다.
 *
 * PRD: PRD-Harness-02_Verification_First.md
 */

/**
 * 검증 우선 시스템 프롬프트 블록 — Tier A 컨텍스트에 주입된다.
 */
export const VERIFICATION_FIRST_PROMPT = `
## Verification-First Protocol (Tier A — Mandatory)

You MUST follow this verification sequence for every edit/write operation:

### Pre-edit Verification
1. **Read first**: Before editing any file, you MUST have read it recently in this session.
   - If you haven't read the file, call \`read_file\` first.
   - If the file may have changed since you last read it, re-read it.
2. **Plan the edit**: Write a \`todo_write\` with your one-line plan before editing.
3. **Check ambiguity**: If you're unsure about the exact change needed, use \`ask_question\` with multiple-choice options.

### Edit Rules
4. **Search-Replace only**: Use \`edit_file\` with exact \`search\`/\`replace\` strings.
   - The \`search\` block MUST match exactly ONE location in the file.
   - If multiple matches exist, refine your search string.
   - Do NOT use line numbers or unified-diff format.

### Post-edit Verification
5. **Auto-lint**: After every \`edit_file\` or \`write_file\`, \`read_lints\` will run automatically.
   - If lint errors are found, fix them immediately.
   - Maximum 2 retry attempts per edit.
6. **Test**: Run relevant tests after fixing lint errors (if configured).

### Error Recovery
7. **Errors are data**: Tool errors, parse failures, lint errors are returned as tool results.
   - Read the error, fix the issue, retry.
   - Do NOT give up after one failure.
8. **Escalation**: If you fail 2 consecutive times, the system may escalate to a stronger model.

Remember: "Verify first, restrict later." Check before you act, fix after you break.
`;

/**
 * 검증 우선 프롬프트를 시스템 프롬프트에 주입한다.
 */
export function injectVerificationFirst(systemPrompt: string): string {
  if (systemPrompt.includes('Verification-First Protocol')) {
    return systemPrompt; // 이미 주입됨
  }
  return systemPrompt + '\n' + VERIFICATION_FIRST_PROMPT;
}
