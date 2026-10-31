/**
 * A limit on how many things happen at once in the process: PDFs read, pages rendered. A caller
 * takes a place, does its work, and gives the place back; callers beyond the limit wait in the
 * order they asked.
 *
 * A place that a waiter is waiting for is handed on to it without being given up, so that a caller
 * that asks at that moment cannot slip in and take a place the waiter was promised. A waiter whose
 * signal is aborted leaves the line.
 */
export interface Limiter {
  /**
   * A place, and the function that gives it back (calling it twice gives it back once). Rejects
   * with `aborted()` if the signal is aborted before the place comes.
   */
  take(signal?: AbortSignal, aborted?: () => Error): Promise<() => void>;
}

export function createLimiter(limit: number): Limiter {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("A limit is at least one place.");
  let inUse = 0;
  const waiting: Array<{ grant: () => void }> = [];

  const placeFor = (): (() => void) => {
    let given = false;
    return () => {
      if (given) return;
      given = true;
      const next = waiting.shift();
      if (next !== undefined) next.grant();
      else inUse -= 1;
    };
  };

  return {
    take(signal, aborted = () => new Error("The wait for a place was cancelled.")) {
      if (inUse < limit) {
        inUse += 1;
        return Promise.resolve(placeFor());
      }
      return new Promise<() => void>((resolve, reject) => {
        const waiter = {
          grant: () => {
            signal?.removeEventListener("abort", onAbort);
            resolve(placeFor());
          },
        };
        const onAbort = () => {
          const at = waiting.indexOf(waiter);
          if (at >= 0) waiting.splice(at, 1);
          reject(aborted());
        };
        waiting.push(waiter);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    },
  };
}
