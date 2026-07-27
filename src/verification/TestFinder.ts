/**
 * TestFinder - 동일 디렉터리 *.test.ts / 미러 디렉터리 탐지 (C2-T21)
 */
import * as path from 'path';
import * as fs from 'fs';

export interface TestFile {
  filePath: string;
  type: 'same_dir' | 'mirror_dir' | '__tests__';
  framework: 'jest' | 'mocha' | 'pytest' | 'unknown';
}

const TEST_PATTERNS = [
  /\.(test|spec)\.(ts|tsx|js|jsx)$/,
  /\.(test|spec)\.py$/,
  /_test\.go$/,
  /_test\.rs$/,
  /test_.*\.py$/,
];

export class TestFinder {
  findRelatedTests(sourceFile: string): TestFile[] {
    const tests: TestFile[] = [];
    const dir = path.dirname(sourceFile);
    const ext = path.extname(sourceFile);
    const basename = path.basename(sourceFile, ext);

    // 1. Same directory — prefer basename.test/spec, then other tests that mention basename
    try {
      const entries = fs.readdirSync(dir);
      const candidates: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        if (!fs.statSync(fullPath).isFile()) continue;
        if (!TEST_PATTERNS.some((pattern) => pattern.test(entry))) continue;
        candidates.push(entry);
      }
      const preferred = candidates.filter(
        (e) =>
          e.startsWith(`${basename}.test.`) ||
          e.startsWith(`${basename}.spec.`) ||
          e.startsWith(`test_${basename}`)
      );
      const picked = preferred.length > 0 ? preferred : candidates.filter((e) => e.includes(basename));
      for (const entry of picked) {
        tests.push({
          filePath: path.join(dir, entry),
          type: 'same_dir',
          framework: detectFramework(entry),
        });
      }
    } catch { /* ignore */ }

    // 2. Mirror directory: src/ → tests/ or __tests__/
    const mirrorDirs = [
      path.join(dir.replace(/\/src\//, '/tests/')),
      path.join(dir.replace(/\/src\//, '/__tests__/')),
      path.join(dir, '__tests__'),
    ];

    for (const mirrorDir of mirrorDirs) {
      try {
        if (fs.existsSync(mirrorDir)) {
          const entries = fs.readdirSync(mirrorDir);
          for (const entry of entries) {
            if (entry.includes(basename) || entry.includes(sourceFile.split('/').pop()?.split('.')[0] || '')) {
              const fullPath = path.join(mirrorDir, entry);
              if (fs.statSync(fullPath).isFile()) {
                tests.push({ filePath: fullPath, type: 'mirror_dir', framework: detectFramework(entry) });
              }
            }
          }
        }
      } catch { /* ignore */ }
    }

    return tests;
  }

  async findTestsInWorkspace(pattern?: string): Promise<TestFile[]> {
    // Stub: real implementation uses vscode.workspace.findFiles
    return [];
  }
}

function detectFramework(filename: string): TestFile['framework'] {
  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'jest';
  if (filename.endsWith('.py')) return 'pytest';
  if (filename.endsWith('.go')) return 'jest'; // actually Go testing
  return 'unknown';
}
