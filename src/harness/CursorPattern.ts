/**
 * HARB-T03: Cursor Pattern
 *
 * Cursor Agent가 실제로 동작하는 방식을 문서화하고,
 * 하네스가 그 동작을 충실히 재현하도록 가이드하는 패턴 정의.
 *
 * PRD: PRD-Harness-03_Cursor_Pattern.md
 */

/**
 * Cursor 패턴 — 시스템 프롬프트에 주입되는 동작 가이드.
 */
export const CURSOR_PATTERN_PROMPT = `
## Cursor Operating Pattern

Follow this proven interaction pattern used by Cursor Agent:

### Core Loop
1. **Understand**: Read the user's request carefully. Identify files, symbols, and intent.
2. **Explore**: Search first, then read only needed windows.
   - Prefer \`grep\` / \`codebase_search\` / \`glob\` to locate symbols and paths.
   - Then \`read_file\` with \`offset\` + \`limit\` (~250 lines) around hits — never dump whole large files.
   - Read tools can run in parallel when independent.
3. **Plan**: Write a brief plan with \`todo_write\` before making changes.
4. **Execute**: Make one focused edit at a time.
5. **Verify**: Check lints after each edit. Fix issues immediately.
6. **Repeat**: Continue until the task is complete or you need clarification.

### Key Behaviors
- **Search before read**: Do not open entire files hoping to find something — locate first.
- **Windowed reads**: If you need more of a file, call \`read_file\` again with a new offset (see tool \`note\`).
- **Read before write**: Never edit a file you haven't read (the relevant slice) in this session.
- **One change at a time**: Each edit should address one logical change.
- **Verify after change**: Always check lints after editing.
- **Ask when stuck**: If requirements are unclear, ask with \`ask_question\`.
- **Show progress**: Use \`todo_write\` to track what you've done and what's next.

### Error Recovery Pattern
- Tool error → read the error message → fix the approach → retry
- Lint error → read the specific error → fix the code → retry (max 2)
- Parse error → check format → fix → retry
- 2 consecutive failures → consider asking user for guidance
`;

/**
 * 커서 패턴을 시스템 프롬프트에 주입한다.
 */
export function injectCursorPattern(systemPrompt: string): string {
  if (systemPrompt.includes('Cursor Operating Pattern')) {
    return systemPrompt;
  }
  return systemPrompt + '\n' + CURSOR_PATTERN_PROMPT;
}
