import { test, expect } from '@playwright/test';
import { restoreThread, unhandledRequests } from './mock-api.js';

// E1-03 (#9, #10): single line breaks in AI Markdown replies are visible; paragraphs, lists and code
// blocks render as before.
const AI_CONTENT = [
  'Line one\nLine two\nLine three',
  'Items:\n- apple\n- pear',
  '```js\nconst a = 1;\nconst b = 2;\n```',
].join('\n\n');

test.beforeEach(async ({ page }) => {
  await restoreThread(page, [
    { type: 'human', content: 'Show me lines', id: 'h1' },
    { type: 'ai', content: AI_CONTENT, id: 'a1' },
    { type: 'human', content: 'And as blocks?', id: 'h2' },
    // Text blocks, as OpenAI-style providers send them; the line break sits inside one block.
    { type: 'ai', content: [{ type: 'text', text: 'Block one\nBlock two' }], id: 'a2' },
  ]);
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  expect(unhandledRequests(page)).toEqual([]);
});

test('E1-03 AC1: a single line break shows as a line break inside one paragraph', async ({
  page,
}) => {
  const firstParagraph = page.locator('.msg-bubble--ai p').first();
  await expect(firstParagraph.locator('br')).toHaveCount(2);
  await expect(firstParagraph).toHaveText(/Line one\s*Line two\s*Line three/);
  // Three visual lines, not one: the paragraph is at least 3 line-heights tall.
  const { height, lineHeight } = await firstParagraph.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(height).toBeGreaterThanOrEqual(lineHeight * 3 - 1);
});

test('E1-03 AC1: a line break inside text-block content shows too', async ({ page }) => {
  const paragraph = page.locator('.msg-bubble--ai').nth(1).locator('p');
  await expect(paragraph.locator('br')).toHaveCount(1);
  await expect(paragraph).toHaveText(/Block one\s*Block two/);
});

test('E1-03 AC2/AC3: paragraphs, lists and code blocks render as before', async ({ page }) => {
  const bubble = page.locator('.msg-bubble--ai').first();
  await expect(bubble.locator('p')).toHaveCount(2);
  await expect(bubble.locator('ul > li')).toHaveText(['apple', 'pear']);
  await expect(bubble.locator('pre code')).toHaveText('const a = 1;\nconst b = 2;\n');
  await expect(bubble.locator('pre br')).toHaveCount(0);
  // toHaveText normalizes whitespace, so check the code block still keeps its own line breaks.
  await expect(bubble.locator('pre')).toHaveCSS('white-space', /^pre/);
});

test('E1-03 AC4: the AI bubble keeps white-space normal', async ({ page }) => {
  await expect(page.locator('.msg-bubble--ai').first()).toHaveCSS('white-space', 'normal');
});
