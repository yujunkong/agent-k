import { defineConfig } from 'vitest/config';

/** Vitest for @agent-k/shared — pure type guards / contracts only. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
