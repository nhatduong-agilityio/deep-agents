import { test, expect, type Locator, type Page } from '@playwright/test';

// E1-02 (#8, #11) and its follow-ups (#14, #17): the message input grows with its content up to 6
// lines, then scrolls. Assertions compare heights, not pixels, so font differences between machines
// don't matter.

function input(page: Page) {
  return page.getByRole('textbox', { name: /message input/i });
}

async function box(el: Locator) {
  return el.evaluate((e: HTMLElement) => ({
    h: e.offsetHeight,
    ch: e.clientHeight,
    sh: e.scrollHeight,
  }));
}

async function typeLines(el: Locator, count: number) {
  await el.click();
  await el.pressSequentially('line 1');
  for (let i = 2; i <= count; i++) {
    await el.press('Shift+Enter');
    await el.pressSequentially(`line ${i}`);
  }
}

// "ResizeObserver loop completed with undelivered notifications" is a window 'error' event, not an
// uncaught exception, so Playwright's pageerror never sees it. Collect error events in the page.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const errors: string[] = [];
    Object.assign(window, { __errors: errors });
    window.addEventListener('error', (e) => errors.push(e.message));
  });
  await page.goto('/');
});

async function resizeObserverErrors(page: Page) {
  return page.evaluate(() =>
    ((window as unknown as { __errors: string[] }).__errors ?? []).filter((m) =>
      m.includes('ResizeObserver'),
    ),
  );
}

function fillLog(page: Page) {
  return page.getByRole('log').evaluate((el) => {
    for (let i = 0; i < 60; i++) {
      const row = document.createElement('div');
      row.textContent = `filler ${i}`;
      row.style.height = '24px';
      el.appendChild(row);
    }
  });
}

test('E1-02 AC1: the box grows with each line', async ({ page }) => {
  const el = input(page);
  await typeLines(el, 1);
  const one = await box(el);
  await el.press('Shift+Enter');
  await el.pressSequentially('line 2');
  const two = await box(el);
  await el.press('Shift+Enter');
  await el.pressSequentially('line 3');
  const three = await box(el);
  expect(two.h).toBeGreaterThan(one.h);
  expect(three.h).toBeGreaterThan(two.h);
  expect(three.sh).toBeLessThanOrEqual(three.ch + 1);
});

test('E1-02 AC2: it stops at 6 lines, then scrolls', async ({ page }) => {
  const el = input(page);
  await typeLines(el, 6);
  const six = await box(el);
  expect(six.sh).toBeLessThanOrEqual(six.ch + 1);
  for (let i = 7; i <= 8; i++) {
    await el.press('Shift+Enter');
    await el.pressSequentially(`line ${i}`);
  }
  const eight = await box(el);
  expect(Math.abs(eight.h - six.h)).toBeLessThanOrEqual(2);
  expect(eight.sh).toBeGreaterThan(eight.ch);
});

test('E1-02 AC3: clearing the box resets it to one row', async ({ page }) => {
  const el = input(page);
  await typeLines(el, 1);
  const one = await box(el);
  await typeLines(el, 4);
  expect((await box(el)).h).toBeGreaterThan(one.h);
  await el.fill('');
  expect((await box(el)).h).toBe(one.h);
});

test('E1-02 AC4: deleting lines shrinks the box', async ({ page }) => {
  const el = input(page);
  await el.fill('a\nb\nc\nd\ne');
  const five = await box(el);
  await el.fill('a\nb');
  expect((await box(el)).h).toBeLessThan(five.h);
});

test('E1-02 AC5: there is no drag-resize corner', async ({ page }) => {
  await expect(input(page)).toHaveCSS('resize', 'none');
});

