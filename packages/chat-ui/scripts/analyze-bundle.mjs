import * as esbuild from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const outDir = '/tmp/ak-bundle-analyze';
mkdirSync(outDir, { recursive: true });
const chatDir = join(pkgRoot, 'src/chat');

const r = await esbuild.build({
  entryPoints: [join(chatDir, 'main.tsx')],
  bundle: true,
  outfile: join(outDir, 'chat.js'),
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  minify: true,
  metafile: true,
  alias: {
    vscode: join(chatDir, 'vscode-shim.ts'),
    child_process: join(chatDir, 'node-shims.ts'),
    fs: join(chatDir, 'node-shims.ts'),
    path: join(chatDir, 'node-shims.ts'),
    os: join(chatDir, 'node-shims.ts'),
    crypto: join(chatDir, 'node-shims.ts'),
  },
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.MODE': '"production"',
    'import.meta.url': '""',
    'process.env.NODE_ENV': '"production"',
  },
  loader: { '.css': 'css', '.png': 'dataurl', '.svg': 'dataurl' },
});

const groups = new Map();
for (const [k, v] of Object.entries(r.metafile.inputs)) {
  let g = k;
  if (k.includes('node_modules/')) {
    const m = k.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
    g = 'nm:' + (m ? m[1] : '?');
  } else if (k.includes('/src/')) {
    const rest = k.split('/src/')[1] || k;
    g = 'src/' + rest.split('/')[0];
  }
  groups.set(g, (groups.get(g) || 0) + v.bytes);
}
console.log('Top input contributors:');
for (const [g, b] of [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`${(b / 1024 / 1024).toFixed(2).padStart(6)} MB  ${g}`);
}
const out = Object.values(r.metafile.outputs)[0];
console.log(`\nMinified output: ${(out.bytes / 1024 / 1024).toFixed(2)} MB`);

const files = Object.entries(r.metafile.inputs)
  .map(([k, v]) => {
    let short = k;
    const nm = k.indexOf('node_modules/');
    if (nm >= 0) short = k.slice(nm + 'node_modules/'.length);
    const src = k.indexOf('/src/');
    if (src >= 0 && nm < 0) short = 'src/' + k.slice(src + 5);
    return { k: short, bytes: v.bytes };
  })
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 20);
console.log('\nTop files:');
for (const f of files) {
  console.log(`${(f.bytes / 1024).toFixed(0).padStart(7)} KB  ${f.k}`);
}
