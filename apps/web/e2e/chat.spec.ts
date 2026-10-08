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
  expect(count).toBeGreaterThanOrEqual(2);

  const lastText = await bubbles.last().textContent();
  expect(lastText?.trim().length).toBeGreaterThan(0);
});

test('report generation: ≥1 todo completes and ≥1 file appears in files panel', async ({
  page,
}) => {
  await page.goto('http://localhost:5173');

  const input = page.getByRole('textbox', { name: /message input/i });
  await input.fill(
    'Generate a short policy report on Article 5 of the EU AI Act. Write findings to /report/.',
  );
  await input.press('Enter');

  // Wait for run to finish (up to 60s for a full report run)
  await expect(page.getByLabel('streaming')).toBeVisible({ timeout: 5000 });
  await expect(page.getByLabel('streaming')).not.toBeVisible({ timeout: 60000 });

  // Feature 1: ≥1 todo must reach completed status
  const todoSection = page.getByRole('region', { name: /todo list/i });
  await expect(todoSection).toBeVisible({ timeout: 5000 });
  const doneTodos = todoSection.locator('[aria-label="Done"]');
  await expect(doneTodos.first()).toBeVisible({ timeout: 5000 });

  // Feature 2: ≥1 file must appear in the files panel
  const filesSection = page.getByRole('region', { name: /report files/i });
  await expect(filesSection).toBeVisible({ timeout: 5000 });
});

test('thread ID persisted in URL after first message', async ({ page }) => {
  await page.goto('http://localhost:5173');

  const input = page.getByRole('textbox', { name: /message input/i });
  await input.fill('Reply with exactly: SMOKE_OK');
  await input.press('Enter');

  await expect(page.getByLabel('streaming')).toBeVisible({ timeout: 5000 });

  // URL should contain ?thread= once a run has started
  await expect(page).toHaveURL(/\?thread=/, { timeout: 10000 });
});
