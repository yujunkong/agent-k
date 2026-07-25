/**
 * HARB-T14: Don't Do (중급에서 독) — 하지 말아야 할 것들
 *
 * 중급 모델(Flash, 7B~30B instruct) 환경에서 절대 하지 말아야 할 안티패턴을 명문화.
 * "중급 모델에게 자율성을 주면 망한다. 하네스가 대신 해줘야 한다."
 *
 * PRD: PRD-Harness-14_Dont_Do_Medium.md
 *
 * Note: web_search / mcp_* that appear in the tool schema ARE allowed
 * (SearXNG MCP). Only tools absent from the schema stay prohibited.
 */

/**
 * "하지 말아야 할 것" 시스템 프롬프트 블록.
 */
export const DONT_DO_MEDIUM_PROMPT = `
## Don't Do (Tier A Restrictions)

The following are STRICTLY PROHIBITED for your tier:

### Tools & Schema
- ❌ Do NOT invent tools. Only call tools that appear in your current tool schema.
- ✅ DO use web_search / mcp_* / mcp_searxng_web_search when they appear in the schema (internet search via SearXNG).
- ❌ Do NOT use delete_file, browser_*, or task tools unless they appear in your schema.
- ❌ Do NOT use line numbers or unified-diff format. Use Search-Replace only.

### Execution
- ❌ Do NOT make multiple write edits in one turn. One write tool per turn max.
- ❌ Do NOT edit a file you haven't read this session. Always read first.
- ❌ Do NOT ignore lint errors. Fix them immediately after they're reported.
- ❌ Do NOT repeat the same failing action more than 2 times.

### Planning
- ❌ Do NOT attempt large refactors without a plan. Use todo_write to plan first.
- ❌ Do NOT make assumptions about code you haven't read. Read first, then decide.
- ❌ Do NOT skip asking for clarification when requirements are ambiguous.

### Memory & Context
- ❌ Do NOT store sensitive information (API keys, passwords) in memory.
- ❌ Do NOT ignore context budget limits. Keep responses concise.

Remember: If you're unsure, ask. If you failed twice, ask for help.
`;

/**
 * "하지 말아야 할 것" 프롬프트를 시스템 프롬프트에 주입한다.
 */
export function injectDontDoMedium(systemPrompt: string): string {
  if (systemPrompt.includes("Don't Do (Tier A Restrictions)")) {
    return systemPrompt;
  }
  return systemPrompt + '\n' + DONT_DO_MEDIUM_PROMPT;
}

/**
 * 주어진 도구 호출이 Tier A 금지 목록에 위배되는지 확인한다.
 * Schema에 올라온 web_search / mcp_* 는 허용 (AWhitelist + MCP bootstrap 정합).
 */
export function isDontDoViolation(
  toolName: string,
  tier: 'A' | 'B' | 'C',
): { violation: boolean; reason?: string } {
  if (tier !== 'A') {
    return { violation: false };
  }

  // Explicitly allowed internet / MCP surface
  if (
    toolName === 'web_search' ||
    toolName === 'web_fetch' ||
    toolName === 'mcp_list_tools' ||
    toolName === 'mcp_call_tool' ||
    toolName.startsWith('mcp_')
  ) {
    return { violation: false };
  }

  const deniedTools = new Set([
    'delete_file',
    'browser_navigate', 'browser_click', 'browser_screenshot',
    'browser_evaluate', 'browser_console', 'browser_network',
    'browser_scroll', 'browser_wait',
    'task', 'task_run', 'skill_run',
  ]);

  if (deniedTools.has(toolName)) {
    return {
      violation: true,
      reason: `Tool "${toolName}" is prohibited in Tier A. Use only whitelisted tools.`,
    };
  }

  return { violation: false };
}
