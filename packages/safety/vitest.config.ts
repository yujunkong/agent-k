import { defineConfig } from 'vitest/config';

/** Vitest for @agent-k/safety — pure permission/safety domain (no vscode/React). */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
