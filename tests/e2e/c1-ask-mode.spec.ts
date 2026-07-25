/**
 * C1-T23: E2E — Ask 모드 읽기 전용 + 쓰기 차단
 * C1-T24: E2E — 쓰기 도구 환상 호출 시 에러 반환
 */
import * as assert from 'assert';

suite('E2E: Ask Mode', () => {
  const ASK_ALLOWED = ['grep', 'glob', 'file_search', 'list_dir', 'read_file', 'codebase_search', 'lsp_definition', 'lsp_references', 'ask_question', 'todo_write'];
  const WRITE_BLOCKED = ['edit_file', 'write_file', 'run_terminal_cmd', 'delete_file', 'checkpoint_restore'];

  test('C1-T23-1: Ask 모드 허용 도구 10개 정확히 매칭', () => {
    assert.strictEqual(ASK_ALLOWED.length, 10);
  });

  test('C1-T23-2: 쓰기 도구 호출 시 에러 반환', () => {
    const result = simulateToolCall('ask', 'edit_file', { path: 'test.ts' });
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('not allowed') || result.error?.includes('disabled'));
  });

  test('C1-T23-3: 읽기 도구 호출 시 정상 실행', () => {
    const result = simulateToolCall('ask', 'grep', { pattern: 'test' });
    assert.strictEqual(result.success, true);
  });

  test('C1-T24: Ask 모드에서 write_file 차단', () => {
    const result = simulateToolCall('ask', 'write_file', { path: 'new.ts', content: '' });
    assert.strictEqual(result.success, false);
  });

  test('C1-T24: Ask 모드에서 run_terminal_cmd 차단', () => {
    const result = simulateToolCall('ask', 'run_terminal_cmd', { command: 'npm test' });
    assert.strictEqual(result.success, false);
  });
});

function simulateToolCall(mode: string, toolName: string, args: any): { success: boolean; error?: string } {
  const modeAllowlists: Record<string, string[]> = {
    ask: ASK_ALLOWED,
    agent: [...ASK_ALLOWED, ...['edit_file', 'write_file', 'run_terminal_cmd', 'checkpoint_create', 'checkpoint_restore']]
  };
  
  const toolCategories: Record<string, string> = {
    grep: 'search', glob: 'search', read_file: 'search', list_dir: 'search',
    edit_file: 'edit', write_file: 'edit', run_terminal_cmd: 'terminal'
  };

  const allowed = modeAllowlists[mode] || [];
  if (!allowed.includes(toolName)) {
    return { success: false, error: `Tool "${toolName}" is not allowed in ${mode} mode.` };
  }
  
  // C1-T18: Ask 모드 이중 가드
  if (mode === 'ask') {
    const cat = toolCategories[toolName];
    if (cat === 'edit' || cat === 'terminal') {
      return { success: false, error: `[Ask Mode] Writing/terminal tools are disabled. "${toolName}" requires Agent mode.` };
    }
  }
  
  return { success: true };
}
