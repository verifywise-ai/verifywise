# MRM model-eval simulator — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone TypeScript CLI (`tools/mrm-simulator`) that impersonates a model-monitoring platform, feeds scenario-driven metrics into VerifyWise's MRM ingestion API, and emits a gap-findings report.

**Architecture:** A self-contained CLI with pure scenario/engine modules (unit-tested) and thin HTTP clients over the real MRM API. Commands: `setup` (idempotent fleet + thresholds + token via JWT), `backfill`/`live` (push metrics via ingestion token), `verify`/`report` (read MRM back, check the governance loop, write `gaps-report.md`).

**Tech Stack:** TypeScript, tsx (runner), vitest (tests), node built-in `fetch`. No new repo-wide dependencies; the tool has its own `package.json`.

## Global Constraints

- Tool lives entirely under `tools/mrm-simulator/`. It does NOT modify the MRM feature, `Servers/`, or `Clients/`.
- Ingestion auth header: `Authorization: Bearer mrm_<64 hex>` (no `vw_` prefix).
- Response envelope is always `{ message, data }`. The useful payload is at `response.data` of the parsed JSON (e.g. login token = parsed `.data.token`).
- Ingestion endpoint: `POST /api/mrm/models/:externalModelKey/metrics`, batch body `{ points: [...] }`, per-point fields `metric` (string ≤100), `value` (finite number), `at` (ISO-8601, ≤1h future), optional `window`/`segment`/`context`.
- Per-point response `status` ∈ `ok | warn | breach | no_threshold | duplicate`.
- Threshold ops: `gt | gte | lt | lte | outside`. `outside` needs `value_lo < value_hi`; others need `value_num`.
- Tier values are strings: `"1" | "2" | "3"`.
- `external_key` is set via `PATCH /api/modelInventory/:id`, NOT the tier endpoint.
- Default base URL `http://localhost:3000`; refuse non-localhost unless `--i-know-what-im-doing`.
- Dev credentials default: `gorkem.cetin@verifywise.ai` / `Verifywise#1` (overridable via env `VW_EMAIL` / `VW_PASSWORD`).
- No secrets committed. Token cache `tools/mrm-simulator/.mrm-simulator.json` is git-ignored.

---

## File structure

```
tools/mrm-simulator/
  package.json
  tsconfig.json
  vitest.config.ts
  .gitignore
  README.md
  scenarios/
    storylines.ts        # pure metric(model, dayIndex) -> value
    storylines.test.ts
    fleet.ts             # static fleet: models, tiers, external_keys, threshold specs
  src/
    types.ts             # shared types (MetricPoint, Finding, etc.)
    config.ts            # base URL, creds, localhost guard, cache read/write
    config.test.ts
    engine.ts            # walk storylines over a date range -> MetricPoint[]
    engine.test.ts
    httpEnvelope.ts      # parse { message, data } envelope + errors
    httpEnvelope.test.ts
    jwtClient.ts         # login + JWT-authed calls
    ingestClient.ts      # token-authed batched POST /metrics
    setup.ts             # idempotent fleet + thresholds + token
    verify.ts            # read-back + gap checks -> Finding[]
    report.ts            # Finding[] -> gaps-report.md
    report.test.ts
    cli.ts               # arg parse + dispatch
  gaps-report.md         # generated (git-ignored)
```

---

### Task 1: Scaffold the tool

**Files:**
- Create: `tools/mrm-simulator/package.json`
- Create: `tools/mrm-simulator/tsconfig.json`
- Create: `tools/mrm-simulator/vitest.config.ts`
- Create: `tools/mrm-simulator/.gitignore`

