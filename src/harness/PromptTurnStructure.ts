/**
 * HARB-T07: Prompt & Turn Structure (프롬프트·턴 구조)
 *
 * 모델이 매 턴 일관된 구조로 입력받고, 예측 가능한 형식으로 출력하게 해,
 * 중급 모델(Flash)도 안정적으로 도구 호출·응답 생성하게 한다.
 *
 * PRD: PRD-Harness-07_Prompt_Turn_Structure.md
 */

/**
 * 턴 구조 제한 설정.
 */
export interface TurnStructureConfig {
  /** 턴당 최대 도구 호출 수 (Tier A: 4, Tier B: 8) */
  maxToolCallsPerTurn: number;
  /** 턴당 최대 쓰기 도구 수 (edit_file/write_file/delete_file/run_terminal_cmd) */
  maxWriteToolsPerTurn: number;
  /** 단일 도구 결과 최대 문자 수 */
  maxToolResultChars: number;
  /** 응답 예약 토큰 비율 */
  responseReservePercent: number;
}

export const DEFAULT_TURN_STRUCTURE: TurnStructureConfig = {
  maxToolCallsPerTurn: 12,
  maxWriteToolsPerTurn: 1,
  maxToolResultChars: 32000,
  responseReservePercent: 10,
};

/**
 * 턴 구조 시스템 프롬프트 블록.
 */
export const TURN_STRUCTURE_PROMPT = `
## Turn Structure Rules

Each turn follows a fixed structure:

### Input Order (per turn)
1. System prompt + mode instructions
2. Active rules
3. Tool schemas (only tools you're allowed to use)
4. Sticky context (open files, mentions, selection)
5. User message
6. Recent tool results (most recent first)
7. Older conversation (may be summarized)

### Output Rules
- You may call multiple read-only tools in parallel (grep, codebase_search, glob, read_file, read_files, lsp_*)
- **Batch exploration**: when you know several paths, use \`read_files\` with up to 12 paths in ONE call, or emit many \`read_file\` calls in the SAME turn. Do NOT drip-read 2–4 files per turn then stop — that wastes rounds.
- Prefer search → then bounded \`read_file\` / \`read_files\` windows (default ~250 lines). Do not dump whole files.
- Final user-visible answers: **lead with a 1–2 sentence understanding summary** (what the user wants + what you will do), then the rest. Use clean Markdown (\`##\` headings, \`- \` / \`1. \` lists, GFM \`| tables |\`). Never pad columns with spaces.
- Write tools (edit_file, write_file, run_terminal_cmd): MAX 1 per turn
- Total tool calls per turn: MAX 12
- Each tool result is capped at 32KB
- Always respond in the format requested

### Tool Call Format
When calling tools, use the exact JSON format specified in the tool schemas.
Do NOT add extra fields. Do NOT use markdown code blocks for tool calls.
`;

/**
 * 턴 구조 프롬프트를 시스템 프롬프트에 주입한다.
 */
export function injectTurnStructure(systemPrompt: string): string {
  if (systemPrompt.includes('Turn Structure Rules')) {
    return systemPrompt;
  }
  return systemPrompt + '\n' + TURN_STRUCTURE_PROMPT;
}

/**
 * 턴 구조 제한을 검증한다.
 * 주어진 도구 호출 목록이 턴 구조 제한을 위반하는지 확인한다.
 */
export function validateTurnStructure(
  toolCalls: Array<{ name: string }>,
  config: TurnStructureConfig = DEFAULT_TURN_STRUCTURE,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (toolCalls.length > config.maxToolCallsPerTurn) {
    errors.push(
      `Too many tool calls: ${toolCalls.length} (max ${config.maxToolCallsPerTurn})`,
    );
  }

  const writeTools = new Set([
    'edit_file', 'write_file', 'delete_file', 'run_terminal_cmd',
  ]);
  const writeCalls = toolCalls.filter((tc) => writeTools.has(tc.name));

  if (writeCalls.length > config.maxWriteToolsPerTurn) {
    errors.push(
      `Too many write tools: ${writeCalls.length} (max ${config.maxWriteToolsPerTurn})`,
    );
  }

  return { valid: errors.length === 0, errors };
}
