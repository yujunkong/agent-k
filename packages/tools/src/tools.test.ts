/**
 * TOOL-016 / TOOL-001 / TOOL-003 / SAFE deny / TOOL-008 / TOOL-017 tests.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isPathDenied, isTerminalCommandDenied } from '@agent-k/safety';
import { ToolRegistry } from './ToolRegistry';
import { executeTool } from './ExecutorAbstraction';
import { registerBuiltinTools } from './registerBuiltinTools';
import { ToolCallParser } from './ToolCallParser';
import { parallelSearch } from './ParallelSearch';
import { writeTool } from './tools/WriteTool';
import { readTool } from './tools/ReadTool';
import type { ToolContext } from './types';

describe('TOOL-016 ToolRegistry', () => {
  it('register / get / list / getSchemas filters by mode', () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry);

    expect(registry.get('read_file')?.name).toBe('read_file');
    expect(registry.get('read_files')?.name).toBe('read_files');
    expect(registry.get('list_dir')?.name).toBe('list_dir');
    expect(registry.get('codebase_search')?.name).toBe('codebase_search');
    expect(registry.get('task_run')?.name).toBe('task_run');
    expect(registry.list().length).toBeGreaterThan(25);

    const askSchemas = registry.getSchemas('ask');
    const askNames = askSchemas.map((s) => s.function.name);
    expect(askNames).toContain('read_file');
    expect(askNames).toContain('read_files');
    expect(askNames).toContain('list_dir');
    expect(askNames).toContain('grep');
    expect(askNames).not.toContain('write_file');
    expect(askNames).not.toContain('delete_file');
    expect(askNames).not.toContain('run_terminal_cmd');

    const agentSchemas = registry.getSchemas('agent');
    const agentNames = agentSchemas.map((s) => s.function.name);
    expect(agentNames).toContain('write_file');
    expect(agentNames).toContain('delete_file');
    expect(agentNames).toContain('run_terminal_cmd');
    expect(agentNames).toContain('web_fetch');

    // Every schema is OpenAI function shape
    for (const s of askSchemas) {
      expect(s.type).toBe('function');
      expect(s.function.parameters).toBeTruthy();
    }
  });
});

describe('TOOL-001/003 read/write with temp dir', () => {
  let tmp: string;
  let ctx: ToolContext;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-k-tools-'));
    ctx = { workspaceRoot: tmp };
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('writes then reads with maxLines', async () => {
    const writeResult = await writeTool.execute(
      { path: 'src/hello.ts', content: 'line1\nline2\nline3\nline4\n' },
      ctx
    );
    expect(writeResult.success).toBe(true);

    const readResult = await readTool.execute(
      { path: 'src/hello.ts', maxLines: 2 },
      ctx
    );
    expect(readResult.success).toBe(true);
    const data = readResult.data as {
      content: string;
      truncated: boolean;
      lineCount: number;
    };
    expect(data.content).toBe('line1\nline2');
    expect(data.lineCount).toBe(2);
    expect(data.truncated).toBe(true);
  });

  it('read_files batches multiple paths', async () => {
    await writeTool.execute({ path: 'a.ts', content: 'aaa\n' }, ctx);
    await writeTool.execute({ path: 'b.ts', content: 'bbb\n' }, ctx);
    const { readFilesTool } = await import('./tools/ReadFilesTool');
    const result = await readFilesTool.execute(
      { paths: ['a.ts', 'b.ts'] },
      ctx
    );
    expect(result.success).toBe(true);
    const data = result.data as { ok: number; count: number };
    expect(data.count).toBe(2);
    expect(data.ok).toBe(2);
  });

  it('executeTool routes through registry', async () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry);
    const result = await executeTool(
      registry,
      'write_file',
      { path: 'a.txt', content: 'hi' },
      ctx
    );
    expect(result.success).toBe(true);
    const text = await fs.readFile(path.join(tmp, 'a.txt'), 'utf-8');
    expect(text).toBe('hi');
  });
});

describe('SAFE deny path / terminal', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-k-tools-deny-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('denies .env and secrets paths via safety', () => {
    expect(isPathDenied('.env')).toBe(true);
    expect(isPathDenied('secrets/token')).toBe(true);
    expect(isPathDenied('src/ok.ts')).toBe(false);
  });

  it('write_file rejects denied paths', async () => {
    const ctx: ToolContext = { workspaceRoot: tmp };
    const result = await writeTool.execute(
      { path: '.env', content: 'SECRET=1' },
      ctx
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/denied/i);
    expect(result.metadata?.denied).toBe(true);
  });

  it('denies dangerous terminal commands', () => {
    expect(isTerminalCommandDenied('rm -rf /')).toBe(true);
    expect(isTerminalCommandDenied('mkfs.ext4 /dev/sda')).toBe(true);
    expect(isTerminalCommandDenied('echo hello')).toBe(false);
  });
});

describe('TOOL-008 ToolCallParser', () => {
  const parser = new ToolCallParser();

  it('parses OpenAI native tool_calls', () => {
    const calls = parser.parse([
      {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'grep',
          arguments: JSON.stringify({ pattern: 'foo' }),
        },
      },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('grep');
    expect(calls[0].arguments).toEqual({ pattern: 'foo' });
    expect(calls[0].strategy).toBe('native');
  });

  it('parses XML-ish <tool name> fallback', () => {
    const calls = parser.parse(
      '<tool name="read_file">{"path":"a.ts"}</tool>'
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('read_file');
    expect(calls[0].arguments).toEqual({ path: 'a.ts' });
    expect(calls[0].strategy).toBe('xml');
  });
});

describe('TOOL-017 ParallelSearch', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-k-tools-ps-'));
    await fs.mkdir(path.join(tmp, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tmp, 'src', 'a.ts'),
      'export const alpha = 1;\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(tmp, 'src', 'b.ts'),
      'export const beta = 2;\n',
      'utf-8'
    );
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('runs grep and glob together', async () => {
    const result = await parallelSearch({
      workspaceRoot: tmp,
      grepPattern: 'alpha',
      globPattern: '**/*.ts',
    });
    expect(result.grep?.count).toBeGreaterThan(0);
    expect(result.grep?.results.some((r) => r.includes('alpha'))).toBe(true);
    expect(result.glob?.count).toBe(2);
    expect(result.glob?.matches).toEqual(
      expect.arrayContaining(['src/a.ts', 'src/b.ts'])
    );
  });
});
