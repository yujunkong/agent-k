/**
 * V31-TOOL-08 — GrepTool case sensitivity.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { grepTool, grepWorkspace } from './tools/GrepTool';

describe('V31-TOOL-08 grep case sensitivity', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-k-grep-'));
    await fs.writeFile(
      path.join(tmp, 'a.ts'),
      'Alpha beta\nGAMMA delta\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('matches case-insensitively by default', async () => {
    const out = await grepWorkspace({
      workspaceRoot: tmp,
      pattern: 'alpha',
    });
    expect(out.results.some((r) => r.includes('Alpha'))).toBe(true);
  });

  it('honors caseSensitive: true', async () => {
    const insensitive = await grepWorkspace({
      workspaceRoot: tmp,
      pattern: 'alpha',
    });
    const sensitive = await grepWorkspace({
      workspaceRoot: tmp,
      pattern: 'alpha',
      caseSensitive: true,
    });
    expect(insensitive.results.length).toBeGreaterThan(0);
    expect(sensitive.results.length).toBe(0);
  });

  it('matches exact case when caseSensitive', async () => {
    const out = await grepWorkspace({
      workspaceRoot: tmp,
      pattern: 'Alpha',
      caseSensitive: true,
    });
    expect(out.results.some((r) => r.includes('Alpha'))).toBe(true);
  });

  it('tool executor forwards caseSensitive / ignoreCase', async () => {
    const sensitive = await grepTool.execute(
      { pattern: 'alpha', caseSensitive: true },
      { workspaceRoot: tmp },
    );
    expect(sensitive.success).toBe(true);
    expect((sensitive.data as { count: number }).count).toBe(0);

    const viaIgnoreCase = await grepTool.execute(
      { pattern: 'alpha', ignoreCase: false },
      { workspaceRoot: tmp },
    );
    expect((viaIgnoreCase.data as { count: number }).count).toBe(0);
  });
});
