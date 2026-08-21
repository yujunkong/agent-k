/**
 * EXT-002 — build chat-ui as a single IIFE for the webview.
 * Output: dist/chat.js + dist/chat.css, then copy into extensions/agent-k/media.
 */

import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, 'dist');
const mediaDir = join(here, '../../extensions/agent-k/media');

await esbuild.build({
  entryPoints: [join(here, 'src/main.tsx')],
  bundle: true,
  outfile: join(distDir, 'chat.js'),
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  minify: true,
  loader: { '.css': 'css' },
  logLevel: 'info',
});

mkdirSync(mediaDir, { recursive: true });
cpSync(join(distDir, 'chat.js'), join(mediaDir, 'chat.js'));
cpSync(join(distDir, 'chat.css'), join(mediaDir, 'chat.css'));

console.log('EXT-002: wrote extensions/agent-k/media/chat.{js,css}');
