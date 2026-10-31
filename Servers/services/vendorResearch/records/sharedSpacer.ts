/**
 * The spacer of spacer.ts for all the workers of the application at once (M2). The NVD's limit of
 * 5 requests in 30 seconds without a key is per client, and the SEC's 10 a second is for all of a
 * user's machines together, so the starts of a window are kept in Redis, not in a process. One
 * script reads the clock of Redis, drops the starts that have left the window, takes the turn the
 * spacer of one process would take and keeps it, all at once: two workers never take the same
 * place and never disagree on the time.
 *
 * A turn is refused, and the service is then busy rather than down (records/index.ts), when it is
 * further off than the most it may wait, when Redis does not answer within that time or before
 * the run stops, when Redis fails, and when the application's client is not ready: that client
 * queues commands for ever while it reconnects, and the turns it would take on reconnecting would
 * be used by nobody.
 */
import { type Sleep, type Spacer, type SpacerLimits, sleepUnlessAborted } from "./spacer";

/** The window of the requests to the NVD, which every worker shares. */
export const NVD_SPACER_KEY = "vrdb:spacer:nvd";
/** The window of the requests to the SEC (Q4). */
export const SEC_SPACER_KEY = "vrdb:spacer:sec";
/** Five requests a second, half of what the SEC allows, and a wait of two seconds at most. */
export const SEC_LIMITS: SpacerLimits = { limit: 5, windowMs: 1_000, maxWaitMs: 2_000 };

/**
 * Takes a turn in the window of KEYS[1], a sorted set of the starts in milliseconds of the clock of
 * Redis; KEYS[2] numbers the starts, so that two of one millisecond are two. ARGV: the limit, the
 * window and the most a turn may wait, in milliseconds. It answers the wait, or -1 for a turn too
 * far off, which takes no place. Both keys are kept until the newest start has left the window.
 */
export const SPACER_SCRIPT = `
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local maxWait = tonumber(ARGV[3])
local time = redis.call("TIME")
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now - window)
local count = redis.call("ZCARD", KEYS[1])
local start = now
if count >= limit then
  local first = redis.call("ZRANGE", KEYS[1], count - limit, count - limit, "WITHSCORES")
  local opens = tonumber(first[2]) + window
  if opens > start then start = opens end
end
local wait = start - now
if wait > maxWait then return -1 end
redis.call("ZADD", KEYS[1], start, start .. ":" .. redis.call("INCR", KEYS[2]))
redis.call("PEXPIRE", KEYS[1], wait + window)
redis.call("PEXPIRE", KEYS[2], wait + window)
return wait
`;

/** The part of a Redis client that the spacer uses (ioredis). */
export interface SpacerRedis {
  eval(script: string, numKeys: number, ...keysAndArgs: Array<string | number>): Promise<unknown>;
}

/**
 * The application's client (database/redis.ts), loaded on the first turn, so that a process that
 * never asks for one opens no connection. It hands no command to a client that is not ready.
 */
export const applicationRedis: SpacerRedis = {
  async eval(script, numKeys, ...keysAndArgs) {
    const { default: redis } = await import("../../../database/redis");
    if (redis.status !== "ready") throw new Error("Redis is not ready");
    return redis.eval(script, numKeys, ...keysAndArgs);
  },
};

/** What Redis answered, or undefined when it failed, or did not answer within `ms` or before the signal. */
function answerWithin(work: Promise<unknown>, ms: number, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve) => {
    const done = (value: unknown) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      resolve(value);
    };
    const stop = () => done(undefined);
    const timer = setTimeout(stop, ms);
    signal.addEventListener("abort", stop, { once: true });
    work.then(done, stop);
  });
}

/** A spacer of `limits` whose window, `key` in Redis, every worker shares. */
export function createSharedSpacer(
  { limit, windowMs, maxWaitMs }: SpacerLimits,
  deps: { redis: SpacerRedis; key: string; sleep?: Sleep },
): Spacer {
  const { redis, key } = deps;
  const sleep = deps.sleep ?? sleepUnlessAborted;
  return async (signal) => {
    if (signal.aborted) return false;
    const asked = Promise.resolve().then(() =>
      redis.eval(SPACER_SCRIPT, 2, key, `${key}:seq`, limit, windowMs, maxWaitMs),
    );
    const wait = await answerWithin(asked, maxWaitMs, signal);
    if (typeof wait !== "number" || !Number.isInteger(wait) || wait < 0 || wait > maxWaitMs) {
      return false;
    }
    if (wait > 0) await sleep(wait, signal);
    return true;
  };
}