test('#14: a long line re-fits when the window width changes, with no ResizeObserver errors', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const el = input(page);
  // 25 words: wraps to 2 lines at 1280px and 3–4 at 500px, well under the 6-line cap with any font.
  await el.fill('word '.repeat(25).trim());
  const wide = await box(el);
  await page.setViewportSize({ width: 500, height: 800 });
  await expect.poll(async () => (await box(el)).h).toBeGreaterThan(wide.h);
  const narrow = await box(el);
  expect(narrow.sh).toBeLessThanOrEqual(narrow.ch + 1);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(async () => (await box(el)).h).toBe(wide.h);
  expect(await resizeObserverErrors(page)).toEqual([]);
});

test('#14: the message log stays at the bottom while the input grows', async ({ page }) => {
  const log = page.getByRole('log');
  await fillLog(page);
  await log.evaluate((el) => {
    el.style.scrollBehavior = 'auto';
    el.scrollTop = el.scrollHeight;
    el.style.scrollBehavior = '';
  });
  const gap = () =>
    log.evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight));
  const el = input(page);
  await typeLines(el, 1);
  const before = (await box(el)).h;
  expect(await gap()).toBe(0);
  await el.press('Shift+Enter');
  await el.press('Shift+Enter');
  expect((await box(el)).h).toBeGreaterThan(before);
  expect(await gap()).toBe(0);
  // Deliberate wait, not a sync: the log scrolls smoothly, so check nothing moves after it settles.
  await page.waitForTimeout(500);
  expect(await gap()).toBe(0);
});

// Chromium passes this one even without the fix (scroll anchoring); Firefox detects the bug.
test('#14: typing does not move a log the reader scrolled up a little', async ({ page }) => {
  const log = page.getByRole('log');
  await fillLog(page);
  const el = input(page);
  await el.fill('a\nb\nc\nd');
  // Just above the bottom: scrolled up 30px, less than the input's extra height.
  await log.evaluate((e) => {
    e.style.scrollBehavior = 'auto';
    e.scrollTop = e.scrollHeight - e.clientHeight - 30;
    e.style.scrollBehavior = '';
  });
  const gap = () => log.evaluate((e) => Math.round(e.scrollHeight - e.scrollTop - e.clientHeight));
  expect(await gap()).toBe(30);
  await el.press('End');
  await el.pressSequentially('x');
  expect(await gap()).toBe(30);
});

test('#14: a log scrolled far up keeps its place when the input grows', async ({ page }) => {
  const log = page.getByRole('log');
  await fillLog(page);
  await log.evaluate((e) => {
    e.style.scrollBehavior = 'auto';
    e.scrollTop = e.scrollHeight - e.clientHeight - 200;
    e.style.scrollBehavior = '';
  });
  const top = () => log.evaluate((e) => Math.round(e.scrollTop));
  const before = await top();
  const el = input(page);
  await typeLines(el, 1);
  const one = (await box(el)).h;
  await el.press('Shift+Enter');
  await el.press('Shift+Enter');
  expect((await box(el)).h).toBeGreaterThan(one);
  // The reader's place is kept: scrollTop unchanged, the log did not jump to the bottom.
  expect(Math.abs((await top()) - before)).toBeLessThanOrEqual(1);
  const gap = await log.evaluate((e) => e.scrollHeight - e.scrollTop - e.clientHeight);
  expect(gap).toBeGreaterThan(150);
});

test('E1-02 AC2: pasting many lines stops at the cap and scrolls', async ({ page }) => {
  const el = input(page);
  await typeLines(el, 6);
  const six = await box(el);
  await el.fill(Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n'));
  const fifty = await box(el);
  expect(Math.abs(fifty.h - six.h)).toBeLessThanOrEqual(2);
  expect(fifty.sh).toBeGreaterThan(fifty.ch);
});

test('E1-02: at a 320px window the box still fits its text and Send stays visible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const el = input(page);
  await el.fill('word '.repeat(12).trim());
  const narrow = await box(el);
  expect(narrow.sh).toBeLessThanOrEqual(narrow.ch + 1);
  await expect(page.getByRole('button', { name: /send/i })).toBeInViewport();
  expect(await resizeObserverErrors(page)).toEqual([]);
});
