import type { Page } from '@playwright/test';

// The app talks to the LangGraph API at VITE_API_URL (http://localhost:2024 here). On load with a
// stored thread ID it reads GET /threads/<id>/state and POST /threads/<id>/history; mocking those two
// restores a thread's messages without a backend.
export const THREAD_ID = '00000000-0000-4000-8000-000000000001';

type Message = { type: 'human' | 'ai'; content: string; id: string };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

export async function restoreThread(page: Page, messages: Message[]) {
  const state = {
    values: { messages },
    next: [],
    tasks: [],
    metadata: {},
    created_at: '2026-10-22T00:00:00Z',
    checkpoint: { thread_id: THREAD_ID, checkpoint_ns: '', checkpoint_id: 'c1' },
    parent_checkpoint: null,
  };
  await page.route('http://localhost:2024/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/state')) return route.fulfill({ json: state, headers: CORS });
    if (path.endsWith('/history')) return route.fulfill({ json: [state], headers: CORS });
    return route.fulfill({ status: 404, json: {}, headers: CORS });
  });
  await page.addInitScript((id) => sessionStorage.setItem('deep-agents-thread', id), THREAD_ID);
}
