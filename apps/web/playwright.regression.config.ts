import { defineConfig, devices } from '@playwright/test';

// Day 14 UI regression suite: runs against the Vite dev server only. The LangGraph API is mocked
// with page.route, so it needs no backend and no API keys (unlike e2e/, which needs both).
export default defineConfig({
  testDir: 'regression',
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:5174', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  // Own port and API URL, so local runs match CI (no .env.local there) and never reuse a dev server.
  webServer: {
    command: 'pnpm exec vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    env: { VITE_API_URL: 'http://localhost:2024' },
    reuseExistingServer: false,
  },
});
