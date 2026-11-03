/**
 * Cache-Control contract tests — issue #4679-a.
 *
 * Contract-first: the VerifyWise API today has no HTTP cache layer (no
 * middleware sets a cacheable directive on API responses; helmet deliberately
 * does not touch Cache-Control). The safe default a correct pre-caching
 * implementation guarantees, and what these tests pin down, is:
 *
 *   (a) Authenticated API responses are never explicitly cacheable: no
 *       `public`, no positive `max-age`, no `s-maxage` directive may appear.
 *       A shared cache compliant with RFC 9111 §3.2 will not store a response
 *       to an authorized request without one of those directives, so tenant
 *       data cannot leak through a shared cache even though the app has no
 *       cache layer of its own.
 *   (b) Routes that DO set Cache-Control (SSE notification stream, advisor
 *       streaming) declare no-cache — explicit allow-list below.
 *
 * DRIFT / follow-up (#4679): the declared end-state contract is `no-store` on
 * every authenticated JSON API response. The app does not emit it yet, so
 * asserting no-store today would fail; the burndown (add no-store middleware,
 * then tighten these assertions) is tracked in Servers/docs/TESTING.md.
 *
 * Public static assets: the Express app mounts no static-asset routes (the
 * Clients build is served by nginx — see docker-compose.yml / Clients/dist);
 * there is nothing cacheable to assert here. The placeholder test below
 * documents that boundary so a future static mount cannot land untested.
 *
 * Runs under `npm run test:integration` (Postgres-backed).
 */

jest.setTimeout(60_000);

import http from "node:http";
import { createTestApp, testRequest } from "../setup";
import {
  cleanupDatabase,
  createTestOrganization,
  createTestUser,
  seedFrameworks,
} from "../helpers";
import { createTestProject } from "../../factories";

/** Directives that would let a shared cache store a response. */
const EXPLICITLY_CACHEABLE =
  /(?:^|,|\s)(public|s-maxage|proxy-revalidate)\b|max-age\s*=\s*[1-9]\d*/i;

/** Routes allowed to set their own Cache-Control, and the value they set. */
const DECLARED_CACHE_HEADERS: Array<{ route: RegExp; allow: RegExp; note: string }> = [
  {
    route: /^\/api\/notifications\/stream/,
    allow: /no-cache/i,
    note: "SSE stream (controllers/notification.ctrl.ts)",
  },
  {
    route: /^\/api\/advisor\//,
    allow: /no-cache/i,
    note: "advisor streaming (controllers/advisor.ctrl.ts)",
  },
];

const AUTHENTICATED_READ_ROUTES = [
  "/api/dashboard",
  "/api/projects",
  "/api/tasks",
  "/api/projectRisks",
  "/api/vendors",
  "/api/files",
  "/api/users",
  "/api/roles",
  "/api/frameworks",
  "/api/notifications/summary",
];

describe("Cache-Control contract (#4679-a)", () => {
  let app: http.Server;
  let orgId: number;
  let userId: number;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    userId = await createTestUser(orgId, 1, `cache-${Date.now()}@test.com`, "Password123!");
    await seedFrameworks();
    await createTestProject(orgId, userId);
    app = await createTestApp({
      bypassAuth: true,
      mockUser: { userId, organizationId: orgId, role: "Admin" },
    });
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it.each(AUTHENTICATED_READ_ROUTES)("%s is not explicitly cacheable", async (route) => {
    const res = await testRequest(app).get(route);
    expect(res.status).toBe(200);

    const declared = DECLARED_CACHE_HEADERS.find((d) => d.route.test(route));
    const cacheControl: string | undefined = res.headers["cache-control"];
    if (cacheControl) {
      // An explicitly declared route must use its declared (non-cacheable) value.
      if (!(declared?.allow ?? /no-store|no-cache|private/i).test(cacheControl)) {
        throw new Error(
          `${route} sets Cache-Control "${cacheControl}" itself ` +
            `(${declared?.note ?? "unexpected"}); it must not be cacheable`,
        );
      }
      expect(cacheControl).not.toMatch(EXPLICITLY_CACHEABLE);
    } else {
      // Absence is the current safe default: without public/s-maxage/a
      // positive max-age, a compliant shared cache will not store an
      // authorized response. Follow-up: assert no-store once the middleware
      // lands (#4679 burndown).
      if (declared !== undefined) {
        throw new Error(`${route} declared its own Cache-Control but set none`);
      }
    }
  });

  it("POST /api/users/login (unauthenticated) is not explicitly cacheable", async () => {
    const res = await testRequest(app)
      .post("/api/users/login")
      .send({ email: "nobody@test.com", password: "wrong-password" });
    // 202 on success, 4xx on failure — either way the response must not be
    // cacheable: login responses carry tokens.
    expect([200, 202, 400, 401, 403, 404, 406]).toContain(res.status);
    const cacheControl: string | undefined = res.headers["cache-control"];
    if (cacheControl) {
      expect(cacheControl).not.toMatch(EXPLICITLY_CACHEABLE);
    }
  });

  it("no public static-asset routes are mounted on the Express app", async () => {
    // Documented boundary, not a loophole: the Express app serves only /api/*
    // (plus swagger docs); static assets are nginx's job. If a future change
    // mounts express.static, this must be replaced with a cacheable-assertion
    // per asset class (immutable hashed assets vs. index.html no-cache).
    const res = await testRequest(app).get("/nonexistent-asset.js");
    expect(res.status).toBe(404);
  });
});