**Interfaces:**
- Produces: an installable, test-runnable TS package. Scripts: `npm test`, and `npx tsx src/cli.ts <command>`.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "mrm-simulator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Scenario-driven MRM metric simulator and gap-finder for VerifyWise",
  "scripts": {
    "test": "vitest run",
    "sim": "tsx src/cli.ts"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8",
    "@types/node": "^22.10.1"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "scenarios"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
.mrm-simulator.json
gaps-report.md
```

- [ ] **Step 5: Install and verify**

Run: `cd tools/mrm-simulator && npm install && npx vitest run`
Expected: install succeeds; vitest runs with "No test files found" (exit 0 or a no-tests message).

- [ ] **Step 6: Commit**

```bash
git add tools/mrm-simulator/package.json tools/mrm-simulator/tsconfig.json tools/mrm-simulator/vitest.config.ts tools/mrm-simulator/.gitignore
git commit -m "chore(mrm-sim): scaffold simulator tool"
```

---

### Task 2: Shared types

**Files:**
- Create: `tools/mrm-simulator/src/types.ts`

**Interfaces:**
- Produces: `MetricPoint`, `ThresholdSpec`, `FleetModel`, `Finding`, `SimConfig`, `IngestResultPoint` — consumed by every later task.

- [ ] **Step 1: Write the types**

```typescript
// A single metric reading in the ingestion wire format.
export interface MetricPoint {
  metric: string;
  value: number;
  at: string; // ISO-8601
  window?: string;
  segment?: string;
  context?: Record<string, unknown>;
}

// Threshold to create for a model during setup.
export interface ThresholdSpec {
  metric: string;
  op: "gt" | "gte" | "lt" | "lte" | "outside";
  value_num?: number | null;
  value_lo?: number | null;
  value_hi?: number | null;
  severity: "warn" | "high" | "critical";
  breach_action: "notify" | "notify_flag_revalidation";
  segment?: string | null;
  window?: string | null;
}

// A model in the scenario fleet.
export interface FleetModel {
  externalKey: string;
  name: string;
  provider: string;
  tier: "1" | "2" | "3";
  materialityDrivers: string;
  metricKeys: string[]; // keys to register (e.g. psi, auc, gini, ks)
  thresholds: ThresholdSpec[];
}

// Per-point result the ingestion API returns.
export interface IngestResultPoint {
  metric: string;
  at: string;
  status: "ok" | "warn" | "breach" | "no_threshold" | "duplicate";
  pointId: number | null;
  threshold?: {
    op: string;
    value_num: number | null;
    value_lo: number | null;
    value_hi: number | null;
    severity: string;
  };
}

// A gap-finding.
export interface Finding {
  category: "contract" | "workflow" | "ux";
  severity: "high" | "medium" | "low";
  title: string;
  expected: string;
  actual: string;
  repro: string;
}

export interface SimConfig {
  baseUrl: string;
  email: string;
  password: string;
  allowRemote: boolean;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd tools/mrm-simulator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add tools/mrm-simulator/src/types.ts
git commit -m "feat(mrm-sim): shared types"
```

---

### Task 3: Storylines (pure, TDD)

**Files:**
- Create: `tools/mrm-simulator/scenarios/storylines.ts`
- Test: `tools/mrm-simulator/scenarios/storylines.test.ts`

**Interfaces:**
- Produces: `metricValue(externalKey: string, metric: string, dayIndex: number, segment?: string): number` — deterministic value for a model's metric on a given day. `dayIndex` 0 = oldest day of a backfill window.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { metricValue } from "./storylines";

describe("storylines", () => {
  it("credit-scoring-v3 PSI drifts across 0.20 around day 18", () => {
    expect(metricValue("credit-scoring-v3", "psi", 0)).toBeLessThan(0.1);
    expect(metricValue("credit-scoring-v3", "psi", 17)).toBeLessThan(0.2);
    expect(metricValue("credit-scoring-v3", "psi", 20)).toBeGreaterThan(0.2);
  });

  it("fraud-detector-v2 stays healthy (psi never breaches 0.25)", () => {
    for (let d = 0; d < 30; d++) {
      expect(metricValue("fraud-detector-v2", "psi", d)).toBeLessThan(0.25);
    }
  });

  it("loan-approval-v1 subprime gini drops below 0.45 while overall stays in band", () => {
    const lateSubprime = metricValue("loan-approval-v1", "gini", 25, "subprime");
    const lateOverall = metricValue("loan-approval-v1", "gini", 25, "overall");
    expect(lateSubprime).toBeLessThan(0.45);
    expect(lateOverall).toBeGreaterThanOrEqual(0.45);
    expect(lateOverall).toBeLessThanOrEqual(0.75);
  });

  it("churn-propensity-v1 breaches psi>0.15 mid-window then recovers", () => {
    expect(metricValue("churn-propensity-v1", "psi", 15)).toBeGreaterThan(0.15);
    expect(metricValue("churn-propensity-v1", "psi", 28)).toBeLessThan(0.15);
  });

  it("is deterministic (same inputs -> same output)", () => {
    expect(metricValue("credit-scoring-v3", "psi", 10)).toBe(
      metricValue("credit-scoring-v3", "psi", 10),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/mrm-simulator && npx vitest run scenarios/storylines.test.ts`
Expected: FAIL with "metricValue is not a function" / module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// Deterministic, seeded metric storylines. Values are a function of
// (externalKey, metric, dayIndex, segment) with small reproducible noise so
// charts look organic without random run-to-run variation.

// Deterministic pseudo-noise in [-1, 1] from integer-ish inputs (no Math.random).
const noise = (seed: number): number => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// Linear ramp helper.
const ramp = (day: number, fromDay: number, toDay: number, fromVal: number, toVal: number): number => {
  if (day <= fromDay) return fromVal;
  if (day >= toDay) return toVal;
  const t = (day - fromDay) / (toDay - fromDay);
  return fromVal + t * (toVal - fromVal);
};

export const metricValue = (
  externalKey: string,
  metric: string,
  dayIndex: number,
  segment: string = "overall",
): number => {
  const n = noise(dayIndex + metric.length * 7 + externalKey.length * 13) * 0.01;

  if (externalKey === "credit-scoring-v3") {
    if (metric === "psi") return clamp(ramp(dayIndex, 0, 30, 0.05, 0.24) + n, 0, 1);
    if (metric === "auc") return clamp(ramp(dayIndex, 0, 30, 0.86, 0.82) + n, 0, 1);
    if (metric === "gini") return clamp(ramp(dayIndex, 0, 30, 0.7, 0.63) + n, 0, 1);
    if (metric === "ks") return clamp(0.4 + n, 0, 1);
  }

  if (externalKey === "fraud-detector-v2") {
    if (metric === "psi") return clamp(0.04 + n, 0, 1);
    if (metric === "auc") return clamp(0.94 + n, 0, 1);
    if (metric === "gini") return clamp(0.88 + n, 0, 1);
    if (metric === "ks") return clamp(0.6 + n, 0, 1);
  }

  if (externalKey === "loan-approval-v1") {
    if (metric === "gini") {
      if (segment === "subprime") return clamp(ramp(dayIndex, 0, 30, 0.6, 0.4) + n, 0, 1);
      return clamp(0.62 + n, 0, 1); // overall stays inside [0.45, 0.75]
    }
    if (metric === "psi") return clamp(0.06 + n, 0, 1);
    if (metric === "auc") return clamp(0.83 + n, 0, 1);
    if (metric === "ks") return clamp(0.45 + n, 0, 1);
  }

  if (externalKey === "churn-propensity-v1") {
    if (metric === "psi") {
      // healthy -> breach ~day 10 -> retrain recovery ~day 22
      const drift = ramp(dayIndex, 5, 12, 0.08, 0.2);
      const recover = ramp(dayIndex, 22, 26, 0.2, 0.08);
      const v = dayIndex < 22 ? drift : recover;
      return clamp(v + n, 0, 1);
    }
    if (metric === "auc") return clamp(0.8 + n, 0, 1);
    if (metric === "gini") return clamp(0.55 + n, 0, 1);
    if (metric === "ks") return clamp(0.38 + n, 0, 1);
  }

  // Unknown model/metric: benign flat value.
  return clamp(0.5 + n, 0, 1);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/mrm-simulator && npx vitest run scenarios/storylines.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/mrm-simulator/scenarios/storylines.ts tools/mrm-simulator/scenarios/storylines.test.ts
git commit -m "feat(mrm-sim): deterministic metric storylines"
```

---

### Task 4: Fleet definition

**Files:**
- Create: `tools/mrm-simulator/scenarios/fleet.ts`

**Interfaces:**
- Consumes: `FleetModel`, `ThresholdSpec` from `src/types.ts`.
- Produces: `FLEET: FleetModel[]` — the four scenario models with their thresholds, consumed by `engine`, `setup`, and `verify`.

- [ ] **Step 1: Write the fleet**

```typescript
import { FleetModel } from "../src/types.js";

export const FLEET: FleetModel[] = [
  {
    externalKey: "credit-scoring-v3",
    name: "Credit scoring v3",
    provider: "in-house",
    tier: "1",
    materialityDrivers: "capital impact, regulatory reporting, customer exposure",
    metricKeys: ["psi", "auc", "gini", "ks"],
    thresholds: [
      { metric: "psi", op: "gt", value_num: 0.2, severity: "high", breach_action: "notify_flag_revalidation" },
      { metric: "auc", op: "lt", value_num: 0.8, severity: "warn", breach_action: "notify" },
    ],
  },
  {
    externalKey: "fraud-detector-v2",
    name: "Fraud detector v2",
    provider: "in-house",
    tier: "1",
    materialityDrivers: "fraud loss exposure, real-time decisioning",
    metricKeys: ["psi", "auc", "gini", "ks"],
    thresholds: [
      { metric: "psi", op: "gt", value_num: 0.25, severity: "high", breach_action: "notify" },
    ],
  },
  {
    externalKey: "loan-approval-v1",
    name: "Loan approval v1",
    provider: "in-house",
    tier: "2",
    materialityDrivers: "lending decisions, fair-lending risk",
    metricKeys: ["psi", "auc", "gini", "ks"],
    thresholds: [
      {
        metric: "gini",
        op: "outside",
        value_lo: 0.45,
        value_hi: 0.75,
        severity: "high",
        breach_action: "notify_flag_revalidation",
        segment: "subprime",
      },
    ],
  },
  {
    externalKey: "churn-propensity-v1",
    name: "Churn propensity v1",
    provider: "in-house",
    tier: "3",
    materialityDrivers: "retention spend allocation",
    metricKeys: ["psi", "auc", "gini", "ks"],
    thresholds: [
      { metric: "psi", op: "gt", value_num: 0.15, severity: "warn", breach_action: "notify" },
    ],
  },
];
```

- [ ] **Step 2: Typecheck**

Run: `cd tools/mrm-simulator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add tools/mrm-simulator/scenarios/fleet.ts
git commit -m "feat(mrm-sim): scenario fleet definition"
```

---

### Task 5: Engine (pure, TDD)

**Files:**
- Create: `tools/mrm-simulator/src/engine.ts`
- Test: `tools/mrm-simulator/src/engine.test.ts`

**Interfaces:**
- Consumes: `FLEET`, `metricValue`, `MetricPoint`.
- Produces: `generatePoints(model: FleetModel, dayIndex: number, date: Date): MetricPoint[]` and `generateRange(model: FleetModel, startDate: Date, days: number): MetricPoint[]` — the points to push. Segmented `gini` is emitted for models whose thresholds reference a segment.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { generatePoints, generateRange } from "./engine";
import { FLEET } from "../scenarios/fleet";

const model = (key: string) => FLEET.find((m) => m.externalKey === key)!;

describe("engine", () => {
  it("generates one point per metric key plus segmented points where thresholds are segmented", () => {
    const pts = generatePoints(model("loan-approval-v1"), 10, new Date("2026-07-01T00:00:00Z"));
    // 4 base metric keys + 1 segmented gini (subprime)
    expect(pts.filter((p) => p.segment === "subprime").length).toBe(1);
    expect(pts.length).toBe(5);
  });

  it("stamps ISO 'at' and finite values", () => {
    const pts = generatePoints(model("credit-scoring-v3"), 0, new Date("2026-07-01T00:00:00Z"));
    for (const p of pts) {
      expect(Number.isFinite(p.value)).toBe(true);
      expect(p.at).toBe("2026-07-01T00:00:00.000Z");
    }
  });

  it("generateRange produces days*perDay points", () => {
    const pts = generateRange(model("fraud-detector-v2"), new Date("2026-06-01T00:00:00Z"), 30);
    expect(pts.length).toBe(30 * 4); // 4 metric keys, no segmented threshold
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/mrm-simulator && npx vitest run src/engine.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
import { FleetModel, MetricPoint } from "./types.js";
import { metricValue } from "../scenarios/storylines.js";

// Segments a model reports for a metric, derived from its segmented thresholds.
const segmentsFor = (model: FleetModel, metric: string): string[] => {
  const segs = model.thresholds
    .filter((t) => t.metric === metric && t.segment)
    .map((t) => t.segment as string);
  return [...new Set(segs)];
};

export const generatePoints = (model: FleetModel, dayIndex: number, date: Date): MetricPoint[] => {
  const at = date.toISOString();
  const points: MetricPoint[] = [];
  for (const metric of model.metricKeys) {
    // Base (overall) point.
    points.push({
      metric,
      value: Number(metricValue(model.externalKey, metric, dayIndex).toFixed(4)),
      at,
      window: "daily",
      segment: "overall",
      context: { source_job: "nightly-monitor", day_index: dayIndex },
    });
    // Segmented points where a threshold targets a sub-population.
    for (const seg of segmentsFor(model, metric)) {
      points.push({
        metric,
        value: Number(metricValue(model.externalKey, metric, dayIndex, seg).toFixed(4)),
        at,
        window: "daily",
        segment: seg,
        context: { source_job: "nightly-monitor", day_index: dayIndex },
      });
    }
  }
  return points;
};

export const generateRange = (model: FleetModel, startDate: Date, days: number): MetricPoint[] => {
  const all: MetricPoint[] = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(startDate.getTime() + d * 86_400_000);
    all.push(...generatePoints(model, d, date));
  }
  return all;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/mrm-simulator && npx vitest run src/engine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/mrm-simulator/src/engine.ts tools/mrm-simulator/src/engine.test.ts
git commit -m "feat(mrm-sim): metric generation engine"
```

---

### Task 6: Config + localhost guard (TDD)

**Files:**
- Create: `tools/mrm-simulator/src/config.ts`
- Test: `tools/mrm-simulator/src/config.test.ts`

**Interfaces:**
- Consumes: `SimConfig`.
- Produces: `loadConfig(argv: string[]): SimConfig`, `assertSafeTarget(cfg: SimConfig): void`, `readCache(): CacheFile`, `writeCache(c: CacheFile): void`. `CacheFile = { token?: string; models: Record<string, number> }` (externalKey -> modelId).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { loadConfig, assertSafeTarget } from "./config";

describe("config", () => {
  it("defaults to localhost:3000", () => {
    const cfg = loadConfig([]);
    expect(cfg.baseUrl).toBe("http://localhost:3000");
  });

  it("assertSafeTarget allows localhost", () => {
    expect(() => assertSafeTarget(loadConfig([]))).not.toThrow();
  });

  it("assertSafeTarget rejects a remote host without the override flag", () => {
    const cfg = loadConfig(["--base-url", "https://app.example.com"]);
    expect(() => assertSafeTarget(cfg)).toThrow(/refusing/i);
  });

  it("allows a remote host with --i-know-what-im-doing", () => {
    const cfg = loadConfig(["--base-url", "https://app.example.com", "--i-know-what-im-doing"]);
    expect(() => assertSafeTarget(cfg)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/mrm-simulator && npx vitest run src/config.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SimConfig } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(HERE, "..", ".mrm-simulator.json");

export interface CacheFile {
  token?: string;
  models: Record<string, number>; // externalKey -> modelId
}

const flag = (argv: string[], name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};

const has = (argv: string[], name: string): boolean => argv.includes(name);

export const loadConfig = (argv: string[]): SimConfig => ({
  baseUrl: flag(argv, "--base-url") ?? "http://localhost:3000",
  email: process.env.VW_EMAIL ?? "gorkem.cetin@verifywise.ai",
  password: process.env.VW_PASSWORD ?? "Verifywise#1",
  allowRemote: has(argv, "--i-know-what-im-doing"),
});

export const assertSafeTarget = (cfg: SimConfig): void => {
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(cfg.baseUrl);
  if (!isLocal && !cfg.allowRemote) {
    throw new Error(
      `refusing to run against non-localhost target ${cfg.baseUrl}. ` +
        `Pass --i-know-what-im-doing to override (this sends synthetic data).`,
    );
  }
};

export const readCache = (): CacheFile => {
  if (!existsSync(CACHE_PATH)) return { models: {} };
  return JSON.parse(readFileSync(CACHE_PATH, "utf8")) as CacheFile;
};

export const writeCache = (c: CacheFile): void => {
  writeFileSync(CACHE_PATH, JSON.stringify(c, null, 2));
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/mrm-simulator && npx vitest run src/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/mrm-simulator/src/config.ts tools/mrm-simulator/src/config.test.ts
git commit -m "feat(mrm-sim): config, cache, and localhost safety guard"
```

---

### Task 7: HTTP envelope parser (TDD)

**Files:**
- Create: `tools/mrm-simulator/src/httpEnvelope.ts`
- Test: `tools/mrm-simulator/src/httpEnvelope.test.ts`

**Interfaces:**
- Produces: `parseEnvelope<T>(res: Response): Promise<{ status: number; data: T }>` — reads the `{ message, data }` body, returns HTTP status + inner `data`. Throws `HttpError` (with `.status` and `.body`) on non-2xx unless caller opts to inspect.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { parseEnvelope, HttpError } from "./httpEnvelope";

const fakeRes = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("httpEnvelope", () => {
  it("returns inner data on 2xx", async () => {
    const r = await parseEnvelope<{ token: string }>(fakeRes(202, { message: "Accepted", data: { token: "t" } }));
    expect(r.status).toBe(202);
    expect(r.data.token).toBe("t");
  });

  it("throws HttpError on non-2xx with the parsed body", async () => {
    await expect(parseEnvelope(fakeRes(404, { message: "Not Found", data: "Model not found for this key" }))).rejects.toBeInstanceOf(HttpError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/mrm-simulator && npx vitest run src/httpEnvelope.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
export class HttpError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`HTTP ${status}: ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

export const parseEnvelope = async <T>(res: Response): Promise<{ status: number; data: T }> => {
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(res.status, text);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new HttpError(res.status, body);
  }
  const data = (body as { data: T }).data;
  return { status: res.status, data };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/mrm-simulator && npx vitest run src/httpEnvelope.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/mrm-simulator/src/httpEnvelope.ts tools/mrm-simulator/src/httpEnvelope.test.ts
git commit -m "feat(mrm-sim): response envelope parser"
```

---

### Task 8: JWT client and ingestion client

**Files:**
- Create: `tools/mrm-simulator/src/jwtClient.ts`
- Create: `tools/mrm-simulator/src/ingestClient.ts`

**Interfaces:**
- Consumes: `SimConfig`, `parseEnvelope`, `MetricPoint`, `IngestResultPoint`, `ThresholdSpec`.
- Produces (jwtClient): `class JwtClient` with `login()`, `createModel(name, provider)`, `setExternalKey(modelId, key)`, `assignTier(modelId, tier, drivers)`, `createMetricKey(key)`, `createThreshold(modelId, spec)`, `createIngestionToken(name)`, and read-backs `getAttestationSummary()`, `getRevalidationEvents(modelId)`, `getValidations(modelId)`, `getBreaches(modelId, metric)`.
- Produces (ingestClient): `class IngestClient` with `pushBatch(externalKey, points): Promise<IngestResultPoint[]>`.

- [ ] **Step 1: Write jwtClient.ts**

```typescript
import { SimConfig, ThresholdSpec } from "./types.js";
import { parseEnvelope } from "./httpEnvelope.js";

export class JwtClient {
  private token = "";
  constructor(private cfg: SimConfig) {}

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  async login(): Promise<void> {
    const res = await fetch(`${this.cfg.baseUrl}/api/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.cfg.email, password: this.cfg.password }),
    });
    const { data } = await parseEnvelope<{ token: string }>(res);
    this.token = data.token;
  }

  async createModel(name: string, provider: string): Promise<number> {
    const res = await fetch(`${this.cfg.baseUrl}/api/modelInventory`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model: name, provider, status: "Approved" }),
    });
    const { data } = await parseEnvelope<{ id: number }>(res);
    return data.id;
  }

  async setExternalKey(modelId: number, key: string): Promise<void> {
    const res = await fetch(`${this.cfg.baseUrl}/api/modelInventory/${modelId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify({ external_key: key }),
    });
    await parseEnvelope(res);
  }

  async assignTier(modelId: number, tier: "1" | "2" | "3", drivers: string): Promise<void> {
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/models/${modelId}/tier`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ tier, materiality_drivers: drivers }),
    });
    await parseEnvelope(res);
  }

  async createMetricKey(key: string): Promise<void> {
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/metric-keys`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ key }),
    });
    // 409 (already exists) is fine — swallow it.
    if (res.status !== 409) await parseEnvelope(res);
  }

  async createThreshold(modelId: number, spec: ThresholdSpec): Promise<void> {
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/models/${modelId}/thresholds`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(spec),
    });
    await parseEnvelope(res);
  }

  async createIngestionToken(name: string): Promise<string> {
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/ingestion-tokens`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ name, model_inventory_id: null }),
    });
    const { data } = await parseEnvelope<{ token: string }>(res);
    return data.token;
  }

  async getAttestationSummary(): Promise<any> {
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/attestation/summary`, { headers: this.headers() });
    const { data } = await parseEnvelope<any>(res);
    return data;
  }

  async getRevalidationEvents(modelId: number): Promise<any[]> {
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/models/${modelId}/revalidation-events`, { headers: this.headers() });
    const { data } = await parseEnvelope<any[]>(res);
    return data;
  }

  async getValidations(modelId: number): Promise<any[]> {
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/validations?modelId=${modelId}`, { headers: this.headers() });
    const { data } = await parseEnvelope<any[]>(res);
    return data;
  }

  async getBreaches(modelId: number, metric?: string): Promise<any[]> {
    const q = metric ? `?metric=${encodeURIComponent(metric)}` : "";
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/models/${modelId}/monitoring/breaches${q}`, { headers: this.headers() });
    const { data } = await parseEnvelope<any[]>(res);
    return data;
  }
}
```

- [ ] **Step 2: Write ingestClient.ts**

```typescript
import { SimConfig, MetricPoint, IngestResultPoint } from "./types.js";
import { parseEnvelope } from "./httpEnvelope.js";

