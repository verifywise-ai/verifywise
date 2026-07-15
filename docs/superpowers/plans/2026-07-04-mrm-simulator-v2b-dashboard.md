# MRM simulator v2b — live web dashboard — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a `sim dashboard` command that starts a local Node HTTP+WebSocket server, drives the simulation, and streams computed metrics/breaches/push-results to a VerifyWise-styled vanilla-JS page in real time.

**Architecture:** A pure orchestration `runner` (reuses v2a `loadConfig`/`runSetup`/`computeMetrics`/`ingestClient`) emits typed events via an injected `emit()`. A thin `server` static-serves `public/` and broadcasts those events over WebSocket, buffering them for late-joining browsers. The frontend renders four panels from the event stream.

**Tech Stack:** TypeScript (tsx, vitest), Node built-in `http`/`fs`, the `ws` WebSocket library; vanilla HTML/CSS/JS with Chart.js from CDN.

## Global Constraints

- All work stays under `tools/mrm-simulator/`. No changes to `Servers/`, `Clients/`, the MRM feature, or the v2a compute/config/ingest code (reused untouched).
- No frontend framework or build step: vanilla HTML/CSS/JS, Chart.js from a CDN `<script>`.
- One new runtime dependency: `ws`. HTTP static-serving uses Node built-in `http` + `fs`. No Express.
- The runner is pure orchestration: it takes an injected `emit(event: DashboardEvent) => void`; it does not import `http`/`ws`. This is what makes it unit-testable.
- Event types are exactly: `run_started`, `metric`, `breach`, `push`, `run_done`, `error` (shapes in Task 1).
- `assertSafeTarget(cfg)` (from v2a `config.ts`) runs before any push; refuses non-localhost without `--i-know-what-im-doing`.
- VerifyWise design tokens: primary `#13715B`, border `#d0d5dd`, 4px radius, Geist/Inter. Status semantics: green healthy / amber warning / red breach.
- Browser auto-open is best-effort and non-fatal; the URL is always printed.

## Reused v2a interfaces (do not modify)

- `loadConfig(path?): FleetModel[]` — from `src/configLoader.ts`.
- `runSetup(cfg: SimConfig): Promise<{ token: string; models: Record<string, number>; findings: Finding[] }>` — from `src/setup.ts`.
- `computeMetrics(dataset: string, period: string, metrics: string[], segmentCol?: string): ComputeResult` where `ComputeResult = { psi?, auc?, gini?, ks?, fairness?: Record<string, Record<string, number>> }` — from `src/computeClient.ts`.
- `class IngestClient { constructor(cfg, token); pushBatch(externalKey: string, points: MetricPoint[]): Promise<IngestResultPoint[]> }` — from `src/ingestClient.ts`.
- `generatePoints(model: FleetModel, dayIndex: number, date: Date): MetricPoint[]` — from `src/engine.ts` (compute-backed; use it to build the points to push).
- Types: `FleetModel { externalKey, name, provider, tier, materialityDrivers, dataset, segmentCol?, metricKeys, thresholds }`, `ThresholdSpec { metric, op, value_num, value_lo, value_hi, severity, breach_action, segment, window }`, `IngestResultPoint { metric, at, status, pointId, threshold? }`, `SimConfig`, `MetricPoint`.
- `loadConfig`/`readCache`/`writeCache`/`assertSafeTarget` from `src/config.ts`.

---

## File structure

```
tools/mrm-simulator/
  src/dashboard/
    events.ts        # DashboardEvent union type + factory helpers
    runner.ts        # runDashboardSimulation(deps, opts, emit) — pure orchestration
    runner.test.ts
    server.ts        # startDashboardServer(cfg, opts) — http static + ws broadcast
  public/
    index.html       # four-panel layout, loads Chart.js from CDN + app.js
    style.css        # VerifyWise tokens + card/chip/feed/chart styles
    app.js           # WS client, in-memory fleet state, per-panel render
  src/cli.ts         # add the `dashboard` command
  README.md          # dashboard usage
```

---

### Task 1: Event types + runner (TDD, the testable core)

**Files:**
- Create: `tools/mrm-simulator/src/dashboard/events.ts`
- Create: `tools/mrm-simulator/src/dashboard/runner.ts`
- Test: `tools/mrm-simulator/src/dashboard/runner.test.ts`

