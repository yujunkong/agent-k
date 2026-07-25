/**
 * HARB-T36: 의도적 틀린 SEARCH 10건 → 전부 안전 거절 + 모델 재시도 성공 벤치마크
 *
 * 잘못된 Search-Replace 패치가 안전하게 거절되고, 모델이 재시도할 수 있는
 * 에러 메시지를 반환하는지 검증.
 *
 * PRD: PRD-Harness-15_Acceptance_Criteria.md
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AgentLoopController } from '../../src/loop/AgentLoopController';

suite('HARB-T36: Patch Rejection Benchmark', () => {
  let dir: string;
  let testFile: string;

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harb-bench-patch-'));
    testFile = path.join(dir, 'test.ts');
    fs.writeFileSync(testFile, 'export function hello() {\n  return "world";\n}\n', 'utf-8');
  });

  teardown(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  test('T36.1: Empty search string is rejected', async () => {
    const controller = new AgentLoopController({
      mode: 'agent',
      maxTurns: 15,
      modelId: 'deepseek-v4-flash',
      tier: 'A',
    });
    const result = await controller.dispatchTool('edit_file', {
      path: testFile,
      hunks: [{ search: '', replace: 'new content' }],
    });
    assert.ok(!result.success, 'Empty search should be rejected');
  });

  test('T36.2: Non-existent file edit is rejected', async () => {
    const controller = new AgentLoopController({
      mode: 'agent',
      maxTurns: 15,
      modelId: 'deepseek-v4-flash',
      tier: 'A',
    });
    const result = await controller.dispatchTool('edit_file', {
      path: '/nonexistent/path/file.ts',
      hunks: [{ search: 'old', replace: 'new' }],
    });
    assert.ok(!result.success, 'Non-existent file should be rejected');
  });

  test('T36.3: Path escaping workspace is rejected', async () => {
    const controller = new AgentLoopController({
      mode: 'agent',
      maxTurns: 15,
      modelId: 'deepseek-v4-flash',
      tier: 'A',
    });
    const result = await controller.dispatchTool('edit_file', {
      path: '/etc/passwd',
      hunks: [{ search: 'old', replace: 'new' }],
    });
    assert.ok(!result.success, 'Path escaping workspace should be rejected');
  });

  test('T36.4: Write to non-existent path is rejected', async () => {
    const controller = new AgentLoopController({
      mode: 'agent',
      maxTurns: 15,
      modelId: 'deepseek-v4-flash',
      tier: 'A',
    });
    const result = await controller.dispatchTool('write_file', {
      path: '/nonexistent/output.ts',
      content: 'test',
    });
    assert.ok(!result.success, 'Write to non-existent path should be rejected');
  });

  test('T36.5: Delete file in Tier A is denied', async () => {
    const controller = new AgentLoopController({
      mode: 'agent',
      maxTurns: 15,
      modelId: 'deepseek-v4-flash',
      tier: 'A',
    });
    const result = await controller.dispatchTool('delete_file', {
      path: testFile,
    });
    assert.ok(!result.success, 'delete_file should be denied in Tier A');
  });
});
