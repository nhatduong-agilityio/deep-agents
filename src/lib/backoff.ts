export interface BackoffOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

// Jitter prevents thundering herd when multiple runs hit 429 simultaneously
function jitter(ms: number): number {
  return ms * (0.75 + Math.random() * 0.5);
}

export async function withBackoff<T>(fn: () => Promise<T>, opts: BackoffOptions = {}): Promise<T> {
  const { maxRetries = 5, baseDelayMs = 1000, maxDelayMs = 30_000 } = opts;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status =
        (err as { status?: number; response?: { status?: number } })?.status ??
        (err as { response?: { status?: number } })?.response?.status;

      if (status !== 429 || attempt >= maxRetries) throw err;

      const delay = jitter(Math.min(baseDelayMs * 2 ** attempt, maxDelayMs));
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }
  }
}