**Interfaces:**
- Produces:
  - `events.ts`: `type DashboardEvent = RunStarted | Metric | Breach | Push | RunDone | ErrorEvent` (exact shapes below).
  - `runner.ts`: `runDashboardSimulation(deps: RunnerDeps, opts: RunnerOpts, emit: (e: DashboardEvent) => void): Promise<void>` where `RunnerDeps = { loadConfig, runSetup, makeIngestClient, computeMetrics }` (injected for testability) and `RunnerOpts = { cfg: SimConfig; startDate: Date; days: number }`.

- [ ] **Step 1: Write events.ts**

```typescript
import { ThresholdSpec } from "../types.js";

export interface RunStarted {
  type: "run_started";
  target: string;
  startDate: string; // YYYY-MM-DD
  days: number;
  models: {
    externalKey: string;
    name: string;
    tier: string;
    metrics: string[];
    thresholds: ThresholdSpec[];
  }[];
}

export interface Metric {
  type: "metric";
  externalKey: string;
  period: string; // YYYY-MM-DD
  metric: string;
  value: number;
  segment: string;
  status: "ok" | "warn" | "breach" | "no_threshold";
  threshold: ThresholdSpec | null;
}

export interface Breach {
  type: "breach";
  externalKey: string;
  period: string;
  metric: string;
  value: number;
  severity: string;
  flagged: boolean; // true when breach_action is notify_flag_revalidation
}

export interface Push {
  type: "push";
  externalKey: string;
  period: string;
  accepted: number;
  results: { metric: string; status: string }[];
}

export interface RunDone {
  type: "run_done";
  totals: { computed: number; pushed: number; accepted: number; breaches: number };
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type DashboardEvent = RunStarted | Metric | Breach | Push | RunDone | ErrorEvent;
```

- [ ] **Step 2: Write the failing test**

Create `runner.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { runDashboardSimulation, RunnerDeps } from "./runner";
import { DashboardEvent } from "./events";
import { FleetModel } from "../types";

const model: FleetModel = {
  externalKey: "credit-scoring-v3",
  name: "Credit scoring v3",
  provider: "in-house",
  tier: "1",
  materialityDrivers: "x",
  dataset: "credit-scoring.csv",
  metricKeys: ["psi"],
  thresholds: [
    { metric: "psi", op: "gt", value_num: 0.2, value_lo: null, value_hi: null, severity: "high", breach_action: "notify_flag_revalidation", segment: null, window: null },
  ],
};

const makeDeps = (): RunnerDeps => ({
  loadConfig: () => [model],
  runSetup: vi.fn(async () => ({ token: "mrm_x", models: { "credit-scoring-v3": 5 }, findings: [] })),
  makeIngestClient: () => ({
    pushBatch: vi.fn(async (_key: string, points: any[]) =>
      points.map((p) => ({ metric: p.metric, at: p.at, status: p.value > 0.2 ? "breach" : "ok", pointId: 1 })),
    ),
  }),
  // day 0 → psi 0.1 (ok); day 1 → psi 0.25 (breach)
  computeMetrics: (_ds: string, period: string) => ({ psi: period.endsWith("02") ? 0.25 : 0.1 }),
});

describe("runDashboardSimulation", () => {
  it("emits run_started, metrics, a breach, pushes, and run_done", async () => {
    const events: DashboardEvent[] = [];
    await runDashboardSimulation(
      makeDeps(),
      { cfg: { baseUrl: "http://localhost:3000", email: "e", password: "p", allowRemote: false }, startDate: new Date("2026-06-01T00:00:00Z"), days: 2 },
      (e) => events.push(e),
    );
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("run_started");
    expect(types.at(-1)).toBe("run_done");
    expect(types).toContain("metric");
    expect(types).toContain("push");
    const breach = events.find((e) => e.type === "breach");
    expect(breach).toBeTruthy();
    expect((breach as any).externalKey).toBe("credit-scoring-v3");
    expect((breach as any).flagged).toBe(true);
    const done = events.find((e) => e.type === "run_done") as any;
    expect(done.totals.breaches).toBe(1);
    expect(done.totals.computed).toBeGreaterThan(0);
  });

  it("emits an error event and stops when compute throws", async () => {
    const deps = makeDeps();
    deps.computeMetrics = () => { throw new Error("boom for credit-scoring-v3"); };
    const events: DashboardEvent[] = [];
    await runDashboardSimulation(
      deps,
      { cfg: { baseUrl: "http://localhost:3000", email: "e", password: "p", allowRemote: false }, startDate: new Date("2026-06-01T00:00:00Z"), days: 2 },
      (e) => events.push(e),
    );
    expect(events.some((e) => e.type === "error")).toBe(true);
    expect(events.some((e) => e.type === "run_done")).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd tools/mrm-simulator && npx vitest run src/dashboard/runner.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement runner.ts**

```typescript
import { SimConfig, FleetModel, MetricPoint, IngestResultPoint, Finding } from "../types.js";
import { ComputeResult } from "../computeClient.js";
import { DashboardEvent } from "./events.js";

