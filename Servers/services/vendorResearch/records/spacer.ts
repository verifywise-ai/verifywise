/**
 * Keeps the requests of a process to a service within its limit. The NVD allows 5 requests in a
 * rolling 30 seconds without a key and may block a client that goes on past it, so at most `limit`
 * requests start in any window of `windowMs`; the others wait for their turn, and a request that
 * would wait longer than `maxWaitMs` is not made. The turn is taken before anything is awaited, so
 * requests made at once get turns in order.
 */
export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

export const sleepUnlessAborted: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

/** Resolves true when the turn came, and false when it is too far off to wait for. */
export type Spacer = (signal: AbortSignal) => Promise<boolean>;

export interface SpacerLimits {
  limit: number;
  windowMs: number;
  maxWaitMs: number;
}

export function createSpacer(
  { limit, windowMs, maxWaitMs }: SpacerLimits,
  now: () => number = Date.now,
  sleep: Sleep = sleepUnlessAborted,
): Spacer {
  /** When the requests that count in the window start (some may be in the future), in order. */
  const starts: number[] = [];
  return async (signal) => {
    const current = now();
    while (starts.length > 0 && starts[0] <= current - windowMs) starts.shift();
    const opens = starts.length >= limit ? starts[starts.length - limit] + windowMs : 0;
    const start = Math.max(current, opens);
    if (start - current > maxWaitMs) return false;
    starts.push(start);
    if (start > current) await sleep(start - current, signal);
    return true;
  };
}
