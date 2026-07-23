# MRM simulator v2b — live web dashboard — design

> **Status:** Approved design, pre-implementation.
> **Date:** 2026-07-04
> **Builds on:** v2a (real compute + config-driven fleet), branch `feat/mrm-simulator-v2a-compute` / PR #4236.
> **Scope:** v2b only — a live local web dashboard over the v2a compute+ingest pipeline. The in-app "demo ingest" product feature remains a separate future sweep.

## Purpose

v2a made the simulator compute real metrics and push them to VerifyWise from a
CLI. v2b adds a **live local web dashboard**: a `sim dashboard` command starts a
Node HTTP + WebSocket server, opens a browser, and drives the simulation itself
— running setup and the per-period compute→push loop while streaming every
computed metric, breach, and ingestion result to the browser in real time.

The result is a self-contained mini "monitoring product" (Evidently/Arize style)
that visibly computes, charts, breaches, and pushes to VerifyWise — suitable for
showing customers live.

## Non-goals (YAGNI)

- No frontend framework or build step — vanilla HTML/CSS/JS with Chart.js from a CDN.
- No auth, no multi-run history, no persistence (in-memory state + an event
  buffer for late-joining browsers only).
- No new charting beyond Chart.js; no server framework (Node built-in `http`, plus `ws`).
- The v2a compute engine, config loader, setup, and ingest client are reused
  untouched — the dashboard only orchestrates and presents.
- Not an in-app / product feature — this stays a dev-only tool.

## Architecture

```
$ sim dashboard --start-date 2026-06-01 --days 30 [--speed N] [--port 4000]
      │
      ▼
Node server (localhost:4000)  ──serves──►  one static page (vanilla JS + Chart.js)
      │                                          ▲
      │  drives the run (runner.ts):             │ WebSocket: typed JSON events
      │   loadConfig → setup → per period:       │  run_started / metric / breach /
      │     computeMetrics (Python) →            │  push / run_done / error
      │     ingestClient.pushBatch →             │
      │     emit(event)  ────────────────────────┘
      ▼
  VerifyWise MRM ingestion API (real pushes, unchanged)
```

The dashboard is an orchestration + presentation layer on top of v2a. It calls
the same functions the CLI does (`loadConfig`, `runSetup`, `computeMetrics`,
`ingestClient.pushBatch`) but emits events to the browser at each step.

### Components & boundaries

- **`src/dashboard/events.ts`** — the event type definitions (shared by runner
  and, conceptually, the frontend). One clear job: the wire contract.
- **`src/dashboard/runner.ts`** — the simulation driver. Pure orchestration: takes
  an injected `emit(event)` function, runs setup + the per-period compute→push
  loop, emits typed events. No transport, no HTTP. Independently testable by
  injecting a fake emitter and stub compute/ingest.
- **`src/dashboard/server.ts`** — thin transport. Node `http` static-serves
  `public/`, upgrades to WebSocket (`ws`), runs the runner (passing a broadcast
  `emit`), and buffers emitted events so a browser connecting mid-run gets a
  replay.
- **`public/index.html`, `style.css`, `app.js`** — presentation only. The
  four-panel layout, VerifyWise styling, WS client, in-memory fleet state,
  per-panel render functions, Chart.js setup.
- **`dashboard` command in `cli.ts`** — parses `--start-date`, `--days`,
  `--speed`, `--port`; runs `assertSafeTarget`; starts the server. On startup it
  prints the dashboard URL and attempts a best-effort browser open (via the
  platform `open`/`xdg-open` command); a failed auto-open is non-fatal — the URL
  is always printed so the user can open it manually.

## The four views (one page, four panels)

1. **Fleet overview (top)** — a card per model: name, tier badge, latest value
   per metric, and a status chip (green healthy / amber warning / red breach).
   Cards re-render as periods stream in; flip to red the moment a breach fires.
2. **Per-model metric charts (main)** — click a fleet card to focus a model;
   a time-series line chart per metric (PSI, AUC, gini, KS) across the window,
   each drawing its threshold line and marking breach points in red.
3. **Breach / event feed (side)** — a live-scrolling, severity-colored log:
   `credit-scoring-v3 · PSI 0.21 > 0.20 · breach · day 18 → revalidation flagged`.
   Newest on top.
4. **Push / ingestion status (footer strip)** — running totals of what is going
   to VerifyWise: computed, pushed, accepted, deduped, and the per-point verdict
   returned by the ingestion API (ok / warn / breach / duplicate).

A small header shows run status (running / done) and the target (localhost:3000).
The page opens on the fleet; the run streams in progressively; selecting a model
drills into its charts.

## Event protocol (server → browser)

```
{ type: "run_started", target, models: [{externalKey, name, tier, metrics, thresholds}], startDate, days }
{ type: "metric",  externalKey, period, metric, value, segment, threshold, status }
{ type: "breach",  externalKey, period, metric, value, threshold, severity, flagged }
{ type: "push",    externalKey, period, accepted, results: [{ metric, status }] }
{ type: "run_done", totals: { computed, pushed, accepted, breaches } }
{ type: "error",   message }
```

`status` on a metric is the computed verdict (ok / warn / breach / no_threshold),
so the frontend can color without re-deriving. `flagged` on a breach indicates a
`notify_flag_revalidation` action fired.

## Run lifecycle (runner.ts)

1. `loadConfig()` → emit `run_started` with the fleet.
2. `runSetup()` (idempotent) — models / thresholds / token.
3. For each period (start-date + day index), for each model:
   - `computeMetrics(dataset, period, metrics, segmentCol)` → emit a `metric`
     event per value (with the matching threshold + computed status).
   - `ingestClient.pushBatch(points)` → emit a `push` event; emit a `breach`
     event for each warn/breach point.
4. Emit `run_done` with totals.

A `--speed` flag sets the delay between periods (default fast for backfill,
~1 period/sec for a watchable demo). `live` behavior keeps emitting forward.

## Styling

VerifyWise design tokens, no build step: primary `#13715B`, border `#d0d5dd`,
4px radius, card surfaces, Geist/Inter. Status chips use product semantics
(green healthy / amber warning / red breach). Three focused files: `index.html`
(layout), `style.css` (tokens + card/chip/feed/chart styling), `app.js` (WS
client + render). Chart.js from CDN.

## Error handling

- A compute or push failure emits an `error` event (browser banner) and the run
  stops cleanly; the server stays up so the browser keeps its last state.
- Port already in use → a clear message on startup.
- `assertSafeTarget` runs before any push, same as the CLI (refuses non-localhost
  without the override flag).
- Compute/push errors are named by model + period (reusing v2a's messages).

## Testing

- **`runner.test.ts`** (the meaningful automated test) — inject a fake `emit`
  plus stub compute/ingest; run a small window; assert the exact event sequence
  (run_started → metric events → a breach on credit-scoring → push → run_done)
  and the totals in run_done.
- **Server** — a light test that it serves `index.html` (200) and accepts a WS
  connection; or manual smoke.
- **Frontend** — manual verification (open it, watch a run) — appropriate for a
  vanilla presentation layer.
- **End-to-end** — run `sim dashboard` against the live backend: charts populate,
  a breach appears in the feed, push totals climb, no errors.

## Dependencies

- `ws` (WebSocket server) — the one new runtime dep. HTTP static-serving via Node
  built-in `http` + `fs`. Chart.js loaded from CDN in the browser.

## Deliverables

- `src/dashboard/{events.ts, runner.ts, server.ts, runner.test.ts}`.
- `public/{index.html, style.css, app.js}`.
- A `dashboard` command in `cli.ts` + README usage.
