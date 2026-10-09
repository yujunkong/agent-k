/**
 * V31-TOOL-03 — edit_file uniqueness strict tests.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applySearchReplace, editTool } from './EditTool';
import type { ToolContext } from '../types';

describe('V31-TOOL-03 applySearchReplace strict mode', () => {
  it('replaces a unique search string', () => {
    const out = applySearchReplace('a\nb\nc', [{ search: 'b', replace: 'B' }]);
    expect(out).toEqual({ content: 'a\nB\nc', replacements: 1 });
  });

  it('rejects a duplicate search without replaceAll and reports line numbers', () => {
    const out = applySearchReplace('x\nfoo\ny\nfoo\nz', [
      { search: 'foo', replace: 'bar' },
    ]);
    expect('error' in out).toBe(true);
    if ('error' in out) {
      expect(out.error).toContain('not unique');
      expect(out.error).toContain('lines 2, 4');
    }
  });

  it('replaces all occurrences when replaceAll is set', () => {
    const out = applySearchReplace('foo\nfoo', [
      { search: 'foo', replace: 'bar', replaceAll: true },
    ]);
    expect(out).toEqual({ content: 'bar\nbar', replacements: 2 });
  });

  it('strict: false preserves first-match behavior', () => {
    const out = applySearchReplace(
      'foo\nfoo',
      [{ search: 'foo', replace: 'bar' }],
      { strict: false },
    );
    expect(out).toEqual({ content: 'bar\nfoo', replacements: 1 });
  });

  it('later hunk becomes unique after an earlier replacement', () => {
    const out = applySearchReplace('foo\nbar\nfoo', [
      { search: 'foo\nbar', replace: 'baz' },
      { search: 'foo', replace: 'qux' },
    ]);
    expect(out).toEqual({ content: 'baz\nqux', replacements: 2 });
  });

  it('still reports not-found for a missing search string', () => {
    const out = applySearchReplace('a\nb', [{ search: 'zzz', replace: 'x' }]);
    expect('error' in out).toBe(true);
    if ('error' in out) expect(out.error).toContain('not found');
  });
});

describe('V31-TOOL-03 editTool.execute strict wiring', () => {
  let tmp: string;
  let ctx: ToolContext;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-k-edit-strict-'));
    ctx = { workspaceRoot: tmp };
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('rejects duplicate search by default', async () => {
    await fs.writeFile(path.join(tmp, 'a.txt'), 'foo\nfoo\n', 'utf-8');
    const result = await editTool.execute(
      { path: 'a.txt', search: 'foo', replace: 'bar' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not unique');
    expect(await fs.readFile(path.join(tmp, 'a.txt'), 'utf-8')).toBe(
      'foo\nfoo\n',
    );
  });

  it('allows first-match edit when ctx.strictEdit is false', async () => {
    await fs.writeFile(path.join(tmp, 'a.txt'), 'foo\nfoo\n', 'utf-8');
    const result = await editTool.execute(
      { path: 'a.txt', search: 'foo', replace: 'bar' },
      { ...ctx, strictEdit: false },
    );
    expect(result.success).toBe(true);
    expect(await fs.readFile(path.join(tmp, 'a.txt'), 'utf-8')).toBe(
      'bar\nfoo\n',
    );
  });
});
