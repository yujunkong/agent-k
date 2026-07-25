/**
 * RW-C5-05-R2: Plan mode executeTool deny — disk unchanged assert
 *
 * 착각 금지: modeRegistry whitelist 단위 테스트만으로는 미완료.
 * AgentLoopController.dispatchTool 경로에서 deny + 파일 mtime/hash 불변을 검증.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { AgentLoopController } from '../../src/loop/AgentLoopController';
import { registerEditTools } from '../../src/tools/editTools';
import { registerReadTools } from '../../src/tools/readTools';
import { toolRegistry } from '../../src/tools/registry';

suite('E2E: Plan executeTool deny + disk unchanged (RW-C5-05-R2)', () => {
  let tmpFile: string;
  let beforeHash: string;
  let beforeMtime: number;

  suiteSetup(() => {
    // Ensure write tools are registered for category-based deny
    if (!toolRegistry.getTool('edit_file')) {
      registerReadTools();
      registerEditTools();
    }
  });

  setup(() => {
    tmpFile = path.join(os.tmpdir(), `agentk-plan-deny-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'protected content — must not change\n', 'utf-8');
    beforeHash = crypto.createHash('sha256').update(fs.readFileSync(tmpFile)).digest('hex');
    beforeMtime = fs.statSync(tmpFile).mtimeMs;
  });

  teardown(() => {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  });

  function assertFileUnchanged(): void {
    const afterHash = crypto.createHash('sha256').update(fs.readFileSync(tmpFile)).digest('hex');
    const afterMtime = fs.statSync(tmpFile).mtimeMs;
    assert.strictEqual(afterHash, beforeHash, 'file content hash must be unchanged after plan deny');
    assert.strictEqual(afterMtime, beforeMtime, 'file mtime must be unchanged after plan deny');
  }

  test('plan mode: edit_file denied with success=false', async () => {
    const loop = new AgentLoopController({
      mode: 'plan',
      maxTurns: 3,
      modelId: 'test',
      onStatus: () => {}
    });
    const result = await loop.dispatchTool('edit_file', {
      path: tmpFile,
      hunks: [{ oldText: 'protected', newText: 'MUTATED' }]
    });
    assert.strictEqual(result.success, false, 'edit_file must not claim success in plan mode');
    assert.ok(result.error && /plan mode/i.test(result.error), `expected plan deny error, got: ${result.error}`);
    assertFileUnchanged();
  });

  test('plan mode: write_file denied + disk unchanged', async () => {
    const loop = new AgentLoopController({
      mode: 'plan',
      maxTurns: 3,
      modelId: 'test',
      onStatus: () => {}
    });
    const result = await loop.dispatchTool('write_file', {
      path: tmpFile,
      content: 'OVERWRITE ATTEMPT'
    });
    assert.strictEqual(result.success, false);
    assert.ok(result.error && /plan mode|not allowed/i.test(result.error));
    assertFileUnchanged();
  });

  test('plan mode: run_terminal_cmd denied', async () => {
    const loop = new AgentLoopController({
      mode: 'plan',
      maxTurns: 3,
      modelId: 'test',
      onStatus: () => {}
    });
    const result = await loop.dispatchTool('run_terminal_cmd', {
      command: `echo hacked > "${tmpFile}"`
    });
    assert.strictEqual(result.success, false);
    assertFileUnchanged();
  });
});
