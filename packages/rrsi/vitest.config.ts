import { defineConfig } from 'vitest/config';

/** Vitest for @agent-k/rrsi — pure search/selection domain (no vscode/React). */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
