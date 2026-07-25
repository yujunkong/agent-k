import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/chat',
  base: '',
  build: {
    outDir: '../../dist',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/chat/main.tsx'),
      output: {
        entryFileNames: 'chat.js',
        chunkFileNames: 'chat-[hash].js',
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