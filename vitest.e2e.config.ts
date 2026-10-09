import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['experiments/__tests__/e2e/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 30_000,
    // E2e tests hit real LLM APIs — run sequentially to avoid 429s.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
