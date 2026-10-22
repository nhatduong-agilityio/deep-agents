import type { Page } from '@playwright/test';

// The app talks to the LangGraph API at VITE_API_URL (http://localhost:2024 here). On load with a
// stored thread ID it reads GET /threads/<id>/state and POST /threads/<id>/history; mocking those two
// restores a thread's messages without a backend.
export const THREAD_ID = '00000000-0000-4000-8000-000000000001';

// Real providers send either a string or OpenAI-style text blocks (App.tsx flattenContent).
type Content = string | { type: 'text'; text: string }[];
type Message = { type: 'human' | 'ai'; content: Content; id: string };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const unhandled = new WeakMap<Page, string[]>();

// Requests the mock does not answer. A new or renamed SDK endpoint shows up here instead of failing
// silently as a 404; specs assert this list is empty.
export function unhandledRequests(page: Page): string[] {
  return unhandled.get(page) ?? [];
}

export async function restoreThread(page: Page, messages: Message[]) {
  const state = {
    values: { messages },
    // next: [] and tasks: [] tell the SDK the thread is idle, so it opens no stream to rejoin a run.
    next: [],
    tasks: [],
    metadata: {},
    created_at: '2026-10-22T00:00:00Z',
    checkpoint: { thread_id: THREAD_ID, checkpoint_ns: '', checkpoint_id: 'c1' },
    parent_checkpoint: null,
  };
  const missed: string[] = [];
  unhandled.set(page, missed);
  await page.route('http://localhost:2024/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/state')) return route.fulfill({ json: state, headers: CORS });
    if (path.endsWith('/history')) return route.fulfill({ json: [state], headers: CORS });
    missed.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 404, json: {}, headers: CORS });
  });
  await page.addInitScript((id) => sessionStorage.setItem('deep-agents-thread', id), THREAD_ID);
}
