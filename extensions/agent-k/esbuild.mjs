/**
 * Bundle the VSIX entry + @agent-k/host into a single CommonJS file.
 * VS Code Extension Host cannot load bare TypeScript / extensionless ESM imports.
 */

import * as esbuild from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'dist');
mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [join(here, 'src/extension.ts')],
  bundle: true,
  outfile: join(outDir, 'extension.js'),
  format: 'cjs',
  platform: 'node',
  target: ['node18'],
  sourcemap: true,
  // vscode is provided by the Extension Host at runtime.
  external: ['vscode'],
  logLevel: 'info',
});

console.log('EXT-001: wrote extensions/agent-k/dist/extension.js');