export interface IngestLike {
  pushBatch(externalKey: string, points: MetricPoint[]): Promise<IngestResultPoint[]>;
}

export interface RunnerDeps {
  loadConfig: () => FleetModel[];
  runSetup: (cfg: SimConfig) => Promise<{ token: string; models: Record<string, number>; findings: Finding[] }>;
  makeIngestClient: (cfg: SimConfig, token: string) => IngestLike;
  computeMetrics: (dataset: string, period: string, metrics: string[], segmentCol?: string) => ComputeResult;
}

export interface RunnerOpts {
  cfg: SimConfig;
  startDate: Date;
  days: number;
}

// Segments a model reports for a metric, from its segmented thresholds.
const segmentsFor = (model: FleetModel, metric: string): string[] => {
  const segs = model.thresholds.filter((t) => t.metric === metric && t.segment).map((t) => t.segment as string);
  return [...new Set(segs)];
};

// Evaluate a value against a threshold spec, mirroring the server engine.
const evalStatus = (
  value: number,
  t: FleetModel["thresholds"][number] | undefined,
): { status: "ok" | "warn" | "breach" | "no_threshold"; breached: boolean } => {
  if (!t) return { status: "no_threshold", breached: false };
  let breached = false;
  if (t.op === "gt") breached = value > (t.value_num ?? 0);
  else if (t.op === "gte") breached = value >= (t.value_num ?? 0);
  else if (t.op === "lt") breached = value < (t.value_num ?? 0);
  else if (t.op === "lte") breached = value <= (t.value_num ?? 0);
  else if (t.op === "outside") breached = value < (t.value_lo ?? 0) || value > (t.value_hi ?? 0);
  if (!breached) return { status: "ok", breached: false };
  return { status: t.severity === "warn" ? "warn" : "breach", breached: true };
};

