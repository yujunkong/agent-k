const esbuild = require('esbuild');
const { copyFileSync, existsSync, mkdirSync } = require('fs');
const { join } = require('path');

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

/**
 * Optional / native deps must stay external — AgentLoop dynamic-imports browser
 * tools which pull playwright → chromium-bidi + fsevents (.node).
 */
const externalNativePlugin = {
  name: 'external-native-optional',
  setup(build) {
    // playwright and its transitive chromium-bidi paths
    build.onResolve(
      { filter: /^(playwright|playwright-core|chromium-bidi|fsevents)(\/|$)/ },
      (args) => ({ path: args.path, external: true })
    );
    // Native addons (.node) — never bundle
    build.onResolve({ filter: /\.node$/ }, (args) => ({
      path: args.path,
      external: true
    }));
  }
};

async function build() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: [
      'vscode',
      'playwright',
      'playwright-core',
      'chromium-bidi',
      'fsevents'
    ],
    plugins: [externalNativePlugin],
    sourcemap: isProduction ? false : 'inline',
    sourcesContent: false,
    treeShaking: true,
    minify: isProduction,
    // Optional require() of missing natives must not fail the build
    logOverride: {
      'ignored-bare-import': 'silent'
    },
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

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
