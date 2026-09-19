/**
 * Rate-limiter verification suite — wiring.
 *
 * Phases 1 and 2 prove the limiters work and carry the right numbers. Neither would
 * notice if a limiter stopped being mounted: delete `authLimiter` from the
 * `/register` route and every other test in this suite still passes, while the
 * endpoint silently accepts unlimited password guesses.
 *
 * So this file builds the REAL application and walks its router stack, asserting
 * that each protected route still carries the exact limiter instance it is supposed
 * to, and that the global mount ordering app.ts documents still holds.
 *
 * Identity, not shape: handlers are compared by reference against the exported
 * singletons, so a route wired to a look-alike limiter with different numbers fails.
 */

import { beforeAll, describe, expect, it, jest } from "@jest/globals";
import { Application } from "express";
import fs from "fs";
import path from "path";

import { createTestApp } from "../setup";
import * as rateLimiters from "../../../middleware/rateLimit.middleware";

// Building the real app compiles the whole backend through ts-jest.
jest.setTimeout(180_000);

/**
 * Express 5 router internals. There is no public introspection API, and the
 * alternative — inferring limiters from response headers — cannot distinguish two
 * limiters that share a window and limit (authLimiter and tokenRefreshLimiter are
 * both 1000/15min under NODE_ENV=test), so it could not catch them being swapped.
 */
type RouteLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: unknown }>;
  };
};

type AppLayer = RouteLayer & {
  name: string;
  handle: unknown;
  matchers?: Array<(path: string) => { path: string } | false>;
};

/** Every exported limiter, by name, for reverse lookup from a handler reference. */
const LIMITER_NAMES = new Map<unknown, string>(
  Object.entries(rateLimiters)
    .filter(([, value]) => typeof value === "function")
    .map(([name, value]) => [value as unknown, name]),
);

const stackOf = (app: Application): AppLayer[] =>
  (app as unknown as { router: { stack: AppLayer[] } }).router.stack;

/** Index of every app-level layer that is a router mounted at `mountPath`. */
function mountIndexes(app: Application, mountPath: string): number[] {
  return stackOf(app).flatMap((layer, index) => {
    const match = layer.matchers?.[0]?.(mountPath);
    const isRouter = Boolean((layer.handle as { stack?: unknown })?.stack);
    return match && match.path === mountPath && isRouter ? [index] : [];
  });
}

/** Every route defined under `mountPath`, across all routers mounted there. */
function routesUnder(
  app: Application,
  mountPath: string,
): Array<{ method: string; path: string; limiters: string[] }> {
  const routes: Array<{ method: string; path: string; limiters: string[] }> = [];

  for (const index of mountIndexes(app, mountPath)) {
    const router = stackOf(app)[index].handle as { stack: RouteLayer[] };
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const limiters = layer.route.stack
        .map((handler) => LIMITER_NAMES.get(handler.handle))
        .filter((name): name is string => Boolean(name));
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({ method, path: layer.route.path, limiters });
      }
    }
  }

  return routes;
}

/** The limiters wired onto one specific route, or null if the route is missing. */
function limitersOn(
  app: Application,
  mountPath: string,
  method: string,
  routePath: string,
): string[] | null {
  const match = routesUnder(app, mountPath).find(
    (route) => route.method === method && route.path === routePath,
  );
  return match ? match.limiters : null;
}

/**
 * The routes whose protection is the point of the whole exercise. A route removed
 * from this table is a route nobody is checking, so removals belong in review.
 */
const PROTECTED_ROUTES = [
  { mount: "/api/users", method: "post", path: "/register", limiter: "authLimiter" },
  { mount: "/api/users", method: "post", path: "/reset-password", limiter: "authLimiter" },
  { mount: "/api/users", method: "patch", path: "/chng-pass/:id", limiter: "authLimiter" },
  {
    mount: "/api/users",
    method: "post",
    path: "/refresh-token",
    limiter: "tokenRefreshLimiter",
  },
  { mount: "/api/webhooks", method: "post", path: "/github", limiter: "webhookLimiter" },
  {
    mount: "/api/ai-detection",
    method: "post",
    path: "/scans",
    limiter: "aiDetectionScanLimiter",
  },
  {
    mount: "/api/mrm",
    method: "post",
    path: "/models/:externalModelKey/metrics",
    limiter: "mrmIngestionLimiter",
  },
  { mount: "/api/file-manager", method: "post", path: "/", limiter: "fileOperationsLimiter" },
  { mount: "/api/file-manager", method: "get", path: "/:id", limiter: "fileOperationsLimiter" },
  { mount: "/api/users", method: "post", path: "/login", limiter: "loginLimiter" },
  { mount: "/api/users", method: "post", path: "/login-microsoft", limiter: "loginLimiter" },
  {
    mount: "/api/mail",
    method: "post",
    path: "/reset-password",
    limiter: "passwordResetEmailLimiter",
  },
  { mount: "/api/mail", method: "post", path: "/invite", limiter: "inviteEmailLimiter" },
  {
    mount: "/api/invitations",
    method: "post",
    path: "/:id/resend",
    limiter: "invitationResendLimiter",
  },
  {
    mount: "/api/slackWebhooks",
    method: "post",
    path: "/",
    limiter: "slackWebhookCreateLimiter",
  },
  {
    mount: "/api/extensions/slack",
    method: "post",
    path: "/oauth/workspaces",
    limiter: "slackWorkspaceCreateLimiter",
  },
] as const;

