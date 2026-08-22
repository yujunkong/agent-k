import { defineConfig } from 'vitest/config';

/** Vitest for @agent-k/tools — Node fs/path/child_process, no vscode/React. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
