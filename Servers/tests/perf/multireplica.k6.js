/**
 * Multi-replica scenario test (k6) — issue #4677.
 *
 * Run against docker-compose.multireplica.yml (see
 * docs/deployment/multi-replica-scaling.md for the full walkthrough):
 *
 *   docker compose -f docker-compose.multireplica.yml --env-file .env up -d
 *   k6 run -e BASE_URL=http://localhost:8080 \
 *          -e PERF_EMAIL=... -e PERF_PASSWORD=... \
 *          Servers/tests/perf/multireplica.k6.js
 *
 * BASE_URL must point at the nginx load balancer, not a backend container.
 *
 * What this verifies:
 *
 *  1. REQUEST DISTRIBUTION — the nginx upstream (least_conn; equivalent to
 *     round-robin for this single-client test) actually spreads
 *     requests across backend-1 and backend-2. The compose stack's nginx
 *     adds an `X-Backend` response header with the upstream address (the
 *     application has no hostname-revealing endpoint of its own, and we may
 *     not add one just for this test). We collect the header across requests
 *     and require >= 2 distinct upstreams.
 *
 *  2. CROSS-REPLICA RATE-LIMIT BEHAVIOR — Servers/middleware/rateLimit.middleware.ts
 *     configures express-rate-limit WITHOUT a store, i.e. the default
 *     in-process MemoryStore. Limits are therefore PER REPLICA, not shared:
 *
 *       EXPECTED (current, in-memory store):
 *         generalApiLimiter = 300 req/min/IP PER REPLICA. With 2 replicas
 *         and least_conn/round-robin distribution, a client can sustain
 *         ~600 req/min before seeing
 *         any 429. Sending 500 rapid requests should produce ZERO 429s
 *         (~250 per replica, under each replica's own 300 limit).
 *
 *       IF A REDIS STORE WERE WIRED (express-rate-limit RedisStore):
 *         the budget would be SHARED across replicas: 500 requests against a
 *         300/min limit would start yielding 429 partway through. If this
 *         test ever observes 429s during the 500-request phase, that means
 *         the limiter became shared — update the expectations here and in
 *         docs/deployment/multi-replica-scaling.md.
 *
 *     This is a documented limitation, not silently accepted: horizontal
 *     scaling multiplies the effective abuse budget per replica. The
 *     follow-up is to back the limiters with Redis (Redis is already a
 *     dependency of this stack) and flip this test's expectations.
 *
 *  3. NO LOCAL IN-PROCESS STATE ASSUMPTIONS — every request in this script
 *     goes through the LB with no affinity/cookies, so any feature that
 *     silently depended on per-process state (sessions, caches, limiter
 *     counters) breaks visibly here. Auth is stateless JWT (Bearer header),
 *     which is why the login token works against ANY replica.
 */

import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const EMAIL = __ENV.PERF_EMAIL || "admin@verifywise-test.com";
const PASSWORD = __ENV.PERF_PASSWORD || "TestAdmin!Str0ng";

// Deliberately just under 2 x 300 (two replicas x generalApiLimiter prod cap).
const RATE_LIMIT_PROBE_REQUESTS = 500;

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    // Report-only: this scenario is about observed behavior, not SLAs.
    checks: ["rate>0.99"],
  },
};

function login() {
  const res = http.post(
    `${BASE_URL}/api/users/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" } },
  );
  const body = res.json() || {};
  const token = (body.data && body.data.token) || body.token;
  if (res.status !== 202 || !token) {
    throw new Error(`login through LB failed: HTTP ${res.status} ${res.body}`);
  }
  return token;
}

export default function () {
  const token = login();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // --- 1. Request distribution across replicas ---------------------------
  const upstreams = new Set();
  const DISTRIBUTION_SAMPLES = 40;
  for (let i = 0; i < DISTRIBUTION_SAMPLES; i++) {
    const res = http.get(`${BASE_URL}/api/projects/`, { headers });
    const upstream = res.headers["X-Backend"] || res.headers["x-backend"];
    if (upstream) upstreams.add(upstream);
    check(res, { "distribution probe 2xx": (r) => r.status === 200 });
  }
  console.log(`Observed ${upstreams.size} upstream(s): ${[...upstreams].join(", ")}`);
  check(upstreams.size, {
    "requests reached >= 2 distinct replicas": (n) => n >= 2,
  });

  // --- 2. Cross-replica rate-limit behavior ------------------------------
  let ok = 0;
  let throttled = 0;
  for (let i = 0; i < RATE_LIMIT_PROBE_REQUESTS; i++) {
    const res = http.get(`${BASE_URL}/api/projects/`, { headers });
    if (res.status === 429) throttled++;
    else if (res.status === 200) ok++;
  }
  console.log(
    `Rate probe: ${RATE_LIMIT_PROBE_REQUESTS} requests -> ${ok} x 200, ${throttled} x 429`,
  );

  // Current expectation (per-replica in-memory limiter): every request fits
  // under each replica's own 300/min budget, so no 429s. See header comment
  // for what a Redis-backed shared store would change.
  check(throttled, {
    "no 429s below per-replica budgets (in-memory store)": (t) => t === 0,
  });
  check(ok, {
    "all probe requests succeeded": (n) => n === RATE_LIMIT_PROBE_REQUESTS,
  });
}
