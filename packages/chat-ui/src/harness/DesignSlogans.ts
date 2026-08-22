/**
 * HARB-T05: Design Slogans (설계 슬로건)
 *
 * 5대 설계 슬로건 — 하네스 동작 원칙을 모델에게 주입하는 프롬프트 블록.
 *
 * PRD: PRD-Harness-05_Design_Slogans.md
 */

/**
 * 5대 설계 슬로건 프롬프트 블록.
 */
export const DESIGN_SLOGANS_PROMPT = `
## Design Principles (5 Slogans)

### 1. Search is Code, Judgment is Model
Tools (grep, codebase_search, glob, read_file, read_files) run in parallel by the system — you analyze results and decide.
Locate with search first, then batch-read needed windows (\`read_files\` or many \`read_file\` in one turn; ~250 lines via offset/limit).
**Never invent file paths** — if the path did not come from the user or a prior tool result, call \`glob\` / \`file_search\` / \`codebase_search\` first. ENOENT = wrong path (not a permission block).
DO NOT drip-read 2–4 files across many turns.

### 2. One Turn, One Task
One turn = one decision cycle (often a read batch) → check results → next decision.
- Max tool calls per turn: 12
- Write tools: max 1 per turn
- Read tools: batch many in one turn (\`read_files\` up to 12 paths)
- Plan with \`todo_write\` before acting

### 3. Failure as Value
Errors are NOT exceptions — they are tool results.
- Parse failure → retry with fixed format
- Lint error → fix and retry (max 2 attempts)
- Timeout → retry with simpler approach
- Never throw, always return data

### 4. Narrow Schema
You only see tools allowed for your current tier and mode.
- Tier A: core tools only (includes codebase_search for locate → windowed read)
- If a tool is not visible, it's not available — don't try to use it
- Optional tools may be enabled by configuration

### 5. Verify First, Restrict Later
"Check before you act, fix after you break."
- Read before edit
- Lint after edit
- Test after fix
- Ask when unsure
`;

/**
 * 디자인 슬로건을 시스템 프롬프트에 주입한다.
 */
export function injectDesignSlogans(systemPrompt: string): string {
  if (systemPrompt.includes('Design Principles (5 Slogans)')) {
    return systemPrompt;
  }
  return systemPrompt + '\n' + DESIGN_SLOGANS_PROMPT;
}
