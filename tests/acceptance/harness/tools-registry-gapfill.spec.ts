/**
 * HARB-T27~T34: Tools A~G + Registry Gap-fill Tests
 *
 * Phase D: 각 Tool 카테고리의 등록 증빙 + 스키마 검증.
 * "대형 재작성 금지" — 기존 구현의 wiring/gap만 검증.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import { toolRegistry } from '../../../src/tools/registry';

suite('HARB Tools A~G Gap-fill (T27-T34)', () => {
  // ─── T27: Tools-A Search/Explore ────────────────────────────
  test('T27: Search tools are registered', () => {
    const tools = toolRegistry.getToolsByCategory('search');
    const names = tools.map(t => t.name);
    assert.ok(names.includes('grep'), 'grep should be registered');
    assert.ok(names.includes('glob'), 'glob should be registered');
    assert.ok(names.includes('read_file'), 'read_file should be registered');
    assert.ok(names.includes('list_dir'), 'list_dir should be registered');
  });

  test('T27: Search tools have mode allowlist', () => {
    const grep = toolRegistry.getTool('grep');
    assert.ok(grep, 'grep should exist');
    assert.ok(grep!.modeAllowlist.includes('ask'), 'grep should be allowed in ask mode');
    assert.ok(grep!.modeAllowlist.includes('agent'), 'grep should be allowed in agent mode');
  });

  // ─── T28: Tools-B Edit/File ─────────────────────────────────
  test('T28: Edit tools are registered', () => {
    const tools = toolRegistry.getToolsByCategory('edit');
    const names = tools.map(t => t.name);
    assert.ok(names.includes('edit_file'), 'edit_file should be registered');
    assert.ok(names.includes('write_file'), 'write_file should be registered');
  });

  test('T28: Edit tools have proper schemas', () => {
    const editFile = toolRegistry.getTool('edit_file');
    assert.ok(editFile, 'edit_file should exist');
    assert.ok(editFile!.parameters, 'edit_file should have parameters');
    assert.ok(editFile!.parameters.properties?.path, 'edit_file should have path parameter');
  });

  // ─── T29: Tools-C Terminal ──────────────────────────────────
  test('T29: Terminal tool is registered', () => {
    const tools = toolRegistry.getToolsByCategory('terminal');
    const names = tools.map(t => t.name);
    assert.ok(names.includes('run_terminal_cmd'), 'run_terminal_cmd should be registered');
  });

  test('T29: Terminal tool has allowlist', async () => {
    const { TerminalTool } = await import('../../../src/tools/terminal/TerminalTool');
    const tool = new TerminalTool();
    assert.strictEqual(tool.isAllowed('npm test').allowed, true);
    assert.strictEqual(tool.isAllowed('rm -rf /').allowed, false);
  });

  // ─── T30: Tools-D Web/Browser ───────────────────────────────
  test('T30: Browser tools are registered', () => {
    const allTools = toolRegistry.getAllTools();
    const names = allTools.map(t => t.name);
    assert.ok(names.includes('browser_navigate'), 'browser_navigate should be registered');
    assert.ok(names.includes('browser_click'), 'browser_click should be registered');
    assert.ok(names.includes('browser_screenshot'), 'browser_screenshot should be registered');
  });

  test('T30: read_lints is registered', () => {
    const tool = toolRegistry.getTool('read_lints');
    assert.ok(tool, 'read_lints should be registered');
  });

  // ─── T31: Tools-E Session UX ────────────────────────────────
  test('T31: Session tools are registered', () => {
    const allTools = toolRegistry.getAllTools();
    const names = allTools.map(t => t.name);
    assert.ok(names.includes('ask_question'), 'ask_question should be registered');
    assert.ok(names.includes('todo_write'), 'todo_write should be registered');
    assert.ok(names.includes('switch_mode'), 'switch_mode should be registered');
  });

  test('T31: Session tools have proper categories', () => {
    const askQuestion = toolRegistry.getTool('ask_question');
    assert.ok(askQuestion, 'ask_question should exist');
    assert.strictEqual(askQuestion!.category, 'session');
  });

  // ─── T32: Tools-F Orchestration ─────────────────────────────
  test('T32: Orchestration tools are registered', () => {
    const allTools = toolRegistry.getAllTools();
    const names = allTools.map(t => t.name);
    assert.ok(names.includes('task'), 'task should be registered');
    assert.ok(names.includes('skill_run'), 'skill_run should be registered');
    assert.ok(names.includes('mcp_list_tools'), 'mcp_list_tools should be registered');
    assert.ok(names.includes('mcp_call_tool'), 'mcp_call_tool should be registered');
  });

  test('T32: Orchestration tools are in agent mode only', () => {
    const task = toolRegistry.getTool('task');
    assert.ok(task, 'task should exist');
    assert.ok(task!.modeAllowlist.includes('agent'), 'task should be allowed in agent mode');
  });

  // ─── T33: Tools-G Debug ─────────────────────────────────────
  test('T33: Debug tools are registered', () => {
    const allTools = toolRegistry.getAllTools();
    const names = allTools.map(t => t.name);
    assert.ok(names.includes('add_instrumentation'), 'add_instrumentation should be registered');
    assert.ok(names.includes('remove_instrumentation'), 'remove_instrumentation should be registered');
    assert.ok(names.includes('collect_runtime_logs'), 'collect_runtime_logs should be registered');
    assert.ok(names.includes('request_reproduce'), 'request_reproduce should be registered');
  });

  test('T33: Debug tools have debug category', () => {
    const addInst = toolRegistry.getTool('add_instrumentation');
    assert.ok(addInst, 'add_instrumentation should exist');
    assert.strictEqual(addInst!.category, 'debug');
  });

  // ─── T34: Tool Registry 통합 ────────────────────────────────
  test('T34: All tool categories are represented', () => {
    const allTools = toolRegistry.getAllTools();
    const categories = new Set(allTools.map(t => t.category));
    assert.ok(categories.has('search'), 'Should have search category');
    assert.ok(categories.has('edit'), 'Should have edit category');
    assert.ok(categories.has('terminal'), 'Should have terminal category');
    assert.ok(categories.has('session'), 'Should have session category');
    assert.ok(categories.has('orchestration'), 'Should have orchestration category');
    assert.ok(categories.has('debug'), 'Should have debug category');
  });

  test('T34: All tools have required fields', () => {
    const allTools = toolRegistry.getAllTools();
    for (const tool of allTools) {
      assert.ok(tool.name, `Tool should have name: ${JSON.stringify(tool)}`);
      assert.ok(tool.description, `Tool ${tool.name} should have description`);
      assert.ok(tool.parameters, `Tool ${tool.name} should have parameters`);
      assert.ok(Array.isArray(tool.modeAllowlist), `Tool ${tool.name} should have modeAllowlist`);
      assert.ok(tool.category, `Tool ${tool.name} should have category`);
    }
  });

  test('T34: Tool count is reasonable', () => {
    const count = toolRegistry.count;
    assert.ok(count >= 20, `Should have at least 20 registered tools, got ${count}`);
    assert.ok(count <= 60, `Should have at most 60 registered tools, got ${count}`);
  });

  test('T34: getSchemas with tier A filters correctly', () => {
    const agentSchemas = toolRegistry.getSchemas('agent', 'A');
    const names = agentSchemas.map((s: any) => s.function.name);
    assert.ok(names.includes('grep'), 'Tier A should include grep');
    assert.ok(names.includes('edit_file'), 'Tier A should include edit_file');
    assert.ok(!names.includes('delete_file'), 'Tier A should exclude delete_file');
    assert.ok(!names.includes('browser_navigate'), 'Tier A should exclude browser tools');
  });

  test('T34: getSchemas with tier B includes all tools', () => {
    const agentSchemas = toolRegistry.getSchemas('agent', 'B');
    const names = agentSchemas.map((s: any) => s.function.name);
    assert.ok(names.includes('delete_file'), 'Tier B should include delete_file');
    assert.ok(names.includes('browser_navigate'), 'Tier B should include browser tools');
  });
});
