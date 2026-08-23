import { defineConfig } from 'vitest/config';

/** Vitest for @agent-k/worktree — git/fs domain only (no vscode/React). */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
