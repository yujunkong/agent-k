import { defineConfig } from 'vitest/config';

/** Vitest for @agent-k/providers — pure provider/model domain (no vscode/React). */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
