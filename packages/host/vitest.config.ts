import { defineConfig } from 'vitest/config';

/** Vitest for @agent-k/host — pure helpers; vscode types only for ChatViewProvider compile. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
