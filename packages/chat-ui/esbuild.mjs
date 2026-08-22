/**
 * EXT-002 — chat-ui webview bundle.
 *
 * Modes (AK_WEBVIEW_BUILD):
 *   - `single` (default) — one IIFE `chat.js` for F5 / Extension Development Host (fast, simple).
 *   - `chunks` — ESM + code-splitting for later packaged extension builds (mermaid/shiki lazy).
 *
 * Host HTML still loads single `media/chat.js` until EXT wires `type=module` + chunk URIs.
 */

import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, 'dist');
const mediaDir = join(here, '../../extensions/agent-k/media');
const chatDir = join(here, 'src/chat');
const vscodeShim = join(chatDir, 'vscode-shim.ts');
const nodeShims = join(chatDir, 'node-shims.ts');

const mode = String(process.env.AK_WEBVIEW_BUILD || 'single').toLowerCase();
const useChunks = mode === 'chunks' || mode === 'prod' || mode === 'split';

const shared = {
  entryPoints: [join(chatDir, 'main.tsx')],
  bundle: true,
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
    // UI can branch later for dynamic import paths when host serves chunks
    'process.env.AK_WEBVIEW_CHUNKS': useChunks ? '"1"' : '""',
  },
  logLevel: 'info',
};

mkdirSync(distDir, { recursive: true });
mkdirSync(mediaDir, { recursive: true });

if (!useChunks) {
  // ─── Dev / F5: single IIFE ─────────────────────────────────
  await esbuild.build({
    ...shared,
    outfile: join(distDir, 'chat.js'),
    format: 'iife',
  });
  cpSync(join(distDir, 'chat.js'), join(mediaDir, 'chat.js'));
  if (existsSync(join(distDir, 'chat.css'))) {
    cpSync(join(distDir, 'chat.css'), join(mediaDir, 'chat.css'));
  }
  console.log('EXT-002 [single]: wrote extensions/agent-k/media/chat.{js,css}');
} else {
  // ─── Packaged extension (later): ESM chunks ────────────────
  // Requires host to load <script type="module" src=".../chunks/chat.js">
  // and allow chunk URIs under media/chunks/ in localResourceRoots.
  const chunksDist = join(distDir, 'chunks');
  const chunksMedia = join(mediaDir, 'chunks');
  rmSync(chunksDist, { recursive: true, force: true });
  rmSync(chunksMedia, { recursive: true, force: true });
  mkdirSync(chunksDist, { recursive: true });

  await esbuild.build({
    ...shared,
    outdir: chunksDist,
    format: 'esm',
    splitting: true,
    entryNames: 'chat',
    chunkNames: 'chunk-[name]-[hash]',
    assetNames: 'asset-[name]-[hash]',
  });

  mkdirSync(chunksMedia, { recursive: true });
  for (const name of readdirSync(chunksDist)) {
    cpSync(join(chunksDist, name), join(chunksMedia, name));
  }

  // Keep a single chat.css at media root if esbuild emitted one next to entry
  const cssAt = join(chunksDist, 'chat.css');
  if (existsSync(cssAt)) {
    cpSync(cssAt, join(mediaDir, 'chat.css'));
  }

  console.log(
    'EXT-002 [chunks]: wrote extensions/agent-k/media/chunks/* (ESM). Host still serves single IIFE until wired.'
  );
  console.log(
    '  Next: webviewHtml type=module + localResourceRoots include media/chunks; F5 keeps npm run build:webview (single).'
  );
}
