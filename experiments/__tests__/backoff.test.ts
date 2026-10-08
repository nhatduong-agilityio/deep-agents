import { describe, expect, it, vi } from 'vitest';
import { withBackoff } from '@deep-agents/core';

function make429(): Error & { status: number } {
  const err = new Error('Too Many Requests') as Error & { status: number };
  err.status = 429;
  return err;
}

describe('withBackoff', () => {
  it('returns immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withBackoff(fn, { baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(make429())
      .mockRejectedValueOnce(make429())
      .mockResolvedValue('ok');

    const result = await withBackoff(fn, { baseDelayMs: 1, maxRetries: 5 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after maxRetries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(make429());
    await expect(withBackoff(fn, { baseDelayMs: 1, maxRetries: 2 })).rejects.toMatchObject({
      status: 429,
    });
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry on non-429 errors', async () => {
    const err = new Error('Internal Server Error') as Error & { status: number };
    err.status = 500;
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withBackoff(fn, { baseDelayMs: 1 })).rejects.toMatchObject({ status: 500 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
