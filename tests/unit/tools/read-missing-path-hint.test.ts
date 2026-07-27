/**
 * Missing-path read errors should steer the model to glob/search.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeReadFile } from '../../../src/tools/executors';

suite('read_file missing path hints', () => {
  let tmp: string;
  let prevCwd: string;

  suiteSetup(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-read-hint-'));
    fs.mkdirSync(path.join(tmp, 'src'));
    fs.writeFileSync(path.join(tmp, 'src', 'database.rs'), 'fn main() {}\n');
    prevCwd = process.cwd();
    process.chdir(tmp);
  });

  suiteTeardown(() => {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('ENOENT includes similar path + search guidance', async () => {
    const out = await executeReadFile({
      path: 'wrong/place/database.rs'
    });
    assert.strictEqual(out.success, false);
    assert.match(String(out.error), /glob|file_search|locate/i);
    assert.match(String(out.error), /database\.rs/);
  });
});
