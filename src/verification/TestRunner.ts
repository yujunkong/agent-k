/**
 * TestRunner - 허용된 명령어 실행 (timeout 60s, 출력 트렁케이트) (C2-T22)
 */
import { execSync } from 'child_process';

export interface TestResult {
  success: boolean;
  passed: number;
  failed: number;
  output: string;
  duration: number;
  error?: string;
}

const ALLOWED_COMMANDS = [
  'npm test', 'npx jest', 'npx mocha', 'npx vitest',
  'pytest', 'python -m pytest',
  'cargo test', 'go test',
];

export class TestRunner {
  isAllowed(command: string): boolean {
    return ALLOWED_COMMANDS.some(cmd => command.startsWith(cmd));
  }

  /**
   * ADDON-T01: run only related test files (prefer vitest, then jest).
   * Paths are quoted; command stays on allowlist via `npx vitest` / `npx jest`.
   */
  async runRelatedTestFiles(
    testFiles: string[],
    cwd?: string,
    timeout = 60000
  ): Promise<TestResult> {
    if (testFiles.length === 0) {
      return {
        success: true,
        passed: 0,
        failed: 0,
        output: '',
        duration: 0,
      };
    }

    const quoted = testFiles
      .map((f) => (f.includes(' ') ? `"${f}"` : f))
      .join(' ');
    // vitest first (this repo), jest fallback
    const command = `npx vitest run ${quoted}`;
    const result = await this.runTest(command, cwd, timeout);
    if (
      result.error &&
      /vitest|ENOENT|not found|Cannot find/i.test(result.error + result.output)
    ) {
      return this.runTest(`npx jest --passWithNoTests ${quoted}`, cwd, timeout);
    }
    return result;
  }

  async runTest(command: string, cwd?: string, timeout = 60000): Promise<TestResult> {
    if (!this.isAllowed(command)) {
      return {
        success: false, passed: 0, failed: 0,
        output: '', duration: 0,
        error: `Test command not in allowlist: "${command.split(' ')[0]}". Allowed: npm test, npx jest, pytest, etc.`
      };
    }

    const start = Date.now();

    try {
      const output = execSync(command, {
        encoding: 'utf-8',
        timeout,
        maxBuffer: 32768,
        cwd
      });

      const duration = Date.now() - start;
      const { passed, failed } = this.parseResult(output);

      return {
        success: failed === 0,
        passed,
        failed,
        output: output.slice(0, 32000),
        duration
      };
    } catch (error: any) {
      const duration = Date.now() - start;
      const output = (error.stdout || '') + '\n' + (error.stderr || '');
      const { passed, failed } = this.parseResult(output);

      return {
        success: false,
        passed,
        failed: failed || 1,
        output: output.slice(0, 32000),
        duration,
        error: error.message
      };
    }
  }

  private parseResult(output: string): { passed: number; failed: number } {
    // Parse jest-style: "Tests: 10 passed, 2 failed"
    const jestMatch = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed/);
    if (jestMatch) {
      return { passed: parseInt(jestMatch[1]), failed: parseInt(jestMatch[2]) };
    }

    // Parse pytest: "1 passed, 2 failed"
    const pytestMatch = output.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
    if (pytestMatch) {
      return { passed: parseInt(pytestMatch[1]), failed: parseInt(pytestMatch[2]) };
    }

    // Fallback: count dots (pass) and Fs (fail)
    const dots = (output.match(/\./g) || []).length;
    const fs = (output.match(/F/g) || []).length;

    return { passed: dots, failed: fs };
  }
}
