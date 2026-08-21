import { defineConfig } from 'vitest/config';

/** Vitest for @agent-k/core — pure runtime/config domain (no vscode/React). */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
