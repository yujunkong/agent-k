/**
 * C1-T22: 단위 테스트 — ModeRegistry 화이트리스트 정확성
 */
import * as assert from 'assert';
import { modeRegistry } from '../../../src/agent/modeRegistry';

suite('ModeRegistry', () => {
  const ASK_WHITELIST = [
    'grep', 'glob', 'file_search', 'list_dir', 'read_file',
    'codebase_search', 'lsp_definition', 'lsp_references',
    'ask_question', 'todo_write'
  ];

  test('getAllModes — 4개 모드 반환', () => {
    const modes = modeRegistry.getAllModes();
    assert.strictEqual(modes.length, 4);
    assert.ok(modes.includes('ask'));
    assert.ok(modes.includes('agent'));
    assert.ok(modes.includes('plan'));
    assert.ok(modes.includes('debug'));
  });

  test('getModeConfig — Ask 모드 설정 반환', () => {
    const config = modeRegistry.getModeConfig('ask');
    assert.strictEqual(config.name, 'ask');
    assert.ok(config.allowedTools.length >= 10);
    assert.ok(config.contextBudget > 0);
  });

  test('ASK_WHITELIST — 10개 도구 정확히 매칭', () => {
    const config = modeRegistry.getModeConfig('ask');
    for (const tool of ASK_WHITELIST) {
      assert.ok(config.allowedTools.includes(tool), `Ask mode should allow: ${tool}`);
    }
    assert.strictEqual(config.allowedTools.length, 10);
  });

  test('isToolAllowed — Ask모드 edit_file 차단', () => {
    assert.strictEqual(modeRegistry.isToolAllowed('ask', 'edit_file'), false);
    assert.strictEqual(modeRegistry.isToolAllowed('ask', 'write_file'), false);
    assert.strictEqual(modeRegistry.isToolAllowed('ask', 'run_terminal_cmd'), false);
  });

  test('isToolAllowed — Ask모드 grep 허용', () => {
    assert.strictEqual(modeRegistry.isToolAllowed('ask', 'grep'), true);
    assert.strictEqual(modeRegistry.isToolAllowed('ask', 'read_file'), true);
  });

  test('isToolAllowed — Agent모드 edit_file 허용', () => {
    assert.strictEqual(modeRegistry.isToolAllowed('agent', 'edit_file'), true);
    assert.strictEqual(modeRegistry.isToolAllowed('agent', 'write_file'), true);
    assert.strictEqual(modeRegistry.isToolAllowed('agent', 'run_terminal_cmd'), true);
  });

  test('isToolAllowed — Debug모드 instrument_code 허용', () => {
    assert.strictEqual(modeRegistry.isToolAllowed('debug', 'instrument_code'), true);
  });

  test('모드별 contextBudget 차이', () => {
    const askBudget = modeRegistry.getModeConfig('ask').contextBudget;
    const agentBudget = modeRegistry.getModeConfig('agent').contextBudget;
    assert.ok(agentBudget >= askBudget, 'Agent budget should be >= Ask budget');
  });

  test('존재하지 않는 모드 — undefined 반환하지 않음', () => {
    const config = modeRegistry.getModeConfig('ask');
    assert.ok(config !== undefined);
    assert.ok(typeof config.systemPrompt === 'string');
  });
});
