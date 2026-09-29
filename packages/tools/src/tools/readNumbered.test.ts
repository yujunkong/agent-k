/**
 * V31-TOOL-02 — read_file numbered output tests.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatNumberedLines, readTool } from './ReadTool';
import type { ToolContext } from '../types';

describe('V31-TOOL-02 formatNumberedLines', () => {
  it('prefixes 1-based line numbers from offset 1', () => {
    expect(formatNumberedLines(['a', 'b'], 1)).toBe('1: a\n2: b');
  });

  it('uses the actual line numbers when offset > 1', () => {
    expect(formatNumberedLines(['a', 'b'], 10)).toBe('10: a\n11: b');
  });
});

describe('V31-TOOL-02 read_file numbered integration', () => {
  let tmp: string;
  let ctx: ToolContext;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-k-read-numbered-'));
    ctx = { workspaceRoot: tmp };
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('returns numbered content when numbered: true', async () => {
    await fs.writeFile(path.join(tmp, 'a.txt'), 'alpha\nbeta\ngamma', 'utf-8');
    const result = await readTool.execute({ path: 'a.txt', numbered: true }, ctx);
    expect(result.success).toBe(true);
    const data = result.data as { content: string; lineCount: number };
    expect(data.content).toBe('1: alpha\n2: beta\n3: gamma');
    expect(data.content.startsWith('1: ')).toBe(true);
    expect(data.lineCount).toBe(3);
  });

  it('keeps raw content when numbered is omitted (edit matching invariant)', async () => {
    await fs.writeFile(path.join(tmp, 'a.txt'), 'alpha\nbeta', 'utf-8');
    const result = await readTool.execute({ path: 'a.txt' }, ctx);
    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toBe('alpha\nbeta');
  });
});
