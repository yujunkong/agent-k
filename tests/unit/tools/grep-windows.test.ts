/**
 * Windows grep used to miss rg.exe and then fail outside the workspace
 * (cargo registry), which pushed the model onto FINDSTR.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeGrep, ripgrepBinaryCandidates } from '../../../src/tools/executors';
import {
  resolveWorkspacePath,
  runWithWorkspaceRoot
} from '../../../src/tools/writeExecutors';

suite('grep Windows / workspace sandbox', () => {
  test('ripgrep candidates include rg.exe on Windows', () => {
    const env = {
      USERPROFILE: 'C:\\Users\\Administrator',
      LOCALAPPDATA: 'C:\\Users\\Administrator\\AppData\\Local',
      ProgramFiles: 'C:\\Program Files',
      AGENT_K_RG_PATH: 'D:\\tools\\rg.exe'
    };
    const bins = ripgrepBinaryCandidates('win32', env);
    assert.ok(bins.includes('D:\\tools\\rg.exe'));
    assert.ok(bins.includes('rg.exe'));
    assert.ok(bins.some((b) => b.endsWith('.cargo\\bin\\rg.exe') || b.endsWith('.cargo/bin/rg.exe')));
  });

  test('Unix candidates still include Homebrew rg', () => {
    const bins = ripgrepBinaryCandidates('linux', {});
    assert.ok(bins.includes('rg'));
    assert.ok(bins.includes('/opt/homebrew/bin/rg'));
    assert.ok(!bins.includes('rg.exe'));
  });

  test('cargo registry path is rejected with FINDSTR guidance', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-grep-ws-'));
    try {
      const escaped = runWithWorkspaceRoot(tmp, () =>
        resolveWorkspacePath(path.join(os.homedir(), '.cargo', 'registry', 'src', 'serde'))
      );
      assert.ok('error' in escaped);
      assert.match(String(escaped.error), /escapes workspace/i);
      assert.match(String(escaped.error), /FINDSTR|cargo registry/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('grep inside workspace still succeeds', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-grep-hit-'));
    try {
      fs.writeFileSync(path.join(tmp, 'lib.rs'), 'pub fn agent_k_marker() {}\n');
      const out = await runWithWorkspaceRoot(tmp, () =>
        executeGrep({ pattern: 'agent_k_marker', path: tmp })
      );
      assert.strictEqual(out.success, true);
      const count = Number((out.data as { count?: number } | undefined)?.count || 0);
      assert.ok(count >= 1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