describe("rate limiter wiring", () => {
  let app: Application;

  beforeAll(() => {
    app = createTestApp();
  });

  describe("per-route limiters", () => {
    it.each(PROTECTED_ROUTES)(
      "$method $mount$path is guarded by $limiter",
      ({ mount, method, path, limiter }) => {
        const found = limitersOn(app, mount, method, path);

        // A null here means the route itself moved or was renamed — which is not a
        // pass, because the table then guards nothing.
        expect(found).not.toBeNull();
        expect(found).toContain(limiter);
      },
    );

    it("detects an unguarded route, so the assertions above are not vacuous", () => {
      // GET /api/ai-detection/scans deliberately has no limiter (it is a cheap read;
      // only the expensive POST /scans is throttled). If this ever starts reporting a
      // limiter, the detector is matching something it should not and every
      // assertion above has stopped meaning anything.
      expect(limitersOn(app, "/api/ai-detection", "get", "/scans")).toEqual([]);
    });
  });

  it("guards GET /health, which is defined on the app rather than in a router", () => {
    const healthRoute = stackOf(app).find((layer) => layer.route?.path === "/health");
    expect(healthRoute).toBeDefined();

    const limiters = healthRoute!
      .route!.stack.map((handler) => LIMITER_NAMES.get(handler.handle))
      .filter(Boolean);
    expect(limiters).toContain("healthCheckLimiter");
  });

  describe("whole-router coverage", () => {
    it("rate limits every route under /api/file-manager", () => {
      // The intent in fileManager.route.ts is that the entire router is throttled —
      // file I/O is expensive on every verb. Asserting the invariant rather than a
      // list means a new route added without a limiter fails here.
      const routes = routesUnder(app, "/api/file-manager");
      expect(routes.length).toBeGreaterThan(0);

      const unguarded = routes
        .filter((route) => !route.limiters.includes("fileOperationsLimiter"))
        .map((route) => `${route.method.toUpperCase()} ${route.path}`);
      expect(unguarded).toEqual([]);
    });

    it("rate limits every route under /api/webhooks", () => {
      // Webhooks are mounted ahead of the global limiter (see below), so their own
      // limiter is the only ceiling they have.
      const routes = routesUnder(app, "/api/webhooks");
      expect(routes.length).toBeGreaterThan(0);

      const unguarded = routes
        .filter((route) => !route.limiters.includes("webhookLimiter"))
        .map((route) => `${route.method.toUpperCase()} ${route.path}`);
      expect(unguarded).toEqual([]);
    });
  });

  /**
   * Every limiter must come from middleware/rateLimit.middleware.ts.
   *
   * A limiter declared inline in a route file silently opts out of the shared
   * contract: express-rate-limit defaults to legacy `X-RateLimit-*` headers and its
   * own body, so the endpoint stops emitting `RateLimit-*` and stops returning the
   * STATUS_CODE[429] envelope. Six limiters were in exactly that state before this
   * suite existed, and nothing flagged it.
   */
  describe("single source of limiters", () => {
    const sourceFiles = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return ["node_modules", "dist", "coverage", "tests", "__tests__"].includes(entry.name)
            ? []
            : sourceFiles(full);
        }
        return entry.isFile() && full.endsWith(".ts") ? [full] : [];
      });

    it("imports express-rate-limit in exactly one module", () => {
      const root = path.resolve(__dirname, "../../..");
      const importers = sourceFiles(root)
        .filter((file) => /from ["']express-rate-limit["']/.test(fs.readFileSync(file, "utf8")))
        .map((file) => path.relative(root, file));

      expect(importers).toEqual(["middleware/rateLimit.middleware.ts"]);
    });
  });

  /**
   * The global ceiling is positional: it only protects what is mounted after it.
   * app.ts states this ordering in a comment; nothing enforced it.
   */
  describe("global limiter mount ordering", () => {
    const globalIndex = (app: Application) =>
      stackOf(app).findIndex((layer) => layer.handle === rateLimiters.generalApiLimiter);

    it("mounts generalApiLimiter exactly once", () => {
      const mounted = stackOf(app).filter(
        (layer) => layer.handle === rateLimiters.generalApiLimiter,
      );
      expect(mounted).toHaveLength(1);
    });

    it("mounts /api/webhooks BEFORE the global limiter", () => {
      // Deliberate exception: webhook pushes are signature-verified and carry their
      // own limiter, and a busy sender must not eat the shared per-IP API budget.
      const [webhooks] = mountIndexes(app, "/api/webhooks");
      expect(webhooks).toBeGreaterThanOrEqual(0);
      expect(webhooks).toBeLessThan(globalIndex(app));
    });

    it.each(
      [...new Set(PROTECTED_ROUTES.map((route) => route.mount))].filter(
        (mount) => mount !== "/api/webhooks",
      ),
    )("mounts %s AFTER the global limiter", (mount) => {
      const indexes = mountIndexes(app, mount);
      expect(indexes.length).toBeGreaterThan(0);
      for (const index of indexes) {
        expect(index).toBeGreaterThan(globalIndex(app));
      }
    });
  });
});
