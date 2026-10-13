import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The Maia reference test loads a network; give it room on a slow machine.
    testTimeout: 30_000,
  },
});
