import { test, expect } from '@playwright/test';

// Requires both servers running:
//   pnpm dev:server   (LangGraph Server at localhost:2024)
//   pnpm dev:web      (Vite at localhost:5173)
// Run with: pnpm --filter web e2e
test('sends a message and receives a non-empty assistant reply within 30s', async ({ page }) => {
  await page.goto('http://localhost:5173');

  const input = page.getByRole('textbox', { name: /message input/i });
  await input.fill('What is the EU AI Act?');
  await input.press('Enter');

  // Wait for streaming indicator to appear then disappear
  await expect(page.getByLabel('streaming')).toBeVisible({ timeout: 5000 });
  await expect(page.getByLabel('streaming')).not.toBeVisible({ timeout: 30000 });

  // At least one assistant bubble must contain text
  const log = page.getByRole('log', { name: /message history/i });
  const bubbles = log.locator('span');
  const count = await bubbles.count();
  expect(count).toBeGreaterThanOrEqual(2); // user + assistant

  // Last bubble (assistant) should be non-empty
  const lastText = await bubbles.last().textContent();
  expect(lastText?.trim().length).toBeGreaterThan(0);
});