export class IngestClient {
  constructor(private cfg: SimConfig, private token: string) {}

  async pushBatch(externalKey: string, points: MetricPoint[]): Promise<IngestResultPoint[]> {
    const res = await fetch(
      `${this.cfg.baseUrl}/api/mrm/models/${encodeURIComponent(externalKey)}/metrics`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ points }),
      },
    );
    const { data } = await parseEnvelope<{ accepted: number; results: IngestResultPoint[] }>(res);
    return data.results;
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd tools/mrm-simulator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add tools/mrm-simulator/src/jwtClient.ts tools/mrm-simulator/src/ingestClient.ts
git commit -m "feat(mrm-sim): JWT and ingestion HTTP clients"
```

---

### Task 9: Setup orchestration

**Files:**
- Create: `tools/mrm-simulator/src/setup.ts`

**Interfaces:**
- Consumes: `FLEET`, `JwtClient`, `readCache`/`writeCache`, `SimConfig`.
- Produces: `runSetup(cfg: SimConfig): Promise<{ token: string; models: Record<string, number>; findings: Finding[] }>`. Idempotent: if a model's externalKey is already in the cache, reuse the id and skip creation.

- [ ] **Step 1: Write setup.ts**

```typescript
import { SimConfig, Finding } from "./types.js";
import { JwtClient } from "./jwtClient.js";
import { FLEET } from "../scenarios/fleet.js";
import { readCache, writeCache } from "./config.js";

