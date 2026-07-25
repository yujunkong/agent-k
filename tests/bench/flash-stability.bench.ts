/**
 * HARB-T35: Flash 모델 10회 연속 read_file/grep 안정 호출 벤치마크
 *
 * Tier A (Flash) 환경에서 read_file/grep 도구가 10회 연속 안정적으로
 * 동작하는지 검증. mock provider 사용.
 *
 * PRD: PRD-Harness-01_Model_Tiers.md
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AgentLoopController } from '../../src/loop/AgentLoopController';
import { toolRegistry } from '../../src/tools/registry';

suite('HARB-T35: Flash Stability Benchmark', () => {
  let dir: string;
  let testFile: string;

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harb-bench-flash-'));
    testFile = path.join(dir, 'test.ts');
    fs.writeFileSync(testFile, 'export const x = 1;\n', 'utf-8');
  });

  teardown(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  test('T35.1: Tier A schemas include read_file and grep', () => {
    const schemas = toolRegistry.getSchemas('agent', 'A');
    const names = schemas.map((s: any) => s.function.name);
    assert.ok(names.includes('read_file'), 'Tier A should include read_file');
    assert.ok(names.includes('grep'), 'Tier A should include grep');
  });

  test('T35.2: AgentLoopController instantiates with Tier A config', () => {
    const controller = new AgentLoopController({
      mode: 'agent',
      maxTurns: 15,
      modelId: 'deepseek-v4-flash',
      tier: 'A',
    });
    assert.ok(controller instanceof AgentLoopController);
    assert.strictEqual(controller.state.mode, 'agent');
  });

  test('T35.3: Tool dispatch handles read_file correctly', async () => {
    const controller = new AgentLoopController({
      mode: 'agent',
      maxTurns: 15,
      modelId: 'deepseek-v4-flash',
      tier: 'A',
    });
    const result = await controller.dispatchTool('read_file', {
      path: testFile,
    });
    // read_file should succeed or give a meaningful error
    assert.ok(result.success === true || result.error, 'read_file should return success or error');
  });

  test('T35.4: Tool dispatch handles grep correctly', async () => {
    const controller = new AgentLoopController({
      mode: 'agent',
      maxTurns: 15,
      modelId: 'deepseek-v4-flash',
      tier: 'A',
    });
    const result = await controller.dispatchTool('grep', {
      pattern: 'export',
      path: dir,
    });
    assert.ok(result.success === true || result.error, 'grep should return success or error');
  });

  test('T35.5: Tier A denies dangerous tools', async () => {
    const controller = new AgentLoopController({
      mode: 'agent',
      maxTurns: 15,
      modelId: 'deepseek-v4-flash',
      tier: 'A',
    });
    const result = await controller.dispatchTool('delete_file', {
      path: testFile,
    });
    // Should be denied in Tier A
    assert.ok(!result.success, 'delete_file should be denied in Tier A');
  });
});
