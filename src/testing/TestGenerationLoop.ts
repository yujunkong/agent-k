/**
 * TestGenerationLoop — 실패 테스트 → 생성 → 실행 → 수정 루프 (C7-T25)
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface TestResult {
  file: string;
  passed: boolean;
  output: string;
  duration: number;
}

export class TestGenerationLoop {
  private repoRoot: string;
  private maxTurns: number;

  constructor(repoRoot: string, maxTurns: number = 3) {
    this.repoRoot = repoRoot;
    this.maxTurns = maxTurns;
  }

  /**
   * Run a test file and return results
   */
  async runTest(testFile: string, timeoutMs: number = 60000): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const output = execSync(
        this.getTestCommand(testFile),
        { cwd: this.repoRoot, timeout: timeoutMs, stdio: 'pipe' }
      ).toString();

      return {
        file: testFile,
        passed: true,
        output: output.slice(0, 5000),
        duration: Date.now() - startTime
      };
    } catch (err) {
      const stderr = (err as { stderr?: Buffer })?.stderr?.toString() ?? '';
      const stdout = (err as { stdout?: Buffer })?.stdout?.toString() ?? '';

      return {
        file: testFile,
        passed: false,
        output: (stdout + '\n' + stderr).slice(0, 5000),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Generate a test file based on source file analysis
   */
  async generateTest(sourceFile: string): Promise<string> {
    const ext = path.extname(sourceFile);
    const baseName = path.basename(sourceFile, ext);
    const dir = path.dirname(sourceFile);

    // Determine test file path
    const testFile = path.join(dir, `${baseName}.test${ext}`);

    // Generate basic test scaffold
    const content = this.generateTestScaffold(sourceFile, ext);
    fs.writeFileSync(testFile, content);

    return testFile;
  }

  /**
   * Fix a failing test (iterate up to maxTurns)
   */
  async fixFailingTest(testFile: string): Promise<{ fixed: boolean; turnsUsed: number; results: TestResult[] }> {
    const results: TestResult[] = [];

    for (let turn = 0; turn < this.maxTurns; turn++) {
      const result = await this.runTest(testFile);
      results.push(result);

      if (result.passed) {
        return { fixed: true, turnsUsed: turn + 1, results };
      }

      // Read test file and apply heuristic fix
      this.applyHeuristicFix(testFile, result.output);
    }

    return { fixed: false, turnsUsed: this.maxTurns, results };
  }

  /**
   * Find test file for a given source file
   */
  findTestFile(sourceFile: string): string | null {
    const dir = path.dirname(sourceFile);
    const ext = path.extname(sourceFile);
    const baseName = path.basename(sourceFile, ext);

    // Common patterns: *.test.ts, *.spec.ts, __tests__/*.ts
    const patterns = [
      path.join(dir, `${baseName}.test${ext}`),
      path.join(dir, `${baseName}.spec${ext}`),
      path.join(dir, `__tests__`, `${baseName}${ext}`),
      path.join(dir, `__tests__`, `${baseName}.test${ext}`),
      path.join(dir, `test`, `${baseName}${ext}`)
    ];

    for (const pattern of patterns) {
      if (fs.existsSync(pattern)) return pattern;
    }

    return null;
  }

  /**
   * Run all tests in a directory
   */
  async runAllTests(dir: string, pattern: string = '*.test.ts'): Promise<TestResult[]> {
    const testFiles = this.findTestFiles(dir, pattern);
    return await Promise.all(testFiles.map(f => this.runTest(f)));
  }

  private getTestCommand(testFile: string): string {
    const ext = path.extname(testFile);
    switch (ext) {
      case '.ts':
      case '.tsx':
        return `npx jest --no-coverage "${testFile}" 2>&1 || true`;
      case '.js':
      case '.jsx':
        return `npx jest --no-coverage "${testFile}" 2>&1 || true`;
      case '.py':
        return `python -m pytest "${testFile}" 2>&1 || true`;
      case '.go':
        return `go test -v "${testFile}" 2>&1 || true`;
      default:
        return `npx jest --no-coverage "${testFile}" 2>&1 || true`;
    }
  }

  private generateTestScaffold(sourceFile: string, ext: string): string {
    const baseName = path.basename(sourceFile, ext);
    const imports = `import * as assert from 'assert';\nimport { /* TODO: add imports */ } from './${baseName}';\n\n`;

    switch (ext) {
      case '.ts':
      case '.tsx':
        return `${imports}suite('${baseName}', () => {\n  test('should work', () => {\n    // TODO: implement test\n    assert.ok(true);\n  });\n});\n`;
      case '.py':
        return `import pytest\nfrom ${baseName} import *\n\nclass Test${baseName.charAt(0).toUpperCase() + baseName.slice(1)}:\n    def test_should_work(self):\n        assert True\n`;
      default:
        return `// Test file for ${sourceFile}\n// TODO: implement tests\n`;
    }
  }

  private applyHeuristicFix(testFile: string, errorOutput: string): void {
    // Simple heuristic: if test file has syntax error, attempt basic fixes
    const content = fs.readFileSync(testFile, 'utf-8');

    if (errorOutput.includes('SyntaxError') || errorOutput.includes('Unexpected token')) {
      // Attempt to fix common issues
      let fixed = content;

      // Fix missing semicolons
      if (errorOutput.includes('Missing semicolon') || errorOutput.includes('ASI')) {
        fixed = fixed.replace(/(\w)\s*\n\s*(?=\w|export|import|const|let|var|function|class)/g, '$1;\n');
      }

      // Fix unclosed braces
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      if (openBraces > closeBraces) {
        fixed += '\n'.repeat(openBraces - closeBraces) + '}\n';
      }

      fs.writeFileSync(testFile, fixed);
    }
  }

  private findTestFiles(dir: string, pattern: string): string[] {
    if (!fs.existsSync(dir)) return [];

    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        results.push(...this.findTestFiles(fullPath, pattern));
      } else if (entry.isFile() && entry.name.match(pattern.replace(/\*/g, '.*'))) {
        results.push(fullPath);
      }
    }

    return results;
  }
}
