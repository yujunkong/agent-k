/**
 * HARB-T17: AC-2 Test Failure Fix Loop (PRD-real)
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import { AgentLoopController } from '../../../src/loop/AgentLoopController';
import { registerReadTools } from '../../../src/tools/readTools';
import { registerEditTools } from '../../../src/tools/editTools';
import { TestLoopHarness } from './TestLoopHarness';

suite('HARB AC-2: Test Failure Fix Loop', () => {
  let dir: string;
  let file: string;

  suiteSetup(() => {
    registerReadTools();
    registerEditTools();
  });

  setup(() => {
    dir = fs.mkdtempSync(path.join(process.cwd(), '.harb-ac2-'));
    file = path.join(dir, 'calc.ts');
    fs.writeFileSync(
      file,
      `export function add(a: number, b: number): number {
  return a - b;
}
`,
      'utf-8'
    );
  });

  teardown(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  test('AC-2: fail log → edit → pass within 2 retries', async () => {
    const harness = new TestLoopHarness(
      'FAIL calc.test.ts — expected 5 got 1'
    );
    const loop = new AgentLoopController({ mode: 'agent', maxTurns: 5, modelId: 'flash', tier: 'A' });

    const first = harness.runTests();
    assert.strictEqual(first.passed, false, 'Initial test run should fail');

    await loop.dispatchTool('read_file', { path: file });
    const edit = await loop.dispatchTool('edit_file', {
      path: file,
      hunks: [{ oldText: 'return a - b;', newText: 'return a + b;' }]
    });
    assert.strictEqual(edit.success, true, edit.error || 'edit should fix bug');

    harness.markFixApplied();
    const second = harness.runTests();
    assert.strictEqual(second.passed, true, 'Second run should pass');
    assert.ok(harness.attemptCount <= 2, 'Should complete within 2 test attempts');
  });
});
