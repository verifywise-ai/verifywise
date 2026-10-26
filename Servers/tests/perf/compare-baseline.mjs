/**
 * Baseline comparison helper for the perf-nightly workflow (#4676).
 *
 * Usage: node compare-baseline.mjs <baseline.json> <current.json>
 *
 * Compares per-endpoint p(95) durations between the stored k6 summary and
 * the current run. Emits ::warning:: annotations for any endpoint whose p95
 * regressed by more than REGRESSION_THRESHOLD (default 20%) and prints a
 * markdown table for $GITHUB_STEP_SUMMARY. Never exits non-zero — this step
 * is informational until the baseline policy (see
 * docs/deployment/k6-perf-baselines.md) switches to enforcement.
 */
import { readFileSync, appendFileSync } from "node:fs";

const REGRESSION_THRESHOLD = Number(process.env.REGRESSION_PCT || 20);
const [baselinePath, currentPath] = process.argv.slice(2);

function load(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const baseline = baselinePath && load(baselinePath);
const current = currentPath && load(currentPath);

if (!baseline || !current) {
  console.log("Baseline or current summary missing — skipping comparison.");
  process.exit(0);
}

function p95ByEndpoint(summary) {
  const out = {};
  const metrics = summary.metrics || {};
  for (const [name, metric] of Object.entries(metrics)) {
    const m = name.match(/^http_req_duration\{endpoint:(.+)\}$/);
    if (!m) continue;
    const p95 = metric.values && metric.values["p(95)"];
    if (typeof p95 === "number") out[m[1]] = p95;
  }
  // Also record the un-tagged global p95 as "all".
  const global = metrics.http_req_duration?.values?.["p(95)"];
  if (typeof global === "number") out.all = global;
  return out;
}

const before = p95ByEndpoint(baseline);
const after = p95ByEndpoint(current);

const rows = [
  "| Endpoint | Baseline p95 | Current p95 | Δ | Status |",
  "|----------|-------------:|------------:|---:|:------:|",
];
let regressions = 0;

for (const [endpoint, base] of Object.entries(before)) {
  if (typeof after[endpoint] !== "number") continue;
  const now = after[endpoint];
  const deltaPct = base > 0 ? ((now - base) / base) * 100 : 0;
  const regressed = deltaPct > REGRESSION_THRESHOLD;
  if (regressed) regressions++;
  rows.push(
    `| ${endpoint} | ${base.toFixed(1)}ms | ${now.toFixed(1)}ms | ${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}% | ${regressed ? "⚠️ regression" : "✅"} |`,
  );
  if (regressed) {
    console.log(
      `::warning::p95 regression on '${endpoint}': ${base.toFixed(1)}ms -> ${now.toFixed(1)}ms (${deltaPct.toFixed(1)}% > ${REGRESSION_THRESHOLD}%)`,
    );
  }
}

if (Object.keys(before).length === 0) {
  console.log("No endpoint-tagged metrics in baseline — skipping comparison.");
  process.exit(0);
}

try {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY || "/dev/null",
    `\n## k6 p95 vs baseline\n\n${rows.join("\n")}\n`,
  );
} catch {
  /* summary is best-effort */
}

console.log(`${regressions} endpoint(s) regressed > ${REGRESSION_THRESHOLD}% vs baseline.`);
