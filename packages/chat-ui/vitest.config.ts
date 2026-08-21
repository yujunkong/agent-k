import { defineConfig } from 'vitest/config';

/** Vitest for @agent-k/chat-ui — jsdom React shell tests. */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  esbuild: {
    jsx: 'automatic',
  },
});
