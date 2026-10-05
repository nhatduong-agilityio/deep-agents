export interface RetryStats {
  retryCount: number;
  totalWaitMs: number;
}

export interface BackoffOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  // mutated in-place so callers can read retry telemetry after the call
  retryStats?: RetryStats;
}

// Jitter prevents thundering herd when multiple runs hit 429 simultaneously
function jitter(ms: number): number {
  return ms * (0.75 + Math.random() * 0.5);
}

// deepagents wraps 429s in MiddlewareError cause chains — traverse to find the HTTP status
function getStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as Record<string, unknown>;
  const direct =
    typeof e['status'] === 'number'
      ? e['status']
      : typeof (e['response'] as Record<string, unknown> | undefined)?.['status'] === 'number'
        ? ((e['response'] as Record<string, unknown>)['status'] as number)
        : undefined;
  return direct ?? getStatus(e['cause']);
}

// Extract the "retry in Xs" hint from nested error messages
function getRetryHintMs(err: unknown): number | undefined {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  // decimal seconds: "retry in 24.709s" — match the integer part only
  const match = /retry in (\d+)/i.exec(msg);
  if (match) return parseInt(match[1], 10) * 1000;
  if (err && typeof err === 'object') {
    const cause = (err as Record<string, unknown>)['cause'];
    return cause ? getRetryHintMs(cause) : undefined;
  }
  return undefined;
}

export async function withBackoff<T>(fn: () => Promise<T>, opts: BackoffOptions = {}): Promise<T> {
  const { maxRetries = 8, baseDelayMs = 1000, maxDelayMs = 90_000 } = opts;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = getStatus(err);
      if (status !== 429 || attempt >= maxRetries) throw err;

      // Honour the API's retry-after hint when present; fall back to exponential backoff
      const hinted = getRetryHintMs(err);
      const expo = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const delay = jitter(hinted !== undefined ? Math.max(hinted, expo) : expo);
      process.stderr.write(
        `  [backoff] 429 on attempt ${attempt + 1} — waiting ${Math.round(delay / 1000)}s\n`,
      );
      if (opts.retryStats) {
        opts.retryStats.retryCount++;
        opts.retryStats.totalWaitMs += delay;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }
  }
}
