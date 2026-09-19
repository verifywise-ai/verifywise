/**
 * Shared scaffolding for the rate-limiter verification suite.
 *
 * These tests drive REAL HTTP requests through the REAL limiter middleware and its
 * store. No database, no Redis, no `createApp()` — the seam under test is
 * middleware + HTTP + store, which is exactly the seam the middleware unit tests
 * mock away.
 */

import express, { Express, NextFunction, Request, Response } from "express";
import http from "http";
import { AddressInfo } from "net";
import supertest from "supertest";
import type { RateLimitRequestHandler } from "express-rate-limit";

/** A listening test app, plus the keep-alive agent its bulk requests reuse. */
export interface LimitedApp {
  app: Express;
  server: http.Server;
  port: number;
  agent: http.Agent;
  close: () => Promise<void>;
}

/**
 * Mounts a single limiter on a bare express app with a trivial 200 handler.
 *
 * `trust proxy` is set to 1 to mirror app.ts:141, which is what makes
 * `X-Forwarded-For` the client identity in tests exactly as it is in production.
 * The literal `1` (rather than `true`) also keeps express-rate-limit's
 * permissive-trust-proxy validation quiet.
 *
 * The server is started once per describe block and reused, so exhausting a
 * 5000-request limiter costs one server and a pool of keep-alive sockets rather
 * than 5000 of each.
 */
export function createLimitedApp(
  limiter: RateLimitRequestHandler,
  preMiddleware?: (req: Request, res: Response, next: NextFunction) => void,
): LimitedApp {
  const app = express();
  app.set("trust proxy", 1);
  if (preMiddleware) app.use(preMiddleware);
  app.use(limiter);
  app.use((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  const server = app.listen(0);
  const agent = new http.Agent({ keepAlive: true, maxSockets: 32 });

  return {
    app,
    server,
    get port() {
      return (server.address() as AddressInfo).port;
    },
    agent,
    close: () =>
      new Promise<void>((resolve) => {
        agent.destroy();
        server.close(() => resolve());
      }),
  };
}

/**
 * Issues one asserted request as `ip`, via X-Forwarded-For (honoured because
 * trust proxy is 1).
 */
export function get(limited: LimitedApp, ip: string, path = "/"): supertest.Test {
  return supertest(limited.server).get(path).set("X-Forwarded-For", ip);
}

/** Issues one asserted request carrying arbitrary extra headers. */
export function getWith(
  limited: LimitedApp,
  headers: Record<string, string>,
  path = "/",
): supertest.Test {
  const req = supertest(limited.server).get(path);
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  return req;
}

/**
 * Fires one bare request over the keep-alive agent and resolves with its status.
 *
 * Used only for bulk consumption, where nothing is asserted about the individual
 * response — supertest opens a fresh socket per request, which exhausts ephemeral
 * ports long before a 5000-request limiter is exhausted.
 */
function fire(limited: LimitedApp, headers: Record<string, string>, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: limited.port, path, method: "GET", headers, agent: limited.agent },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * Consumes `count` requests from a client's budget.
 *
 * Fired in bounded-concurrency batches: these are the requests whose individual
 * responses nothing asserts, so ordering does not matter — only that the store
 * ends up with exactly `count` hits. Boundary requests (the last allowed one, and
 * the one that trips the limit) are always issued sequentially by the caller.
 */
export async function consume(
  limited: LimitedApp,
  headers: Record<string, string>,
  count: number,
  path = "/",
): Promise<void> {
  const BATCH = 32;
  for (let sent = 0; sent < count; sent += BATCH) {
    const size = Math.min(BATCH, count - sent);
    await Promise.all(Array.from({ length: size }, () => fire(limited, headers, path)));
  }
}

/** Consumes `count` requests from `ip`'s budget. */
export const consumeAs = (limited: LimitedApp, ip: string, count: number, path = "/") =>
  consume(limited, { "x-forwarded-for": ip }, count, path);

/** windowMinutes → the seconds value express-rate-limit puts in RateLimit-Policy. */
export const windowSeconds = (windowMinutes: number): number => windowMinutes * 60;

/** windowMinutes → milliseconds, for advancing the clock past a window. */
export const windowMs = (windowMinutes: number): number => windowMinutes * 60 * 1000;

/**
 * Asserts the draft-6 standard headers on an allowed response.
 *
 * `standardHeaders: true` resolves to draft-6 in express-rate-limit v8, so the
 * contract is RateLimit-Policy / -Limit / -Remaining / -Reset. There is no combined
 * `RateLimit` header (that is draft-7/8) and no `X-RateLimit-*` (legacyHeaders is
 * off), and Retry-After appears only on the limited response.
 */
export function expectAllowedHeaders(
  res: supertest.Response,
  expected: { limit: number; remaining: number; windowMinutes: number },
): void {
  const seconds = windowSeconds(expected.windowMinutes);

  expect(res.status).toBe(200);
  expect(res.headers["ratelimit-policy"]).toBe(`${expected.limit};w=${seconds}`);
  expect(res.headers["ratelimit-limit"]).toBe(String(expected.limit));
  expect(res.headers["ratelimit-remaining"]).toBe(String(expected.remaining));

  const reset = Number(res.headers["ratelimit-reset"]);
  expect(Number.isNaN(reset)).toBe(false);
  expect(reset).toBeGreaterThan(0);
  expect(reset).toBeLessThanOrEqual(seconds);

  // Retry-After is set only when the request is actually limited.
  expect(res.headers["retry-after"]).toBeUndefined();
  // legacyHeaders: false — the draft-6 headers are the whole contract.
  expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
  expect(res.headers["x-ratelimit-remaining"]).toBeUndefined();
  expect(res.headers["x-ratelimit-reset"]).toBeUndefined();
}

/**
 * Asserts the 429 response: the canonical STATUS_CODE[429] envelope, an exhausted
 * budget, and a Retry-After bounded by the window.
 */
export function expectLimitedResponse(
  res: supertest.Response,
  expected: { limit: number; windowMinutes: number; message: string },
): void {
  const seconds = windowSeconds(expected.windowMinutes);

  expect(res.status).toBe(429);
  expect(res.body).toEqual({ message: "Too Many Requests", data: expected.message });
  expect(res.headers["ratelimit-limit"]).toBe(String(expected.limit));
  expect(res.headers["ratelimit-remaining"]).toBe("0");

  const retryAfter = Number(res.headers["retry-after"]);
  expect(Number.isNaN(retryAfter)).toBe(false);
  expect(retryAfter).toBeGreaterThan(0);
  expect(retryAfter).toBeLessThanOrEqual(seconds);
}

/**
 * Freezes Date (and only Date) so a 15-minute window can be rolled in a test.
 *
 * MemoryStore.increment resets a client purely on `resetTime <= Date.now()`, so
 * faking Date is sufficient. Faking the timers as well would hang supertest's
 * sockets, hence the doNotFake list.
 */
export function freezeClock(): void {
  jest.useFakeTimers({
    doNotFake: [
      "setTimeout",
      "setInterval",
      "setImmediate",
      "clearTimeout",
      "clearInterval",
      "clearImmediate",
      "nextTick",
      "queueMicrotask",
      "hrtime",
      "performance",
    ],
  });
}

/** Moves the frozen clock forward past a limiter's window. */
export function advancePastWindow(windowMinutes: number): void {
  jest.setSystemTime(Date.now() + windowMs(windowMinutes) + 1000);
}