export const runSetup = async (
  cfg: SimConfig,
): Promise<{ token: string; models: Record<string, number>; findings: Finding[] }> => {
  const findings: Finding[] = [];
  const cache = readCache();
  const client = new JwtClient(cfg);
  await client.login();

  for (const model of FLEET) {
    if (cache.models[model.externalKey]) continue; // idempotent reuse

    const modelId = await client.createModel(model.name, model.provider);

    // external_key is NOT on the tier endpoint — set it via modelInventory PATCH.
    // This split is itself a contract friction worth recording.
    await client.setExternalKey(modelId, model.externalKey);
    findings.push({
      category: "contract",
      severity: "low",
      title: "external_key requires a separate PATCH call",
      expected: "Setting the ingestion key alongside tier in one MRM call",
      actual: "external_key is only settable via PATCH /api/modelInventory/:id, separate from PUT /api/mrm/models/:id/tier",
      repro: "Attempt to set external_key in the tier PUT body; it is ignored.",
    });

    await client.assignTier(modelId, model.tier, model.materialityDrivers);
    for (const key of model.metricKeys) await client.createMetricKey(key);
    for (const spec of model.thresholds) await client.createThreshold(modelId, spec);

    cache.models[model.externalKey] = modelId;
    writeCache(cache);
  }

  if (!cache.token) {
    cache.token = await client.createIngestionToken("mrm-simulator");
    writeCache(cache);
  }

  return { token: cache.token, models: cache.models, findings };
};
```

- [ ] **Step 2: Typecheck**

Run: `cd tools/mrm-simulator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add tools/mrm-simulator/src/setup.ts
git commit -m "feat(mrm-sim): idempotent fleet + threshold + token setup"
```

---

### Task 10: Verify (gap checks) + report (TDD for report)

**Files:**
- Create: `tools/mrm-simulator/src/verify.ts`
- Create: `tools/mrm-simulator/src/report.ts`
- Test: `tools/mrm-simulator/src/report.test.ts`

**Interfaces:**
- Consumes: `JwtClient`, `FLEET`, cache, `Finding`, per-point ingest results.
- Produces (verify): `runVerify(cfg, models, ingestResults): Promise<Finding[]>` — checks the governance loop closed. `runContractChecks(ingestResults): Finding[]` — flags engineered breaches that came back `ok`/`no_threshold`.
- Produces (report): `renderReport(findings: Finding[]): string` and `writeReport(findings: Finding[]): void`.

- [ ] **Step 1: Write the failing test for report**

```typescript
import { describe, it, expect } from "vitest";
import { renderReport } from "./report";
import { Finding } from "./types";

