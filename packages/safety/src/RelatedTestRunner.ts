/**
 * SAFE-009 — RelatedTestRunner contract + Node discovery/execution runner.
 * Discovers sibling *.test.* / *.spec.* files and runs them via npx vitest.
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createSafetyError, type SafetyResult } from './types';

export interface RelatedTestRunRequest {
  /** Source / edited file paths used to discover related tests. */
  paths: string[];
  cwd?: string;
  /** Optional timeout for the test process (ms). */
  timeoutMs?: number;
}

export interface RelatedTestRunResult {
  success: boolean;
  paths: string[];
  /** Discovered test files that were executed (or would be). */
  testFiles?: string[];
  output?: string;
  error?: string;
  exitCode?: number;
}

/** Contract for post-edit related test execution. */
export interface RelatedTestRunner {
  runRelated(request: RelatedTestRunRequest): Promise<RelatedTestRunResult>;
}

/**
 * Stub runner that records requested paths (no process spawn).
 * Useful for unit tests and early wiring.
 */
export class StubRelatedTestRunner implements RelatedTestRunner {
  readonly requestedPaths: string[][] = [];

  async runRelated(request: RelatedTestRunRequest): Promise<RelatedTestRunResult> {
    const paths = [...request.paths];
    this.requestedPaths.push(paths);
    return {
      success: true,
      paths,
      output: '',
    };
  }

  async runRelatedResult(
    request: RelatedTestRunRequest,
  ): Promise<SafetyResult<RelatedTestRunResult>> {
    if (!request.paths || request.paths.length === 0) {
      return {
        ok: false,
        error: createSafetyError(
          'INVALID_INPUT',
          'RelatedTestRunner requires at least one path',
        ),
      };
    }
    const value = await this.runRelated(request);
    return { ok: true, value };
  }

  clear(): void {
    this.requestedPaths.length = 0;
  }
}

const TEST_SUFFIXES = [
  '.test.ts',
  '.test.tsx',
  '.test.js',
  '.test.mjs',
  '.spec.ts',
  '.spec.tsx',
  '.spec.js',
];

/** Discover related test files for a source path (sibling naming conventions). */
export function discoverRelatedTests(
  sourcePath: string,
  cwd?: string,
): string[] {
  const abs = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.resolve(cwd || process.cwd(), sourcePath);
  const dir = path.dirname(abs);
  const base = path.basename(abs).replace(/\.(tsx?|jsx?|mjs|cjs)$/, '');
  const found: string[] = [];

  for (const suffix of TEST_SUFFIXES) {
    const candidate = path.join(dir, `${base}${suffix}`);
    if (fs.existsSync(candidate)) found.push(candidate);
    const nested = path.join(dir, '__tests__', `${base}${suffix}`);
    if (fs.existsSync(nested)) found.push(nested);
  }

  // If the path itself is already a test file, include it.
  if (/\.(test|spec)\.(tsx?|jsx?|mjs)$/.test(abs) && fs.existsSync(abs)) {
    found.push(abs);
  }

  return [...new Set(found)];
}

/**
 * Node-backed runner: discover related tests and execute with `npx vitest run`.
 */
export class NodeRelatedTestRunner implements RelatedTestRunner {
  constructor(private readonly defaultCwd: string = process.cwd()) {}

  async runRelated(request: RelatedTestRunRequest): Promise<RelatedTestRunResult> {
    const cwd = request.cwd || this.defaultCwd;
    const testFiles = [
      ...new Set(request.paths.flatMap((p) => discoverRelatedTests(p, cwd))),
    ];

    if (testFiles.length === 0) {
      return {
        success: true,
        paths: [...request.paths],
        testFiles: [],
        output: 'No related test files discovered.',
        exitCode: 0,
      };
    }

    const timeoutMs = request.timeoutMs ?? 120_000;
    try {
      const { output, exitCode } = await runVitest(testFiles, cwd, timeoutMs);
      return {
        success: exitCode === 0,
        paths: [...request.paths],
        testFiles,
        output,
        exitCode,
        error: exitCode === 0 ? undefined : `vitest exited with code ${exitCode}`,
      };
    } catch (err) {
      return {
        success: false,
        paths: [...request.paths],
        testFiles,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async runRelatedResult(
    request: RelatedTestRunRequest,
  ): Promise<SafetyResult<RelatedTestRunResult>> {
    if (!request.paths || request.paths.length === 0) {
      return {
        ok: false,
        error: createSafetyError(
          'INVALID_INPUT',
          'RelatedTestRunner requires at least one path',
        ),
      };
    }
    const value = await this.runRelated(request);
    return { ok: true, value };
  }
}

function runVitest(
  testFiles: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const args = ['vitest', 'run', '--reporter=verbose', ...testFiles];
    const child = spawn('npx', args, {
      cwd,
      env: process.env,
      shell: false,
    });
    let output = '';
    const onData = (buf: Buffer) => {
      output += buf.toString('utf8');
      if (output.length > 200_000) {
        output = output.slice(-200_000);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Related test run timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ output, exitCode: code ?? 1 });
    });
  });
}
