import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [
      'apps/**',
      // Claude Code session worktrees hold full repo copies; their tests belong to their own runs.
      '.claude/worktrees/**',
      '**/node_modules/**',
      '**/*.integration.test.*',
      'experiments/__tests__/e2e/**',
    ],
  },
});
