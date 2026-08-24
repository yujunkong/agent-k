import { defineConfig } from 'vitest/config';

/** Vitest for @agent-k/plan — session / execution / card pipeline. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
