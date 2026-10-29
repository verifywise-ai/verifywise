// Servers/services/intakeLiveChecks/deadline.ts
// Races a promise against a timer, for calls that must answer in bounded time.

export const TIMED_OUT = Symbol("timed out");

/** The work's result, or TIMED_OUT after `ms`. The work itself is not cancelled. */
export async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
