/**
 * RW-C6-02-R2 / RW-C6-06-R2: instrumentation write + cleanup scan unit smoke
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AddInstrumentationTool } from '../../src/tools/debug/AddInstrumentationTool';
import { RemoveInstrumentationTool } from '../../src/tools/debug/RemoveInstrumentationTool';
import { VerifyCleanup } from '../../src/debug/VerifyCleanup';

suite('Unit: DEBUG_INSTRUMENT file I/O (RW-C6-02/06-R2)', () => {
  let dir: string;
  let file: string;

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentk-instr-'));
    file = path.join(dir, 'sample.ts');
    fs.writeFileSync(file, 'export function foo() {\n  return 1;\n}\n', 'utf-8');
  });

  teardown(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  test('add writes DEBUG_INSTRUMENT marker to disk', async () => {
    const tool = new AddInstrumentationTool();
    const { absPath } = await tool.applyToFile({
      filePath: file,
      hypothesisId: 'hyp-1',
      type: 'entry',
      lineNumber: 2
    });
    const content = fs.readFileSync(absPath, 'utf-8');
    assert.ok(content.includes('DEBUG_INSTRUMENT: hyp-1'), 'marker must be on disk');
  });

  test('remove clears markers; VerifyCleanup.verify remainingMarkers is real count (not -1)', async () => {
    const add = new AddInstrumentationTool();
    await add.applyToFile({ filePath: file, hypothesisId: 'hyp-2', type: 'exit', lineNumber: 1 });
    const remove = new RemoveInstrumentationTool();
    const result = await remove.removeFromWorkspace('hyp-2', dir);
    assert.strictEqual(result.remaining, 0);
    const content = fs.readFileSync(file, 'utf-8');
    assert.ok(!content.includes('DEBUG_INSTRUMENT'), 'no markers remain');

    // RW-C6-06-R2: verify() with fileContents returns remainingMarkers >= 0 (never -1)
    const verify = new VerifyCleanup();
    const map = new Map<string, string>([[file, content]]);
    const vr = await verify.verify({ hypothesisId: 'hyp-2', fileContents: map, testResults: true });
    assert.ok(vr.remainingMarkers >= 0);
    assert.notStrictEqual(vr.remainingMarkers, -1);
    assert.strictEqual(vr.remainingMarkers, 0);
    assert.strictEqual(vr.markersRemoved, true);
  });
});
