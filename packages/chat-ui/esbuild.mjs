/**
 * EXT-002 — build chat-ui as a single IIFE for the webview.
 * Mirrors v2.1 vite aliases: vscode / Node builtins → chat shims.
 * Output: dist/chat.js + dist/chat.css → extensions/agent-k/media.
 */

import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, 'dist');
const mediaDir = join(here, '../../extensions/agent-k/media');
const chatDir = join(here, 'src/chat');
const vscodeShim = join(chatDir, 'vscode-shim.ts');
const nodeShims = join(chatDir, 'node-shims.ts');

await esbuild.build({
  entryPoints: [join(chatDir, 'main.tsx')],
  bundle: true,
  outfile: join(distDir, 'chat.js'),
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  minify: true,
  loader: { '.css': 'css', '.png': 'dataurl', '.svg': 'dataurl' },
  // v2.1 vite parity — webview cannot load real vscode / Node builtins
  alias: {
    vscode: vscodeShim,
    child_process: nodeShims,
    fs: nodeShims,
    path: nodeShims,
    os: nodeShims,
    crypto: nodeShims,
  },
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.MODE': '"production"',
    'import.meta.url': '""',
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});

mkdirSync(mediaDir, { recursive: true });
cpSync(join(distDir, 'chat.js'), join(mediaDir, 'chat.js'));
cpSync(join(distDir, 'chat.css'), join(mediaDir, 'chat.css'));

console.log('EXT-002: wrote extensions/agent-k/media/chat.{js,css}');