describe("report", () => {
  it("groups findings by category with a summary count", () => {
    const findings: Finding[] = [
      { category: "contract", severity: "high", title: "A", expected: "x", actual: "y", repro: "z" },
      { category: "workflow", severity: "medium", title: "B", expected: "x", actual: "y", repro: "z" },
    ];
    const md = renderReport(findings);
    expect(md).toContain("# MRM simulator — gap report");
    expect(md).toContain("2 findings");
    expect(md).toContain("## Contract");
    expect(md).toContain("## Workflow");
    expect(md).toContain("A");
  });

  it("renders a clean bill of health when there are no findings", () => {
    const md = renderReport([]);
    expect(md).toContain("No gaps found");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/mrm-simulator && npx vitest run src/report.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write report.ts**

```typescript
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Finding } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(HERE, "..", "gaps-report.md");

const CATEGORIES: Finding["category"][] = ["contract", "workflow", "ux"];
const title = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

export const renderReport = (findings: Finding[]): string => {
  const lines: string[] = ["# MRM simulator — gap report", ""];
  lines.push(`${findings.length} findings.`, "");
  if (findings.length === 0) {
    lines.push("No gaps found. The MRM governance loop behaved as documented.");
    return lines.join("\n");
  }
  for (const cat of CATEGORIES) {
    const group = findings.filter((f) => f.category === cat);
    if (group.length === 0) continue;
    lines.push(`## ${title(cat)}`, "");
    for (const f of group) {
      lines.push(`### [${f.severity}] ${f.title}`);
      lines.push(`- **Expected:** ${f.expected}`);
      lines.push(`- **Actual:** ${f.actual}`);
      lines.push(`- **Repro:** ${f.repro}`);
      lines.push("");
    }
  }
  return lines.join("\n");
};

export const writeReport = (findings: Finding[]): void => {
  writeFileSync(REPORT_PATH, renderReport(findings));
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/mrm-simulator && npx vitest run src/report.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write verify.ts**

```typescript
import { SimConfig, Finding, IngestResultPoint } from "./types.js";
import { JwtClient } from "./jwtClient.js";
import { FLEET } from "../scenarios/fleet.js";

// Which (externalKey, metric) pairs we engineered to breach during backfill.
const EXPECTED_BREACHES: { externalKey: string; metric: string }[] = [
  { externalKey: "credit-scoring-v3", metric: "psi" },
  { externalKey: "loan-approval-v1", metric: "gini" },
  { externalKey: "churn-propensity-v1", metric: "psi" },
];

// Contract check: engineered breaches must appear as warn/breach in results.
export const runContractChecks = (
  resultsByKey: Record<string, IngestResultPoint[]>,
): Finding[] => {
  const findings: Finding[] = [];
  for (const exp of EXPECTED_BREACHES) {
    const results = resultsByKey[exp.externalKey] ?? [];
    const hit = results.some(
      (r) => r.metric === exp.metric && (r.status === "breach" || r.status === "warn"),
    );
    if (!hit) {
      findings.push({
        category: "contract",
        severity: "high",
        title: `Engineered breach never fired for ${exp.externalKey}/${exp.metric}`,
        expected: `At least one warn/breach status for ${exp.metric}`,
        actual: "All points returned ok/no_threshold — threshold match or setup gap",
        repro: `Backfill ${exp.externalKey} and inspect per-point statuses for ${exp.metric}`,
      });
    }
  }
  return findings;
};

// Workflow check: a flagged breach should have opened a revalidation event/task.
export const runVerify = async (
  cfg: SimConfig,
  models: Record<string, number>,
): Promise<Finding[]> => {
  const findings: Finding[] = [];
  const client = new JwtClient(cfg);
  await client.login();

  // credit-scoring-v3 psi breach is notify_flag_revalidation -> expect an event.
  const creditId = models["credit-scoring-v3"];
  if (creditId) {
    const events = await client.getRevalidationEvents(creditId);
    if (events.length === 0) {
      findings.push({
        category: "workflow",
        severity: "high",
        title: "PSI breach did not create a revalidation event",
        expected: "A revalidation event (source=breach) after credit-scoring-v3 PSI crossed 0.20",
        actual: "GET /revalidation-events returned an empty list",
        repro: "Backfill 30d, then GET /api/mrm/models/<credit-scoring-v3 id>/revalidation-events",
      });
    }
  }

  // Attestation should reflect the fleet (>=4 models, some breaches).
  const summary = await client.getAttestationSummary();
  if (summary.models_total < FLEET.length) {
    findings.push({
      category: "workflow",
      severity: "medium",
      title: "Attestation summary undercounts the fleet",
      expected: `models_total >= ${FLEET.length}`,
      actual: `models_total = ${summary.models_total}`,
      repro: "GET /api/mrm/attestation/summary after setup + backfill",
    });
  }

  // UX checklist finding (always emitted — a guided manual pass).
  findings.push({
    category: "ux",
    severity: "low",
    title: "Manual UI review checklist",
    expected: "Monitoring trends, breach chips, revalidation 'Triggered by', and attestation status look correct",
    actual: "Not auto-verifiable — open the URLs and confirm visually",
    repro:
      "Open /model-inventory/model-risk-management (Monitoring, Validation drawer, Overview) and eyeball each model",
  });

  return findings;
};
```

- [ ] **Step 6: Typecheck + run report test**

Run: `cd tools/mrm-simulator && npx tsc --noEmit && npx vitest run src/report.test.ts`
Expected: no type errors; report tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/mrm-simulator/src/verify.ts tools/mrm-simulator/src/report.ts tools/mrm-simulator/src/report.test.ts
git commit -m "feat(mrm-sim): verification gap-checks and report renderer"
```

---

### Task 11: CLI wiring + README

**Files:**
- Create: `tools/mrm-simulator/src/cli.ts`
- Create: `tools/mrm-simulator/README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the runnable CLI. Commands: `setup`, `backfill [--days N]`, `live [--interval Ns]`, `verify`, `report`, `teardown`. `--dry-run` on backfill/live prints without POSTing.

- [ ] **Step 1: Write cli.ts**

```typescript
import { loadConfig, assertSafeTarget, readCache, writeCache } from "./config.js";
import { runSetup } from "./setup.js";
import { runVerify, runContractChecks } from "./verify.js";
import { writeReport } from "./report.js";
import { IngestClient } from "./ingestClient.js";
import { generateRange, generatePoints } from "./engine.js";
import { FLEET } from "../scenarios/fleet.js";
import { Finding, IngestResultPoint, MetricPoint } from "./types.js";

const arg = (name: string, def: string): string => {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
};
const dryRun = process.argv.includes("--dry-run");

const chunk = <T>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  const cmd = process.argv[2];
  const cfg = loadConfig(process.argv);
  assertSafeTarget(cfg);

  if (cmd === "setup") {
    const { token, models, findings } = await runSetup(cfg);
    console.log(`setup complete. token cached. models: ${Object.keys(models).join(", ")}`);
    const cache = readCache();
    cache.token = token;
    writeCache(cache);
    if (findings.length) console.log(`${findings.length} setup finding(s) recorded`);
    return;
  }

  if (cmd === "backfill") {
    const days = Number(arg("--days", "30"));
    const cache = readCache();
    if (!cache.token) throw new Error("run `setup` first (no token cached)");
    const client = new IngestClient(cfg, cache.token);
    const start = new Date(Date.now() - days * 86_400_000);
    const resultsByKey: Record<string, IngestResultPoint[]> = {};
    for (const model of FLEET) {
      const points = generateRange(model, start, days);
      if (dryRun) {
        console.log(`[dry-run] ${model.externalKey}: ${points.length} points`);
        continue;
      }
      resultsByKey[model.externalKey] = [];
      for (const batch of chunk(points, 200)) {
        const results = await client.pushBatch(model.externalKey, batch);
        resultsByKey[model.externalKey].push(...results);
      }
      const breaches = resultsByKey[model.externalKey].filter((r) => r.status === "breach" || r.status === "warn").length;
      console.log(`${model.externalKey}: pushed ${points.length}, ${breaches} warn/breach`);
    }
    if (!dryRun) {
      cache.lastBackfill = new Date(start.getTime()).toISOString();
      writeCache(cache);
      const contractFindings = runContractChecks(resultsByKey);
      writeReport(contractFindings);
    }
    return;
  }

  if (cmd === "live") {
    const interval = Number(arg("--interval", "5").replace("s", "")) * 1000;
    const cache = readCache();
    if (!cache.token) throw new Error("run `setup` first");
    const client = new IngestClient(cfg, cache.token);
    let day = 0;
    console.log(`live mode: pushing every ${interval / 1000}s (Ctrl-C to stop)`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      for (const model of FLEET) {
        const points = generatePoints(model, day, new Date());
        if (dryRun) {
          console.log(`[dry-run] ${model.externalKey} day ${day}: ${points.length} points`);
        } else {
          const results = await client.pushBatch(model.externalKey, points);
          const b = results.filter((r) => r.status === "breach" || r.status === "warn").length;
          if (b) console.log(`${model.externalKey} day ${day}: ${b} warn/breach`);
        }
      }
      day++;
      await sleep(interval);
    }
  }

  if (cmd === "verify") {
    const cache = readCache();
    const findings: Finding[] = await runVerify(cfg, cache.models);
    writeReport(findings);
    console.log(`verify complete: ${findings.length} finding(s) -> gaps-report.md`);
    return;
  }

  if (cmd === "report") {
    console.log("gaps-report.md is written by `backfill` and `verify`.");
    return;
  }

  if (cmd === "teardown") {
    console.log("teardown: decommission the created models in the UI, then delete .mrm-simulator.json");
    return;
  }

  console.log("usage: sim <setup|backfill|live|verify|report|teardown> [--days N] [--interval Ns] [--dry-run] [--base-url URL]");
};

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

Note: this references `cache.lastBackfill`. Add `lastBackfill?: string` to the `CacheFile` interface in `src/config.ts` as part of this step.

- [ ] **Step 2: Add `lastBackfill` to CacheFile**

In `src/config.ts`, update the interface:

```typescript
export interface CacheFile {
  token?: string;
  models: Record<string, number>;
  lastBackfill?: string;
}
```

- [ ] **Step 3: Write README.md**

```markdown
# MRM model-eval simulator

A standalone tool that impersonates a model-monitoring platform and feeds
scenario-driven metrics into VerifyWise's MRM ingestion API, then reports gaps.

## Prerequisites

- VerifyWise backend running locally (`http://localhost:3000`) with an admin login.
- Node 22+.

## Install

```bash
cd tools/mrm-simulator
npm install
```

## Usage

```bash
npm run sim setup                 # create fleet + thresholds + token (idempotent)
npm run sim backfill --days 30    # push 30 days of history
npm run sim live --interval 5s    # keep pushing; watch a breach happen
npm run sim verify                # read MRM back, write gaps-report.md
```

Add `--dry-run` to `backfill`/`live` to print without POSTing.
Credentials come from `VW_EMAIL` / `VW_PASSWORD` (default dev creds).
The tool refuses non-localhost targets unless `--i-know-what-im-doing` is passed.

## Output

`gaps-report.md` — categorised findings (Contract / Workflow / UX) to triage
against the MRM feature.
```

- [ ] **Step 4: Typecheck**

Run: `cd tools/mrm-simulator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add tools/mrm-simulator/src/cli.ts tools/mrm-simulator/src/config.ts tools/mrm-simulator/README.md
git commit -m "feat(mrm-sim): CLI commands and README"
```

---

### Task 12: End-to-end run against local backend

**Files:** none (execution + first report).

**Interfaces:** consumes the whole tool.

- [ ] **Step 1: Confirm backend is up**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/mrm/attestation/summary`
Expected: `401` (needs auth) — proves the server is up and the route exists.

- [ ] **Step 2: Dry-run backfill (no writes)**

Run: `cd tools/mrm-simulator && npm run sim setup && npm run sim backfill --days 30 --dry-run`
Expected: setup prints the 4 models; dry-run prints point counts per model.

- [ ] **Step 3: Real backfill**

Run: `npm run sim backfill --days 30`
Expected: each model prints pushed count; `credit-scoring-v3`, `loan-approval-v1`, `churn-propensity-v1` report > 0 warn/breach; `fraud-detector-v2` reports 0.

- [ ] **Step 4: Verify + read the report**

Run: `npm run sim verify && cat gaps-report.md`
Expected: `gaps-report.md` exists, categorised. Triage any high-severity contract/workflow findings.

- [ ] **Step 5: Commit the plan-completion note (not the generated report)**

```bash
# gaps-report.md and .mrm-simulator.json are git-ignored; nothing to commit here.
echo "End-to-end run complete. Review gaps-report.md."
```

---

## Self-review

**Spec coverage:**
- Purpose (demo/test/reference/gap-finder) → Tasks 3–12 ✓
- Wire contract (auth, batch, fields, idempotency, ops, envelope) → Global Constraints + Tasks 7, 8 ✓
- Scenario fleet + storylines + thresholds → Tasks 3, 4 ✓
- Backfill + live + full setup → Tasks 9, 11 ✓
- Gap-finding → categorised report → Tasks 10, 11 ✓
- Seeded `vw_mrm_` vs `mrm_` discrepancy → captured in Global Constraints (auth header) and surfaced as the `external_key` split finding in Task 9; the `vw_mrm_` UI-copy gap is a UX finding to add during the run.
- Safety (localhost guard, dry-run, ignored cache) → Task 6, .gitignore ✓
- Testing (pure units + live verify) → Tasks 3, 5, 6, 7, 10, 12 ✓

**Placeholder scan:** No TBD/TODO. Every code step shows complete code; every run step shows the command and expected output.

**Type consistency:** `MetricPoint`, `Finding`, `IngestResultPoint`, `FleetModel`, `ThresholdSpec`, `CacheFile` are defined once and used consistently. `runContractChecks` takes `Record<string, IngestResultPoint[]>` (matches cli usage). `runVerify(cfg, models)` matches cli call. `renderReport`/`writeReport` signatures consistent.

**Known follow-up:** the `vw_mrm_` UI copy is a real gap; recording it as a UX finding during Task 12 is the intended outcome, not a plan defect.
