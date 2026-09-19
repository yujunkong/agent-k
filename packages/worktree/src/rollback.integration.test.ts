/**
 * INT-007 — Worktree partial failure → rollback/recovery (BoN + apply 경로)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { rollbackCreatedFiles } from './untrackedTransfer';
import { checkGitPatch, applyGitPatch, reverseGitPatch } from './gitPatch';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentk-int7-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('INT-007 부분 실패 롤백', () => {
  it('rollbackCreatedFiles removes files created before failure', () => {
    const created = [path.join(tmpDir, 'a.txt'), path.join(tmpDir, 'b.txt')];
    fs.writeFileSync(created[0], 'x');
    fs.writeFileSync(created[1], 'y');

    rollbackCreatedFiles(created);

    expect(fs.existsSync(created[0])).toBe(false);
    expect(fs.existsSync(created[1])).toBe(false);
  });

  it('rollback is idempotent — missing files do not throw', () => {
    const created = [path.join(tmpDir, 'never-created.txt')];
    // never created — repeated rollback must not throw
    expect(() => rollbackCreatedFiles(created)).not.toThrow();
    expect(() => rollbackCreatedFiles(created)).not.toThrow();
  });

  it('checkGitPatch accepts empty patch as ok', () => {
    expect(checkGitPatch('/nonexistent', '')).toEqual({ ok: true });
  });

  it('checkGitPatch rejects malformed patches with explicit error', () => {
    const result = checkGitPatch('/nonexistent', 'not a unified diff');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('applyGitPatch + reverseGitPatch round-trip restores file content', () => {
    // fake git via repoRoot is not a real repo — use a real git repo
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'agentk-int7b-'));
    try {
      const { execFileSync } = require('child_process') as typeof import('child_process');
      const run = (args: string[], input?: string) =>
        execFileSync('git', args, { cwd: repo, encoding: 'utf-8', input });
      run(['init', '-q']);
      run(['config', 'user.email', 't@t']);
      run(['config', 'user.name', 't']);
      fs.writeFileSync(path.join(repo, 'x.txt'), 'line1\nline2\n');
      run(['add', '.']);
      run(['commit', '-q', '-m', 'init']);

      const patch = [
        '--- a/x.txt',
        '+++ b/x.txt',
        '@@ -1,2 +1,2 @@',
        ' line1',
        '-line2',
        '+line2-changed',
        '',
      ].join('\n');

      // validate → apply → verify → reverse → verify
      expect(checkGitPatch(repo, patch)).toEqual({ ok: true });
      applyGitPatch(repo, patch);
      expect(fs.readFileSync(path.join(repo, 'x.txt'), 'utf-8')).toContain('line2-changed');

      reverseGitPatch(repo, patch);
      expect(fs.readFileSync(path.join(repo, 'x.txt'), 'utf-8')).toContain('line2\n');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
