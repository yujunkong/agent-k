/**
 * FINDSTR/grep exit 1 means "no matches", not a failed Command card.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  executeRunTerminalCmd,
  isSearchNoMatchExit,
  wrapShellCommand,
  runWithWorkspaceRoot
} from '../../../src/tools/writeExecutors';

suite('terminal search exit + Windows encoding wrap', () => {
  test('FINDSTR/rg/grep/Select-String exit 1 is no-match success', () => {
    assert.strictEqual(isSearchNoMatchExit('FINDSTR /S /I foo C:\\crate', 1), true);
    assert.strictEqual(isSearchNoMatchExit('findstr pattern file.txt', 1), true);
    assert.strictEqual(isSearchNoMatchExit('rg -n pattern src', 1), true);
    assert.strictEqual(isSearchNoMatchExit('grep -n pattern src', 1), true);
    assert.strictEqual(
      isSearchNoMatchExit('powershell -Command "Select-String -Path a.txt -Pattern x"', 1),
      true
    );
    assert.strictEqual(isSearchNoMatchExit('npm test', 1), false);
    assert.strictEqual(isSearchNoMatchExit('FINDSTR foo bar', 0), false);
    assert.strictEqual(isSearchNoMatchExit('FINDSTR foo bar', 2), false);
  });

  test('Windows commands get chcp 65001; Unix is unchanged', () => {
    assert.strictEqual(wrapShellCommand('dir', 'linux'), 'dir');
    assert.strictEqual(wrapShellCommand('dir', 'win32'), 'chcp 65001 >nul & dir');
    assert.strictEqual(
      wrapShellCommand('chcp 65001 >nul & dir', 'win32'),
      'chcp 65001 >nul & dir'
    );
  });

  test('grep with no matches is not a failed terminal command', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-term-grep-'));
    try {
      const file = path.join(tmp, 'sample.txt');
      fs.writeFileSync(file, 'hello agent-k\n');
      const out = await runWithWorkspaceRoot(tmp, () =>
        executeRunTerminalCmd({
          command: `grep ___no_such_token_agentk___ ${file}`
        })
      );
      assert.strictEqual(out.success, true, String(out.error));
      assert.strictEqual((out.data as { exitCode?: number }).exitCode, 1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
