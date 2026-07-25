/**
 * HARB-T16: AC-1 Single File Bug Fix (PRD-real)
 *
 * fixture → prefetch @file → edit_file null-check → read_lints → Diff 승인 시뮬레이션
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import { AgentLoopController } from '../../../src/loop/AgentLoopController';
import { PrefetchEngine } from '../../../src/prefetch/PrefetchEngine';
import { registerReadTools } from '../../../src/tools/readTools';
import { registerEditTools } from '../../../src/tools/editTools';
import { toolRegistry } from '../../../src/tools/registry';

suite('HARB AC-1: Single File Bug Fix', () => {
  let dir: string;
  let file: string;

  suiteSetup(() => {
    registerReadTools();
    registerEditTools();
  });

  setup(() => {
    dir = fs.mkdtempSync(path.join(process.cwd(), '.harb-ac1-'));
    file = path.join(dir, 'auth.ts');
    fs.writeFileSync(
      file,
      `export function login(username: string, password: string): string {
  const user = getUser(username);
  return \`Welcome, \${user.name}\`;
}

function getUser(username: string): { name: string } | null {
  if (username === 'admin') return { name: 'Admin' };
  return null;
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

  test('AC-1: prefetch @file includes fixture bytes', async () => {
    const engine = new PrefetchEngine();
    const result = await engine.prefetch(`Fix null @file:${file}`);
    assert.ok(result.includes('getUser'), 'Prefetch should include fixture source');
    assert.ok(result.includes(file) || result.includes('auth.ts'), 'Prefetch should reference file');
  });

  test('AC-1: edit_file + read_lints + single diff approval', async () => {
    const controller = new AgentLoopController({
      mode: 'agent',
      maxTurns: 3,
      modelId: 'flash',
      tier: 'A'
    });

    let diffApprovedOnce = false;
    const approveDiff = () => {
      diffApprovedOnce = true;
    };

    assert.ok(toolRegistry.getTool('read_lints'), 'read_lints must be registered');

    const readResult = await controller.dispatchTool('read_file', { path: file });
    assert.strictEqual(readResult.success, true, 'read_file before edit');

    const editResult = await controller.dispatchTool('edit_file', {
      path: file,
      hunks: [
        {
          oldText: `  const user = getUser(username);
  return \`Welcome, \${user.name}\`;`,
          newText: `  const user = getUser(username);
  if (!user) {
    return 'Unknown user';
  }
  return \`Welcome, \${user.name}\`;`
        }
      ]
    });
    assert.strictEqual(editResult.success, true, editResult.error || 'edit should succeed');

    approveDiff();

    const onDisk = fs.readFileSync(file, 'utf-8');
    assert.ok(onDisk.includes('if (!user)'), 'File on disk must contain null check');

    const lintResult = await controller.dispatchTool('read_lints', { paths: [file] });
    assert.strictEqual(lintResult.success, true, lintResult.error || 'read_lints should run');
    assert.ok(lintResult.data, 'lint payload expected');

    assert.strictEqual(diffApprovedOnce, true, 'Simulate single Diff approval flag');
  });
});
