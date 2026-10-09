import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [
      'apps/**',
      '**/node_modules/**',
      '**/*.integration.test.*',
      'experiments/__tests__/e2e/**',
    ],
  },
});
