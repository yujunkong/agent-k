/**
 * B-2 boundary guard — chat-ui must not import vscode / node builtins / network.
 * Scans webview source files (excluding the esbuild shims) for forbidden specifiers.
 * This test runs in Node (vitest) — it is not part of the webview bundle.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(process.cwd(), 'src');

const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: 'vscode import', re: /from ['"]vscode['"]/ },
  { label: 'vscode require', re: /require\(['"]vscode['"]\)/ },
  {
    label: 'node builtin import',
    re: /from ['"](node:)?(fs|path|os|child_process|crypto|net|http|https|url)['"]/,
  },
  {
    label: 'node builtin require',
    re: /require\(['"](node:)?(fs|path|os|child_process|crypto|net|http|https|url)['"]\)/,
  },
  { label: 'network fetch', re: /\bfetch\(/ },
];

/** esbuild aliases intentionally stub these for the webview. */
const ALLOWED = new Set([
  path.join(SRC, 'chat', 'vscode-shim.ts'),
  path.join(SRC, 'chat', 'node-shims.ts'),
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

describe('B-2 chat-ui boundary guard', () => {
  it('no vscode / node builtin imports / network fetch in webview source', () => {
    const violations: string[] = [];
    for (const file of walk(SRC)) {
      if (ALLOWED.has(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      for (const { label, re } of FORBIDDEN) {
        if (re.test(content)) {
          violations.push(`${path.relative(SRC, file)} → ${label}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
