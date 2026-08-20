import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/chat',
  base: '',
  resolve: {
    // Webview cannot import real vscode / Node builtins — stub for transitive
    // extension-host-only imports (e.g. ideContextInjector.ts's execFileSync).
    alias: {
      vscode: resolve(__dirname, 'src/chat/vscode-shim.ts'),
      child_process: resolve(__dirname, 'src/chat/node-shims.ts'),
      fs: resolve(__dirname, 'src/chat/node-shims.ts'),
      path: resolve(__dirname, 'src/chat/node-shims.ts'),
      // Workspace package — prefer @agent-k/providers over src/providers shims
      '@agent-k/providers': resolve(__dirname, 'packages/providers/src'),
      '@agent-k/shared': resolve(__dirname, 'packages/shared/src'),
    }
  },
  // Webview loads chat.js as a classic/non-module script — strip Vite/ESM env bits
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.MODE': JSON.stringify('production'),
    // Mermaid loaders leave import.meta.url; classic scripts throw without this
    'import.meta.url': JSON.stringify('')
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: false,
    cssCodeSplit: false,
    // IIFE so Extension Host <script src> works (no type=module / import.meta)
    target: 'es2020',
    rollupOptions: {
      input: resolve(__dirname, 'src/chat/main.tsx'),
      output: {
        format: 'iife',
        name: 'AgentKChat',
        // Single bundle — webview CSP cannot load hashed chunk scripts without nonce
        inlineDynamicImports: true,
        entryFileNames: 'chat.js',
        assetFileNames: 'chat.css'
      }
    }
  },
  server: {
    port: 3000,
    hmr: {
      protocol: 'ws',
      host: 'localhost'
    }
  }
});
