import { defineConfig } from 'vitest/config';

/** Vitest for @agent-k/chat-ui — jsdom React shell tests. */
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  esbuild: {
    jsx: 'automatic',
  },
});