export const runDashboardSimulation = async (
  deps: RunnerDeps,
  opts: RunnerOpts,
  emit: (e: DashboardEvent) => void,
): Promise<void> => {
  const totals = { computed: 0, pushed: 0, accepted: 0, breaches: 0 };
  try {
    const fleet = deps.loadConfig();
    emit({
      type: "run_started",
      target: opts.cfg.baseUrl,
      startDate: opts.startDate.toISOString().slice(0, 10),
      days: opts.days,
      models: fleet.map((m) => ({
        externalKey: m.externalKey,
        name: m.name,
        tier: m.tier,
        metrics: m.metricKeys,
        thresholds: m.thresholds,
      })),
    });

    const setup = await deps.runSetup(opts.cfg);
    const client = deps.makeIngestClient(opts.cfg, setup.token);

    for (let d = 0; d < opts.days; d++) {
      const date = new Date(opts.startDate.getTime() + d * 86_400_000);
      const period = date.toISOString().slice(0, 10);
      const at = date.toISOString();

      for (const model of fleet) {
        const result = deps.computeMetrics(model.dataset, period, model.metricKeys, model.segmentCol);
        const points: MetricPoint[] = [];

        for (const metric of model.metricKeys) {
          const overall = (result as Record<string, number>)[metric];
          if (overall === undefined || !Number.isFinite(overall)) continue;
          const rounded = Number(overall.toFixed(4));
          const t = model.thresholds.find((x) => x.metric === metric && !x.segment);
          const { status, breached } = evalStatus(rounded, t);
          totals.computed++;
          emit({ type: "metric", externalKey: model.externalKey, period, metric, value: rounded, segment: "overall", status, threshold: t ?? null });
          if (breached && t) {
            totals.breaches++;
            emit({ type: "breach", externalKey: model.externalKey, period, metric, value: rounded, severity: t.severity, flagged: t.breach_action === "notify_flag_revalidation" });
          }
          points.push({ metric, value: rounded, at, window: "daily", segment: "overall", context: { period } });

          for (const seg of segmentsFor(model, metric)) {
            const segVal = result.fairness?.[seg]?.[metric];
            if (segVal === undefined || !Number.isFinite(segVal)) continue;
            const rSeg = Number(segVal.toFixed(4));
            const ts = model.thresholds.find((x) => x.metric === metric && x.segment === seg);
            const segEval = evalStatus(rSeg, ts);
            totals.computed++;
            emit({ type: "metric", externalKey: model.externalKey, period, metric, value: rSeg, segment: seg, status: segEval.status, threshold: ts ?? null });
            if (segEval.breached && ts) {
              totals.breaches++;
              emit({ type: "breach", externalKey: model.externalKey, period, metric, value: rSeg, severity: ts.severity, flagged: ts.breach_action === "notify_flag_revalidation" });
            }
            points.push({ metric, value: rSeg, at, window: "daily", segment: seg, context: { period } });
          }
        }

        if (points.length) {
          const results = await client.pushBatch(model.externalKey, points);
          totals.pushed += points.length;
          totals.accepted += results.length;
          emit({ type: "push", externalKey: model.externalKey, period, accepted: results.length, results: results.map((r) => ({ metric: r.metric, status: r.status })) });
        }
      }
    }

    emit({ type: "run_done", totals });
  } catch (e) {
    emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd tools/mrm-simulator && npx vitest run src/dashboard/runner.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add tools/mrm-simulator/src/dashboard/events.ts tools/mrm-simulator/src/dashboard/runner.ts tools/mrm-simulator/src/dashboard/runner.test.ts
git commit -m "feat(mrm-sim): dashboard event types + pure simulation runner"
```

---

### Task 2: The WebSocket + HTTP server

**Files:**
- Create: `tools/mrm-simulator/src/dashboard/server.ts`
- Modify: `tools/mrm-simulator/package.json` (add `ws`)

**Interfaces:**
- Consumes: `runDashboardSimulation`, `RunnerDeps`, `RunnerOpts`, `DashboardEvent`, and the real v2a modules.
- Produces: `startDashboardServer(opts: { cfg: SimConfig; startDate: Date; days: number; port: number }): Promise<{ url: string; close: () => void }>` — serves `public/`, upgrades WS, runs the sim, broadcasts events, buffers them for late joiners.

- [ ] **Step 1: Add the ws dependency**

Run: `cd tools/mrm-simulator && npm install ws@8.18.0 && npm install -D @types/ws@8.5.13`
Expected: `ws` in dependencies, `@types/ws` in devDependencies.

- [ ] **Step 2: Write server.ts**

```typescript
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { SimConfig } from "../types.js";
import { DashboardEvent } from "./events.js";
import { runDashboardSimulation, RunnerDeps } from "./runner.js";
import { loadConfig } from "../configLoader.js";
import { runSetup } from "../setup.js";
import { computeMetrics } from "../computeClient.js";
import { IngestClient } from "../ingestClient.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "..", "public");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

export interface DashboardServerOpts {
  cfg: SimConfig;
  startDate: Date;
  days: number;
  port: number;
}

export const startDashboardServer = async (
  opts: DashboardServerOpts,
): Promise<{ url: string; close: () => void }> => {
  const buffer: DashboardEvent[] = [];
  const clients = new Set<WebSocket>();

  const broadcast = (e: DashboardEvent) => {
    buffer.push(e);
    const data = JSON.stringify(e);
    for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
  };

  const httpServer = createServer(async (req, res) => {
    const urlPath = req.url === "/" ? "/index.html" : (req.url ?? "/index.html");
    const filePath = join(PUBLIC, urlPath.split("?")[0]);
    // Prevent path traversal outside PUBLIC.
    if (!filePath.startsWith(PUBLIC)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = await readFile(filePath);
      res.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on("connection", (ws) => {
    clients.add(ws);
    // Replay buffered events so a late-joining browser sees history.
    for (const e of buffer) ws.send(JSON.stringify(e));
    ws.on("close", () => clients.delete(ws));
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(opts.port, resolve);
  });

  const deps: RunnerDeps = {
    loadConfig,
    runSetup,
    makeIngestClient: (cfg, token) => new IngestClient(cfg, token),
    computeMetrics,
  };

  // Kick off the simulation after a short delay so an auto-opened browser can connect.
  setTimeout(() => {
    void runDashboardSimulation(deps, { cfg: opts.cfg, startDate: opts.startDate, days: opts.days }, broadcast);
  }, 800);

  return {
    url: `http://localhost:${opts.port}`,
    close: () => {
      for (const ws of clients) ws.close();
      wss.close();
      httpServer.close();
    },
  };
};
```

- [ ] **Step 3: Typecheck**

Run: `cd tools/mrm-simulator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add tools/mrm-simulator/src/dashboard/server.ts tools/mrm-simulator/package.json tools/mrm-simulator/package-lock.json
git commit -m "feat(mrm-sim): dashboard http+websocket server with event replay"
```

---

### Task 3: The frontend (VerifyWise-styled, four panels)

**Files:**
- Create: `tools/mrm-simulator/public/index.html`
- Create: `tools/mrm-simulator/public/style.css`
- Create: `tools/mrm-simulator/public/app.js`

**Interfaces:**
- Consumes: the WebSocket event stream (the `DashboardEvent` shapes from Task 1).
- Produces: a static page rendering the four panels.

- [ ] **Step 1: Compute the real Chart.js SRI hash**

The `index.html` below pins Chart.js from a CDN with Subresource Integrity. The
`integrity` value shown is a placeholder — compute the real one and substitute it:

Run:
```bash
curl -s https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js | openssl dgst -sha384 -binary | openssl base64 -A
```
Prepend `sha384-` to the output and use that as the `integrity` value. Verify the
page loads Chart.js (no console SRI error) before committing.

- [ ] **Step 2: Write index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MRM monitoring — simulator</title>
    <link rel="stylesheet" href="style.css" />
    <script
      src="https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js"
      integrity="sha384-k1E0MZ+xGDzZXcyBS+lRdC5w6Db2NBu8b0dwXVCFn3PXFJXf1DUJZExVzfeQZDNL"
      crossorigin="anonymous"
      referrerpolicy="no-referrer"
    ></script>
  </head>
  <body>
    <header id="topbar">
      <div class="brand">MRM monitoring</div>
      <div class="status"><span id="run-status">connecting…</span> · <span id="target"></span></div>
    </header>
    <div id="error-banner" hidden></div>
    <main>
      <section id="fleet" class="panel"><h2>Fleet</h2><div id="fleet-cards"></div></section>
      <section id="charts" class="panel"><h2 id="charts-title">Select a model</h2><div id="chart-grid"></div></section>
      <aside id="feed" class="panel"><h2>Events</h2><ul id="feed-list"></ul></aside>
    </main>
    <footer id="ingest">
      <span>computed <b id="t-computed">0</b></span>
      <span>pushed <b id="t-pushed">0</b></span>
      <span>accepted <b id="t-accepted">0</b></span>
      <span>breaches <b id="t-breaches">0</b></span>
    </footer>
    <script src="app.js"></script>
  </body>
</html>
```

- [ ] **Step 3: Write style.css**

```css
:root {
  --green: #13715b; --green-bg: #e6f0ec; --border: #d0d5dd;
  --amber: #b54708; --amber-bg: #fef0c7; --red: #b42318; --red-bg: #fee4e2;
  --text: #1c2130; --muted: #667085; --radius: 4px;
  font-family: Inter, Geist, system-ui, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; color: var(--text); background: #fafafa; font-size: 13px; }
#topbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: #fff; border-bottom: 1px solid var(--border); }
#topbar .brand { font-weight: 600; color: var(--green); font-size: 15px; }
#topbar .status { color: var(--muted); }
#error-banner { background: var(--red-bg); color: var(--red); padding: 10px 20px; border-bottom: 1px solid var(--border); }
main { display: grid; grid-template-columns: 1fr 1fr 320px; gap: 16px; padding: 16px; align-items: start; }
.panel { background: #fff; border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.panel h2 { margin: 0 0 12px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
#fleet-cards { display: flex; flex-direction: column; gap: 10px; }
.model-card { border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; cursor: pointer; }
.model-card:hover { border-color: var(--green); }
.model-card.selected { border-color: var(--green); background: var(--green-bg); }
.model-card .name { font-weight: 600; }
.model-card .tier { color: var(--muted); font-size: 11px; }
.model-card .metrics { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.chip { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
.chip.ok { background: var(--green-bg); color: var(--green); }
.chip.warn { background: var(--amber-bg); color: var(--amber); }
.chip.breach { background: var(--red-bg); color: var(--red); }
.chip.no_threshold { background: #f2f4f7; color: var(--muted); }
#chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.chart-box { border: 1px solid var(--border); border-radius: var(--radius); padding: 8px; }
.chart-box h3 { margin: 0 0 6px; font-size: 12px; color: var(--muted); }
#feed-list { list-style: none; margin: 0; padding: 0; max-height: 70vh; overflow-y: auto; }
#feed-list li { padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
#feed-list li.breach { color: var(--red); } #feed-list li.warn { color: var(--amber); }
footer#ingest { display: flex; gap: 24px; padding: 12px 20px; background: #fff; border-top: 1px solid var(--border); color: var(--muted); }
footer#ingest b { color: var(--text); }
```

- [ ] **Step 4: Write app.js**

```javascript
const state = { models: new Map(), series: new Map(), selected: null, charts: new Map() };
const $ = (id) => document.getElementById(id);

const ws = new WebSocket(`ws://${location.host}`);
ws.onopen = () => ($("run-status").textContent = "running");
ws.onclose = () => ($("run-status").textContent = "disconnected");
ws.onmessage = (m) => handle(JSON.parse(m.data));

function handle(e) {
  if (e.type === "run_started") return onRunStarted(e);
  if (e.type === "metric") return onMetric(e);
  if (e.type === "breach") return onBreach(e);
  if (e.type === "push") return onPush(e);
  if (e.type === "run_done") return ($("run-status").textContent = "done");
  if (e.type === "error") return onError(e);
}

function onRunStarted(e) {
  $("target").textContent = e.target;
  for (const m of e.models) {
    state.models.set(m.externalKey, { ...m, latest: {} });
    state.series.set(m.externalKey, {});
  }
  renderFleet();
  if (!state.selected && e.models[0]) selectModel(e.models[0].externalKey);
}

function onMetric(e) {
  const model = state.models.get(e.externalKey);
  if (!model) return;
  const key = e.segment === "overall" ? e.metric : `${e.metric}:${e.segment}`;
  model.latest[key] = { value: e.value, status: e.status };
  const series = state.series.get(e.externalKey);
  (series[key] ||= []).push({ x: e.period, y: e.value, status: e.status, threshold: e.threshold });
  renderFleetCard(e.externalKey);
  if (state.selected === e.externalKey) renderCharts(e.externalKey);
}

function onBreach(e) {
  const li = document.createElement("li");
  li.className = e.severity === "warn" ? "warn" : "breach";
  const arrow = e.flagged ? " → revalidation flagged" : "";
  li.textContent = `${e.externalKey} · ${e.metric} ${e.value} · ${e.severity} · ${e.period}${arrow}`;
  $("feed-list").prepend(li);
}

const totals = { computed: 0, pushed: 0, accepted: 0, breaches: 0 };
function onPush(e) {
  totals.pushed += e.accepted;
  totals.accepted += e.results.length;
  totals.breaches += e.results.filter((r) => r.status === "breach" || r.status === "warn").length;
  totals.computed = [...state.series.values()].reduce((n, s) => n + Object.values(s).reduce((a, arr) => a + arr.length, 0), 0);
  $("t-computed").textContent = totals.computed;
  $("t-pushed").textContent = totals.pushed;
  $("t-accepted").textContent = totals.accepted;
  $("t-breaches").textContent = totals.breaches;
}

function onError(e) {
  const b = $("error-banner");
  b.hidden = false;
  b.textContent = `Error: ${e.message}`;
  $("run-status").textContent = "stopped";
}

function renderFleet() {
  const el = $("fleet-cards");
  el.innerHTML = "";
  for (const [key, m] of state.models) {
    const card = document.createElement("div");
    card.className = "model-card" + (state.selected === key ? " selected" : "");
    card.id = `card-${key}`;
    card.onclick = () => selectModel(key);
    card.innerHTML = `<div class="name">${m.name}</div><div class="tier">Tier ${m.tier}</div><div class="metrics"></div>`;
    el.appendChild(card);
    renderFleetCard(key);
  }
}

function renderFleetCard(key) {
  const card = document.getElementById(`card-${key}`);
  if (!card) return;
  const m = state.models.get(key);
  const chips = card.querySelector(".metrics");
  chips.innerHTML = "";
  for (const [mk, v] of Object.entries(m.latest)) {
    const c = document.createElement("span");
    c.className = `chip ${v.status}`;
    c.textContent = `${mk} ${v.value}`;
    chips.appendChild(c);
  }
}

function selectModel(key) {
  state.selected = key;
  document.querySelectorAll(".model-card").forEach((c) => c.classList.remove("selected"));
  document.getElementById(`card-${key}`)?.classList.add("selected");
  $("charts-title").textContent = state.models.get(key)?.name ?? key;
  renderCharts(key);
}

function renderCharts(key) {
  const series = state.series.get(key) || {};
  const grid = $("chart-grid");
  for (const [mk, arr] of Object.entries(series)) {
    let box = document.getElementById(`chart-${key}-${mk}`);
    if (!box) {
      box = document.createElement("div");
      box.className = "chart-box";
      box.id = `chart-${key}-${mk}`;
      box.innerHTML = `<h3>${mk}</h3><canvas></canvas>`;
      grid.appendChild(box);
    }
    drawChart(box.querySelector("canvas"), `${key}-${mk}`, arr);
  }
  // Remove charts for metrics not in this model.
  for (const el of [...grid.children]) if (!el.id.startsWith(`chart-${key}-`)) el.remove();
}

function drawChart(canvas, id, arr) {
  const labels = arr.map((p) => p.x);
  const data = arr.map((p) => p.y);
  const thr = arr.find((p) => p.threshold)?.threshold;
  const line = thr && thr.value_num != null ? thr.value_num : null;
  const pointColors = arr.map((p) => (p.status === "breach" ? "#b42318" : p.status === "warn" ? "#b54708" : "#13715b"));
  const datasets = [{ data, borderColor: "#13715b", pointBackgroundColor: pointColors, tension: 0.2, pointRadius: 3 }];
  if (line != null) datasets.push({ data: labels.map(() => line), borderColor: "#b42318", borderDash: [4, 4], pointRadius: 0 });
  const existing = state.charts.get(id);
  if (existing) {
    existing.data.labels = labels;
    existing.data.datasets = datasets;
    existing.update("none");
    return;
  }
  state.charts.set(id, new Chart(canvas, { type: "line", data: { labels, datasets }, options: { animation: false, plugins: { legend: { display: false } }, scales: { x: { display: false } } } }));
}
```

- [ ] **Step 5: Manual smoke (deferred to Task 5 e2e)**

No automated test for the vanilla frontend; it is verified in the Task 5 end-to-end run.

- [ ] **Step 6: Commit**

```bash
git add tools/mrm-simulator/public/index.html tools/mrm-simulator/public/style.css tools/mrm-simulator/public/app.js
git commit -m "feat(mrm-sim): VerifyWise-styled dashboard frontend (four panels)"
```

---

### Task 4: The `dashboard` CLI command + README

**Files:**
- Modify: `tools/mrm-simulator/src/cli.ts`
- Modify: `tools/mrm-simulator/README.md`

**Interfaces:**
- Consumes: `startDashboardServer`, `assertSafeTarget`, `loadConfig(process.argv)` (the config.ts one).
- Produces: `sim dashboard [--start-date] [--days] [--port] [--speed]` starts the server, prints + best-effort-opens the URL.

- [ ] **Step 1: Add the dashboard command to cli.ts**

In `src/cli.ts`, add these imports near the top:

```typescript
import { startDashboardServer } from "./dashboard/server.js";
import { execFile } from "node:child_process";
```

Then add this command branch inside `main` (alongside the other `if (cmd === ...)` blocks), before the usage fallback:

```typescript
  if (cmd === "dashboard") {
    const days = Number(arg("--days", "30"));
    const port = Number(arg("--port", "4000"));
    const startArg = arg("--start-date", "2026-06-01");
    const startDate = new Date(`${startArg}T00:00:00.000Z`);
    const { url } = await startDashboardServer({ cfg, startDate, days, port });
    console.log(`dashboard running at ${url} (Ctrl-C to stop)`);
    // Best-effort browser open; non-fatal.
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    execFile(opener, [url], () => {});
    // Keep the process alive.
    await new Promise(() => {});
    return;
  }
```

Note: `cfg` and `arg` already exist in `main` (used by the other commands); `assertSafeTarget(cfg)` already runs earlier in `main`.

- [ ] **Step 2: Typecheck**

Run: `cd tools/mrm-simulator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Update README**

Add a "Dashboard" section to `tools/mrm-simulator/README.md` after the Usage section:

```markdown
## Live dashboard

```bash
npm run sim -- dashboard --start-date 2026-06-01 --days 30 --port 4000
```

Starts a local web dashboard (default `http://localhost:4000`) that drives the
simulation and streams computed metrics, breaches, and ingestion results live.
Four panels: fleet overview, per-model metric charts (with threshold lines),
a breach/event feed, and ingestion totals. The URL is printed and opened in
your browser automatically (best-effort). Requires the Python compute venv and
a running VerifyWise backend, same as the other commands.
```

- [ ] **Step 4: Commit**

```bash
git add tools/mrm-simulator/src/cli.ts tools/mrm-simulator/README.md
git commit -m "feat(mrm-sim): dashboard CLI command + README"
```

---

### Task 5: End-to-end run against the live backend

**Files:** none (execution + verification).

- [ ] **Step 1: Confirm backend up + full suite green**

Run: `cd tools/mrm-simulator && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass (runner + the v2a suites).
Confirm `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/mrm/attestation/summary` returns `400`/`401` (server up).

- [ ] **Step 2: Start the dashboard**

Run: `cd tools/mrm-simulator && npx tsx src/cli.ts dashboard --start-date 2026-06-01 --days 30 --port 4000`
Expected: prints `dashboard running at http://localhost:4000`; a browser opens.

- [ ] **Step 3: Verify in the browser**

Confirm: the fleet cards appear; selecting credit-scoring-v3 shows its PSI chart climbing across the window with the threshold line and a red breach point; the event feed logs breaches (credit-scoring, loan-approval subprime); the ingestion footer totals climb; no error banner.

- [ ] **Step 4: Stop and note completion**

Ctrl-C to stop. No commit (nothing generated is tracked). Record the observed behavior in the PR description.

---

## Self-review

**Spec coverage:**
- `sim dashboard` command starting an HTTP+WS server → Tasks 2, 4 ✓
- Dashboard drives the simulation, streams events → Task 1 (runner) + Task 2 (server) ✓
- Event protocol (run_started/metric/breach/push/run_done/error) → Task 1 events.ts ✓
- Four panels (fleet / charts+threshold / breach feed / ingestion) → Task 3 ✓
- Event buffer/replay for late joiners → Task 2 server ✓
- VerifyWise styling (tokens, chips) → Task 3 style.css ✓
- Reuse v2a compute/config/setup/ingest untouched → runner injects them; server wires the real ones ✓
- assertSafeTarget before pushes → runs in `main` before the dashboard branch (Task 4) ✓
- Best-effort browser open, URL always printed → Task 4 ✓
- `ws` the only new dep → Task 2 ✓
- Testing: runner unit test (event sequence + error path) → Task 1; e2e → Task 5 ✓

**Placeholder scan:** every code step has complete code; run steps have commands + expected output. No TBD/TODO.

**Type consistency:** `DashboardEvent` shapes defined in Task 1 events.ts are produced by the runner (Task 1) and consumed by app.js (Task 3) identically. `RunnerDeps`/`RunnerOpts` defined in Task 1 and used by server.ts (Task 2). `startDashboardServer(opts)` defined in Task 2 and called in cli.ts (Task 4). The runner's `evalStatus` mirrors the threshold ops in `ThresholdSpec`. `MetricPoint` context uses `{ period }` consistent with the v2a engine.
