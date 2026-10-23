/**
 * VerifyWise API performance smoke suite (k6).
 *
 * Covers the hot read paths a real session exercises (route inventory per
 * Servers/middleware/requestMetrics.middleware.ts and Servers/routes/):
 *
 *   POST /api/users/login          auth (token source for everything else)
 *   GET  /api/projects/            project list
 *   GET  /api/dashboard/           dashboard aggregation
 *   GET  /api/reporting/sections   reporting
 *   GET  /api/file-manager/        file list
 *   GET  /api/tasks/               task list
 *
 * Run (against a running backend, e.g. the perf-nightly workflow):
 *
 *   k6 run -e BASE_URL=http://localhost:3000 \
 *          -e PERF_EMAIL=admin@verifywise-test.com \
 *          -e PERF_PASSWORD=TestAdmin!Str0ng \
 *          Servers/tests/perf/api.k6.js
 *
 * Thresholds are p95-oriented and per-endpoint (via request tags). Baseline
 * policy: while this suite is REPORT-ONLY (#4676), threshold breaches must
 * not fail CI; once baselines mature, breaches >20% over the stored baseline
 * become blocking (see docs/deployment/k6-perf-baselines.md).
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const EMAIL = __ENV.PERF_EMAIL || "admin@verifywise-test.com";
const PASSWORD = __ENV.PERF_PASSWORD || "TestAdmin!Str0ng";

export const options = {
  stages: [
    // Gentle ramp: warm the pool, then a 2-minute sustained load, then drain.
    { duration: "30s", target: 10 },
    { duration: "2m", target: 25 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    // Global ceiling; individual endpoints get their own budgets below.
    http_req_duration: ["p(95)<1500"],
    http_req_failed: ["rate<0.05"],
    "http_req_duration{endpoint:projects}": ["p(95)<1000"],
    "http_req_duration{endpoint:dashboard}": ["p(95)<1500"],
    "http_req_duration{endpoint:reporting}": ["p(95)<1000"],
    "http_req_duration{endpoint:files}": ["p(95)<1000"],
    "http_req_duration{endpoint:tasks}": ["p(95)<1000"],
  },
};

function login() {
  const res = http.post(
    `${BASE_URL}/api/users/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    {
      headers: { "Content-Type": "application/json" },
      tags: { endpoint: "login" },
    },
  );
  // Envelope per Servers/utils/statusCode.utils.ts: { message, data: { token } }
  const body = res.json() || {};
  const token = (body.data && body.data.token) || body.token;
  if (res.status !== 202 || !token) {
    throw new Error(`login failed: HTTP ${res.status} ${res.body}`);
  }
  return token;
}

export function setup() {
  return { token: login() };
}

export default function (data) {
  const authHeaders = {
    headers: {
      Authorization: `Bearer ${data.token}`,
      "Content-Type": "application/json",
    },
  };

  group("authenticated read paths", () => {
    // Weighted toward project list / dashboard — the pages users land on.
    const picks = [
      ["GET", "/api/projects/", "projects", 3],
      ["GET", "/api/dashboard/", "dashboard", 3],
      ["GET", "/api/reporting/sections", "reporting", 1],
      ["GET", "/api/file-manager/", "files", 2],
      ["GET", "/api/tasks/", "tasks", 1],
    ];
    const total = picks.reduce((s, p) => s + p[3], 0);
    let roll = Math.random() * total;
    for (const [method, path, endpoint, weight] of picks) {
      roll -= weight;
      if (roll <= 0) {
        const res = http.request(method, `${BASE_URL}${path}`, null, {
          ...authHeaders,
          tags: { endpoint },
        });
        check(res, { "is 2xx": (r) => r.status >= 200 && r.status < 300 });
        break;
      }
    }
  });

  sleep(0.5 + Math.random());
}

/**
 * Emit a machine-readable summary JSON (consumed by the perf-nightly
 * workflow's baseline comparison and uploaded as an artifact) while keeping
 * the human-readable end-of-test summary on stdout.
 */
export function handleSummary(data) {
  const fs = require("fs");
  const outPath = __ENV.K6_SUMMARY_PATH || "k6-summary.json";
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  return { stdout: textSummary(data, { indent: " ", enableColors: true }) };
}
