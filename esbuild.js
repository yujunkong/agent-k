const esbuild = require('esbuild');
const { copyFileSync, existsSync, mkdirSync } = require('fs');
const { join } = require('path');

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

async function build() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['vscode'],
    sourcemap: isProduction ? false : 'inline',
    sourcesContent: false,
    treeShaking: true,
    minify: isProduction,
    define: {
      'process.env.NODE_ENV': isProduction ? '"production"' : '"development"'
    }
  });

  if (isWatch) {
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('Build complete');
  }

  // Copy resources
  if (existsSync('resources')) {
    if (!existsSync('dist/resources')) mkdirSync('dist/resources', { recursive: true });
    if (existsSync('resources/icon.svg')) copyFileSync('resources/icon.svg', 'dist/resources/icon.svg');
  }
}

build().catch(() => process.exit(1));