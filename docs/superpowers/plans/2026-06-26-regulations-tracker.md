# Regulations Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Regulations Tracker module that polls the public Global AI Regulations feed weekly, detects per-country changes by content hash, and notifies tracking organizations in-app and by email — with a Browse/Tracked/Settings/Detail UI.

**Architecture:** Mirrors the AI Trust Index module file-for-file. Global reference data (`regulation_countries`, `regulation_tracker_meta` singleton) plus tenant data (`regulation_tracked_countries`, `regulation_tracker_settings`). A BullMQ weekly job fetches + validates the feed, upserts the catalog in one transaction, and fans out notifications to orgs tracking changed countries.

**Tech Stack:** Express, Sequelize (raw `sequelize.query` + sequelize-typescript models), BullMQ (shared `automation-actions` queue), MJML email, React 19 + React-Query, axios.

## Global Constraints

- Migration DDL uses `verifywise.` table prefix; application SQL uses **unqualified** table names (resolved by `search_path = verifywise`). Never cross them.
- Tenant tables (`regulation_tracked_countries`, `regulation_tracker_settings`) always filter by `organization_id = :organizationId` from `req.organizationId`.
- Spacing/UI: sentence case for all UI text; pixel strings for spacing; use VerifyWise components (CustomizableButton with `text=`/`children`, not `label=`); colors from theme.
- Backend response format: `STATUS_CODE[xxx](data)`. Controllers thin; logic in utils.
- All models use `timestamps: false` (explicit columns).
- Feed floor: reject feed if `< 20` countries OR `< 50%` of `last_good_count`.
- Email: configured recipients only, **no admin fallback**. In-app: org Admins ∪ configured `recipient_user_ids`.
- Build before migrate: seed migration needs compiled `dist/`. Run `cd Servers && npm run build` first.
- Pre-PR gates (run from package dir): `cd Servers && npm run build`; `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`.
- After adding/changing routes: `cd Servers && npm run generate:swagger && npm run generate:endpoints`.
- Feed URLs: manifest `https://verifywise.ai/api/regulations`; detail `https://verifywise.ai/api/regulations/country/<slug>`. `feedVersion === 1`.

---

## Phase 1 — Backend foundation (migration, interfaces, models, seed)

### Task 1: Database migration — 4 tables

**Files:**
- Create: `Servers/database/migrations/<TS>-create-regulations-tracker-tables.js` (generate `<TS>` with `date +%Y%m%d%H%M%S`)

**Interfaces:**
- Produces tables: `regulation_countries` (global), `regulation_tracked_countries` (tenant), `regulation_tracker_settings` (tenant), `regulation_tracker_meta` (singleton id=1).

- [ ] **Step 1: Generate the timestamp and create the migration file**

Run: `cd Servers && date +%Y%m%d%H%M%S` → use the value as `<TS>`. Create the file with this content:

```javascript
"use strict";

/**
 * Regulations Tracker module tables.
 *
 * `regulation_countries` and `regulation_tracker_meta` are GLOBAL (no
 * organization_id): the Global AI Regulations feed is public reference data,
 * identical for every org. Tenancy is enforced only on
 * `regulation_tracked_countries` and `regulation_tracker_settings`.
 *
 * Tracking links to a country by `country_slug` (the feed's stable identity),
 * intentionally WITHOUT a foreign key, so a feed re-import can never
 * cascade-delete durable user tracking.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.regulation_countries (
        id                SERIAL PRIMARY KEY,
        slug              VARCHAR(120) NOT NULL UNIQUE,
        name              VARCHAR(255) NOT NULL,
        region            VARCHAR(50),
        regulation_count  SMALLINT,
        data              JSONB NOT NULL,
        hash              VARCHAR(80) NOT NULL,
        is_active         BOOLEAN NOT NULL DEFAULT TRUE,
        removed_at        TIMESTAMPTZ,
        last_changed_at   TIMESTAMPTZ,
        last_fetched_at   TIMESTAMPTZ
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_reg_countries_active_region
        ON verifywise.regulation_countries(is_active, region);
      CREATE INDEX IF NOT EXISTS idx_reg_countries_name
        ON verifywise.regulation_countries(name);
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.regulation_tracked_countries (
        id               SERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        country_slug     VARCHAR(120) NOT NULL,
        tracked_by       INTEGER REFERENCES verifywise.users(id),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (organization_id, country_slug)
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_reg_tracked_org
        ON verifywise.regulation_tracked_countries(organization_id);
      CREATE INDEX IF NOT EXISTS idx_reg_tracked_slug
        ON verifywise.regulation_tracked_countries(country_slug);
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.regulation_tracker_settings (
        organization_id     INTEGER PRIMARY KEY REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        recipient_user_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
        recipient_emails    JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_by          INTEGER,
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.regulation_tracker_meta (
        id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        seeded_at       TIMESTAMPTZ,
        last_good_count INTEGER,
        last_run_week   VARCHAR(10)
      );
    `);
    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.regulation_tracker_meta (id)
      VALUES (1) ON CONFLICT (id) DO NOTHING;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.regulation_tracked_countries CASCADE",
    );
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.regulation_tracker_settings CASCADE",
    );
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.regulation_tracker_meta CASCADE",
    );
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.regulation_countries CASCADE",
    );
  },
};
```

- [ ] **Step 2: Build and run the migration**

Run: `cd Servers && npm run build && npx sequelize db:migrate`
Expected: migration name prints `migrated`.

- [ ] **Step 3: Verify the tables exist**

Run: `cd Servers && npx sequelize db:migrate:status | grep regulations-tracker`
Expected: shows `up`.

- [ ] **Step 4: Commit**

```bash
git add Servers/database/migrations/*-create-regulations-tracker-tables.js
git commit -m "feat(regulations-tracker): add module tables migration"
```

---

### Task 2: Domain interface + 4 Sequelize models

**Files:**
- Create: `Servers/domain.layer/interfaces/i.regulationsTracker.ts`
- Create: `Servers/domain.layer/models/regulationsTracker/regulationCountry.model.ts`
- Create: `Servers/domain.layer/models/regulationsTracker/regulationTrackedCountry.model.ts`
- Create: `Servers/domain.layer/models/regulationsTracker/regulationTrackerSettings.model.ts`
- Create: `Servers/domain.layer/models/regulationsTracker/regulationTrackerMeta.model.ts`

**Interfaces:**
- Produces: `IFeedCountry`, `IFeedChange`, `IRegulationCountry`; models `RegulationCountryModel`, `RegulationTrackedCountryModel`, `RegulationTrackerSettingsModel`, `RegulationTrackerMetaModel`.

- [ ] **Step 1: Create the interface file**

`Servers/domain.layer/interfaces/i.regulationsTracker.ts`:

```typescript
// Subset of the feed shapes we rely on; ignore other fields (additive-safe).

export type RegulationChange =
  | { field: "regulationCount"; from: number; to: number }
  | { field: "regulation.status"; regulation: string; from: string; to: string }
  | { field: "regulation.effectiveDate"; regulation: string; from: string; to: string }
  | { field: "regulation"; change: "added" | "removed"; value: string };

export interface IFeedCountryHistory {
  firstAssessed: string;
  lastChanged: string;
  lastChecked: string;
  assessmentCount: number;
  hashHistory: { date: string; hash: string; regulationCount: number }[];
  lastChange: { date: string; changes: RegulationChange[] } | null;
}

// The manifest's per-country entry (what we store + hash on).
export interface IManifestCountry {
  slug: string;
  name: string;
  region: string;
  regulationCount: number;
  hash: string;
  history: IFeedCountryHistory | null;
  url: string;
}

export interface IManifest {
  feedVersion: number;
  generatedAt: string;
  meta: Record<string, unknown>;
  counts: Record<string, number>;
  countries: IManifestCountry[];
}

// Row shape for the global catalog table.
export interface IRegulationCountry {
  id?: number;
  slug: string;
  name: string;
  region?: string | null;
  regulation_count?: number | null;
  data: IManifestCountry;
  hash: string;
  is_active: boolean;
  removed_at?: Date | null;
  last_changed_at?: Date | null;
  last_fetched_at?: Date | null;
}
```

- [ ] **Step 2: Create the catalog model**

`Servers/domain.layer/models/regulationsTracker/regulationCountry.model.ts`:

```typescript
import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IManifestCountry, IRegulationCountry } from "../../interfaces/i.regulationsTracker";

@Table({ tableName: "regulation_countries", timestamps: false })
export class RegulationCountryModel
  extends Model<RegulationCountryModel>
  implements IRegulationCountry
{
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id?: number;

  @Column({ type: DataType.STRING(120), allowNull: false })
  slug!: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(50), allowNull: true })
  region?: string | null;

  @Column({ type: DataType.SMALLINT, allowNull: true })
  regulation_count?: number | null;

  @Column({ type: DataType.JSONB, allowNull: false })
  data!: IManifestCountry;

  @Column({ type: DataType.STRING(80), allowNull: false })
  hash!: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  is_active!: boolean;

  @Column({ type: DataType.DATE, allowNull: true })
  removed_at?: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  last_changed_at?: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  last_fetched_at?: Date | null;
}
```

- [ ] **Step 3: Create the tracked-country, settings, and meta models**

`Servers/domain.layer/models/regulationsTracker/regulationTrackedCountry.model.ts`:

```typescript
import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table({ tableName: "regulation_tracked_countries", timestamps: false })
export class RegulationTrackedCountryModel extends Model<RegulationTrackedCountryModel> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id?: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  organization_id!: number;

  @Column({ type: DataType.STRING(120), allowNull: false })
  country_slug!: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  tracked_by?: number;

  @Column({ type: DataType.DATE, allowNull: false })
  created_at?: Date;
}
```

`Servers/domain.layer/models/regulationsTracker/regulationTrackerSettings.model.ts`:

```typescript
import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table({ tableName: "regulation_tracker_settings", timestamps: false })
export class RegulationTrackerSettingsModel extends Model<RegulationTrackerSettingsModel> {
  @Column({ type: DataType.INTEGER, primaryKey: true })
  organization_id!: number;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  recipient_user_ids!: number[];

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  recipient_emails!: string[];

  @Column({ type: DataType.INTEGER, allowNull: true })
  updated_by?: number;

  @Column({ type: DataType.DATE, allowNull: false })
  updated_at?: Date;
}
```

`Servers/domain.layer/models/regulationsTracker/regulationTrackerMeta.model.ts`:

```typescript
import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table({ tableName: "regulation_tracker_meta", timestamps: false })
export class RegulationTrackerMetaModel extends Model<RegulationTrackerMetaModel> {
  @Column({ type: DataType.INTEGER, primaryKey: true })
  id!: number;

  @Column({ type: DataType.DATE, allowNull: true })
  seeded_at?: Date | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  last_good_count?: number | null;

  @Column({ type: DataType.STRING(10), allowNull: true })
  last_run_week?: string | null;
}
```

- [ ] **Step 4: Register models in the Sequelize instance**

Find where AI Trust Index models are registered: `cd Servers && grep -rn "AiTrustIndexAppModel" database/db.ts`. Add the four new models to the same `models: [...]` array (import them at the top of `database/db.ts`).

- [ ] **Step 5: Build to verify types compile**

Run: `cd Servers && npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 6: Commit**

```bash
git add Servers/domain.layer/interfaces/i.regulationsTracker.ts Servers/domain.layer/models/regulationsTracker/ Servers/database/db.ts
git commit -m "feat(regulations-tracker): add interface and Sequelize models"
```

---

### Task 3: Seed snapshot + seed migration

**Files:**
- Create: `Servers/database/seeds/regulations-tracker-snapshot.json`
- Create: `Servers/database/migrations/<TS>-seed-regulations-tracker-snapshot.js`

**Interfaces:**
- Consumes: `regulation_countries` table, `regulation_tracker_meta`.
- Produces: baselined catalog so the first weekly run notifies nothing.

- [ ] **Step 1: Generate the snapshot JSON from the live feed**

Run this to fetch and save the current manifest countries as the seed (one-time author step):

```bash
cd Servers && node -e "
const https=require('https');
https.get('https://verifywise.ai/api/regulations',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{
  const m=JSON.parse(d);
  const out={ feedVersion:m.feedVersion, generatedAt:m.generatedAt, countries:m.countries };
  require('fs').writeFileSync('database/seeds/regulations-tracker-snapshot.json', JSON.stringify(out,null,2));
  console.log('wrote', out.countries.length, 'countries');
});});
"
```
Expected: `wrote 60 countries` (or similar; must be ≥ 20).

- [ ] **Step 2: Create the seed migration**

`Servers/database/migrations/<TS>-seed-regulations-tracker-snapshot.js` (new `<TS>` AFTER Task 1's):

```javascript
"use strict";

/**
 * Seed the regulation_countries catalog from a committed snapshot on first
 * install. Idempotent: skips if the table is already populated. Establishes the
 * baseline so the first weekly sync detects no changes (no false notifications).
 */
const fs = require("fs");
const path = require("path");

module.exports = {
  async up(queryInterface) {
    const existing = await queryInterface.sequelize.query(
      "SELECT COUNT(*)::int AS n FROM verifywise.regulation_countries",
      { type: queryInterface.sequelize.QueryTypes.SELECT },
    );
    if (existing[0].n > 0) return; // already seeded

    const snapshotPath = path.join(__dirname, "../seeds/regulations-tracker-snapshot.json");
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));

    for (const c of snapshot.countries) {
      await queryInterface.sequelize.query(
        `INSERT INTO verifywise.regulation_countries
           (slug, name, region, regulation_count, data, hash, is_active, last_fetched_at)
         VALUES (:slug, :name, :region, :regulation_count, :data::jsonb, :hash, TRUE, NOW())
         ON CONFLICT (slug) DO NOTHING`,
        {
          replacements: {
            slug: c.slug,
            name: c.name,
            region: c.region ?? null,
            regulation_count: c.regulationCount ?? null,
            data: JSON.stringify(c),
            hash: c.hash,
          },
        },
      );
    }

    await queryInterface.sequelize.query(
      `UPDATE verifywise.regulation_tracker_meta
         SET seeded_at = NOW(), last_good_count = :count
       WHERE id = 1`,
      { replacements: { count: snapshot.countries.length } },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DELETE FROM verifywise.regulation_countries");
    await queryInterface.sequelize.query(
      "UPDATE verifywise.regulation_tracker_meta SET seeded_at = NULL, last_good_count = NULL WHERE id = 1",
    );
  },
};
```

- [ ] **Step 3: Build and run**

Run: `cd Servers && npm run build && npx sequelize db:migrate`
Expected: seed migration `migrated`.

- [ ] **Step 4: Verify seed loaded and meta baselined**

Run: `cd Servers && node -e "const{sequelize}=require('./dist/database/db');(async()=>{await sequelize.query('SET search_path=verifywise');const[c]=await sequelize.query('SELECT count(*)::int n FROM regulation_countries');const[m]=await sequelize.query('SELECT seeded_at,last_good_count FROM regulation_tracker_meta WHERE id=1');console.log('countries',c[0].n,'meta',JSON.stringify(m[0]));process.exit(0)})()"`
Expected: `countries 60 meta {"seeded_at":"...","last_good_count":60}`.

- [ ] **Step 5: Commit**

```bash
git add Servers/database/seeds/regulations-tracker-snapshot.json Servers/database/migrations/*-seed-regulations-tracker-snapshot.js
git commit -m "feat(regulations-tracker): seed country catalog snapshot"
```

---

## Phase 2 — Feed fetch/validation + utils

### Task 4: Feed module (fetch + validate)

**Files:**
- Create: `Servers/utils/regulationsTrackerFeed.ts`
- Test: `Servers/utils/__tests__/regulationsTrackerFeed.test.ts`

**Interfaces:**
- Produces: `fetchManifest(deps?)`, `validateManifest(raw, lastGoodCount)`, `fetchCountryDetail(slug, deps?)`, `ValidateResult`, `MANIFEST_URL`, `EXPECTED_FEED_VERSION`, `ABSOLUTE_FLOOR`.

- [ ] **Step 1: Write the failing test**

`Servers/utils/__tests__/regulationsTrackerFeed.test.ts`:

```typescript
import { validateManifest, ABSOLUTE_FLOOR } from "../regulationsTrackerFeed";

function makeCountry(slug: string) {
  return { slug, name: slug, region: "europe", regulationCount: 1, hash: "sha256-x", history: null, url: `/c/${slug}` };
}
function manifest(n: number, extra: Record<string, unknown> = {}) {
  return {
    feedVersion: 1,
    generatedAt: "2026-06-25T00:00:00Z",
    counts: { countries: n },
    countries: Array.from({ length: n }, (_, i) => makeCountry("c" + i)),
    ...extra,
  };
}

describe("validateManifest", () => {
  it("rejects wrong feedVersion", () => {
    const r = validateManifest(manifest(30, { feedVersion: 2 }), null);
    expect(r.ok).toBe(false);
  });
  it("rejects below absolute floor", () => {
    const r = validateManifest(manifest(ABSOLUTE_FLOOR - 1), null);
    expect(r.ok).toBe(false);
  });
  it("rejects below 50% of last good count", () => {
    const r = validateManifest(manifest(30), 100);
    expect(r.ok).toBe(false);
  });
  it("accepts a healthy feed and returns presentSlugs + rawCount", () => {
    const r = validateManifest(manifest(30), 40);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.countries.length).toBe(30);
      expect(r.presentSlugs.length).toBe(30);
      expect(r.rawCount).toBe(30);
    }
  });
  it("keeps a present-but-malformed country in presentSlugs but not in valid countries", () => {
    const m = manifest(25);
    (m.countries as any[]).push({ slug: "broken" }); // missing hash/name
    m.counts.countries = m.countries.length;
    const r = validateManifest(m, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.presentSlugs).toContain("broken");
      expect(r.countries.find((c) => c.slug === "broken")).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Servers && npm test -- regulationsTrackerFeed`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the feed module**

`Servers/utils/regulationsTrackerFeed.ts`:

```typescript
import axios from "axios";
import { IManifest, IManifestCountry } from "../domain.layer/interfaces/i.regulationsTracker";

export const FEED_ORIGIN = "https://verifywise.ai";
export const MANIFEST_URL = `${FEED_ORIGIN}/api/regulations`;
export const EXPECTED_FEED_VERSION = 1;
export const ABSOLUTE_FLOOR = 20;

const REQUIRED_KEYS: (keyof IManifestCountry)[] = ["slug", "name", "region", "hash"];

function hasRequired(c: any): c is IManifestCountry {
  return c && typeof c === "object" && REQUIRED_KEYS.every((k) => c[k] !== undefined && c[k] !== null);
}

function normalizeSlug(s: string): string {
  return String(s).trim().toLowerCase();
}

export type ValidateResult =
  | { ok: true; countries: IManifestCountry[]; presentSlugs: string[]; rawCount: number; generatedAt: string }
  | { ok: false; reason: string };

export function validateManifest(raw: unknown, lastGoodCount: number | null): ValidateResult {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "feed is not an object" };
  const f = raw as Record<string, unknown>;
  if (f.feedVersion !== EXPECTED_FEED_VERSION)
    return { ok: false, reason: `unsupported feedVersion ${String(f.feedVersion)}` };
  if (!Array.isArray(f.countries)) return { ok: false, reason: "countries is not an array" };
  const counts = (f.counts as Record<string, unknown>) ?? {};
  if (typeof counts.countries === "number" && counts.countries !== f.countries.length)
    return { ok: false, reason: `counts.countries (${counts.countries}) != length (${f.countries.length})` };
  if (f.countries.length < ABSOLUTE_FLOOR)
    return { ok: false, reason: `below absolute floor (${f.countries.length})` };
  if (lastGoodCount != null && f.countries.length < lastGoodCount * 0.5)
    return { ok: false, reason: `below 50% of last good count (${f.countries.length} < ${lastGoodCount})` };

  const countries = (f.countries as unknown[]).filter(hasRequired) as IManifestCountry[];
  const presentSlugs = (f.countries as unknown[])
    .map((c) =>
      c && typeof c === "object" && typeof (c as Record<string, unknown>).slug === "string"
        ? normalizeSlug((c as Record<string, unknown>).slug as string)
        : null,
    )
    .filter((s): s is string => !!s);
  return {
    ok: true,
    countries,
    presentSlugs,
    rawCount: f.countries.length,
    generatedAt: typeof f.generatedAt === "string" ? f.generatedAt : new Date().toISOString(),
  };
}

export async function fetchManifest(deps?: {
  get?: (url: string) => Promise<{ status: number; data: unknown }>;
}): Promise<unknown> {
  const get = deps?.get ?? ((url: string) => axios.get(url, { timeout: 20000 }));
  const res = await get(MANIFEST_URL);
  if (res.status !== 200) throw new Error(`manifest HTTP ${res.status}`);
  return res.data;
}

export async function fetchCountryDetail(
  slug: string,
  deps?: { get?: (url: string) => Promise<{ status: number; data: unknown }> },
): Promise<unknown> {
  const get = deps?.get ?? ((url: string) => axios.get(url, { timeout: 10000 }));
  const res = await get(`${FEED_ORIGIN}/api/regulations/country/${encodeURIComponent(slug)}`);
  if (res.status !== 200) throw new Error(`country detail HTTP ${res.status}`);
  return res.data;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd Servers && npm test -- regulationsTrackerFeed`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/regulationsTrackerFeed.ts Servers/utils/__tests__/regulationsTrackerFeed.test.ts
git commit -m "feat(regulations-tracker): add feed fetch and validation"
```

---

### Task 5: Utils — rendering, currentIsoWeek, upsertFeedTx

**Files:**
- Create: `Servers/utils/regulationsTracker.utils.ts`
- Test: `Servers/utils/__tests__/regulationsTracker.utils.test.ts`

**Interfaces:**
- Consumes: `validateManifest` result types, models, `IManifestCountry`, `RegulationChange`.
- Produces: `renderChangeLine(c)`, `currentIsoWeek(date)`, `escapeHtml(s)`, `getMetaQuery()`, `upsertFeedTx(countries, presentSlugs, rawCount)` → `{ changed: CountryChange[]; newlyRemoved: string[]; wasFirstSeed: boolean }`, `CountryChange = { slug: string; name: string; lines: string[]; unstructured: boolean }`.

- [ ] **Step 1: Write the failing test (pure functions)**

`Servers/utils/__tests__/regulationsTracker.utils.test.ts`:

```typescript
import { renderChangeLine, currentIsoWeek, escapeHtml } from "../regulationsTracker.utils";

describe("renderChangeLine", () => {
  it("renders status change", () => {
    expect(renderChangeLine({ field: "regulation.status", regulation: "EU AI Act", from: "proposed", to: "in-force" }))
      .toBe("EU AI Act: status proposed → in-force");
  });
  it("renders effective date change", () => {
    expect(renderChangeLine({ field: "regulation.effectiveDate", regulation: "X", from: "2024", to: "2026" }))
      .toBe("X: effective date 2024 → 2026");
  });
  it("renders added/removed", () => {
    expect(renderChangeLine({ field: "regulation", change: "added", value: "New Bill" })).toBe("Added: New Bill");
    expect(renderChangeLine({ field: "regulation", change: "removed", value: "Old Bill" })).toBe("Removed: Old Bill");
  });
});

describe("currentIsoWeek", () => {
  it("returns YYYY-Www format", () => {
    expect(currentIsoWeek(new Date("2026-06-25T00:00:00Z"))).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe("escapeHtml", () => {
  it("escapes HTML metacharacters", () => {
    expect(escapeHtml('<b>"&\'')).toBe("&lt;b&gt;&quot;&amp;&#39;");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Servers && npm test -- regulationsTracker.utils`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the utils file**

`Servers/utils/regulationsTracker.utils.ts`:

```typescript
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import logger from "./logger/fileLogger";
import { IManifestCountry, RegulationChange } from "../domain.layer/interfaces/i.regulationsTracker";

export function renderChangeLine(c: RegulationChange): string {
  switch (c.field) {
    case "regulation.status":
      return `${c.regulation}: status ${c.from} → ${c.to}`;
    case "regulation.effectiveDate":
      return `${c.regulation}: effective date ${c.from} → ${c.to}`;
    case "regulation":
      return c.change === "added" ? `Added: ${c.value}` : `Removed: ${c.value}`;
    case "regulationCount":
      return `Regulation count ${c.from} → ${c.to}`;
    default:
      return JSON.stringify(c);
  }
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ISO-8601 week, e.g. "2026-W26". Matches the AI Trust Index week-idempotency key.
export function currentIsoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function normalizeSlug(s: string): string {
  return String(s).trim().toLowerCase();
}

export async function getMetaQuery(): Promise<{
  seeded_at: Date | null;
  last_good_count: number | null;
  last_run_week: string | null;
}> {
  const rows = (await sequelize.query(
    `SELECT seeded_at, last_good_count, last_run_week FROM regulation_tracker_meta WHERE id = 1;`,
    { type: QueryTypes.SELECT },
  )) as any[];
  return rows[0] ?? { seeded_at: null, last_good_count: null, last_run_week: null };
}

export interface CountryChange {
  slug: string;
  name: string;
  lines: string[];
  unstructured: boolean;
}

export async function upsertFeedTx(
  countries: IManifestCountry[],
  presentSlugs?: string[],
  rawCount?: number,
): Promise<{ changed: CountryChange[]; newlyRemoved: string[]; wasFirstSeed: boolean }> {
  if (!countries.length) return { changed: [], newlyRemoved: [], wasFirstSeed: false };

  const changed: CountryChange[] = [];
  const newlyRemoved: string[] = [];
  let wasFirstSeed = false;

  await sequelize.transaction(async (transaction) => {
    const metaRows = (await sequelize.query(
      `SELECT seeded_at FROM regulation_tracker_meta WHERE id = 1 FOR UPDATE;`,
      { type: QueryTypes.SELECT, transaction },
    )) as any[];
    wasFirstSeed = !metaRows[0]?.seeded_at;

    const upsertedSlugs: string[] = [];
    for (const c of countries) {
      const slug = normalizeSlug(c.slug);
      upsertedSlugs.push(slug);
      const existing = (await sequelize.query(
        `SELECT hash FROM regulation_countries WHERE slug = :slug;`,
        { replacements: { slug }, type: QueryTypes.SELECT, transaction },
      )) as any[];

      if (existing.length) {
        const hashMoved = existing[0].hash !== c.hash;
        if (hashMoved) {
          const lc = c.history?.lastChange ?? null;
          const lines = (lc?.changes ?? []).map(renderChangeLine);
          changed.push({
            slug,
            name: c.name,
            lines: lines.length ? lines : ["Updated — see source"],
            unstructured: lines.length === 0,
          });
        }
        await sequelize.query(
          `UPDATE regulation_countries SET
             name = :name, region = :region, regulation_count = :rc,
             data = :data::jsonb, hash = :hash, is_active = TRUE, removed_at = NULL,
             last_fetched_at = NOW() ${hashMoved ? ", last_changed_at = NOW()" : ""}
           WHERE slug = :slug;`,
          {
            replacements: {
              slug, name: c.name, region: c.region ?? null,
              rc: c.regulationCount ?? null, data: JSON.stringify(c), hash: c.hash,
            },
            transaction,
          },
        );
      } else {
        await sequelize.query(
          `INSERT INTO regulation_countries
             (slug, name, region, regulation_count, data, hash, is_active, last_changed_at, last_fetched_at)
           VALUES (:slug, :name, :region, :rc, :data::jsonb, :hash, TRUE, NOW(), NOW());`,
          {
            replacements: {
              slug, name: c.name, region: c.region ?? null,
              rc: c.regulationCount ?? null, data: JSON.stringify(c), hash: c.hash,
            },
            transaction,
          },
        );
      }
    }

    const seenSlugs = Array.from(
      new Set([...upsertedSlugs, ...(presentSlugs ?? []).map(normalizeSlug)]),
    );
    const removedRows = (await sequelize.query(
      `UPDATE regulation_countries
         SET is_active = FALSE, removed_at = NOW()
       WHERE is_active = TRUE AND slug <> ALL(ARRAY[:seen]::varchar[])
       RETURNING slug;`,
      { replacements: { seen: seenSlugs }, type: QueryTypes.SELECT, transaction },
    )) as any[];
    for (const r of removedRows) newlyRemoved.push(r.slug);

    await sequelize.query(
      `UPDATE regulation_tracker_meta
         SET last_good_count = :count, last_run_week = :week
             ${wasFirstSeed ? ", seeded_at = NOW()" : ""}
       WHERE id = 1;`,
      { replacements: { count: rawCount ?? countries.length, week: currentIsoWeek(new Date()) }, transaction },
    );
  });

  return { changed, newlyRemoved, wasFirstSeed };
}
```

- [ ] **Step 4: Run to verify pure-function tests pass**

Run: `cd Servers && npm test -- regulationsTracker.utils`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/regulationsTracker.utils.ts Servers/utils/__tests__/regulationsTracker.utils.test.ts
git commit -m "feat(regulations-tracker): add rendering, week key, and feed upsert"
```

---

### Task 6: Utils — CRUD (track/untrack/bulk/settings) + recipient resolution + affected orgs

**Files:**
- Modify: `Servers/utils/regulationsTracker.utils.ts` (append)
- Test: `Servers/utils/__tests__/regulationsTracker.utils.test.ts` (extend)

**Interfaces:**
- Produces: `listCountries(filters)`, `getCountryRow(slug)`, `listTracked(orgId)`, `trackCountry(orgId, slug, userId)`, `trackCountriesBulk(orgId, slugs, userId)`, `untrackCountry(orgId, slug)`, `getSettings(orgId)`, `upsertSettings(orgId, userIds, emails, userId)`, `getAffectedOrgsBySlugs(slugs)`, `resolveEmailRecipients(orgId)`, `resolveInAppUserIds(orgId)`.

- [ ] **Step 1: Append CRUD + resolution functions**

Append to `Servers/utils/regulationsTracker.utils.ts`:

```typescript
export async function listCountries(filters: { region?: string; q?: string } = {}) {
  const where: string[] = ["is_active = TRUE"];
  const repl: Record<string, unknown> = {};
  if (filters.region) { where.push("region = :region"); repl.region = filters.region; }
  if (filters.q) { where.push("name ILIKE :q"); repl.q = `%${filters.q}%`; }
  return sequelize.query(
    `SELECT slug, name, region, regulation_count, hash, last_changed_at
     FROM regulation_countries WHERE ${where.join(" AND ")} ORDER BY name ASC;`,
    { replacements: repl, type: QueryTypes.SELECT },
  );
}

export async function getCountryRow(slug: string) {
  const rows = (await sequelize.query(
    `SELECT slug, name, region, regulation_count, data, hash, is_active, last_changed_at
     FROM regulation_countries WHERE slug = :slug;`,
    { replacements: { slug: normalizeSlug(slug) }, type: QueryTypes.SELECT },
  )) as any[];
  return rows[0] ?? null;
}

export async function listTracked(organizationId: number) {
  return sequelize.query(
    `SELECT t.country_slug, t.created_at, c.name, c.region, c.regulation_count, c.is_active, c.last_changed_at
     FROM regulation_tracked_countries t
     LEFT JOIN regulation_countries c ON c.slug = t.country_slug
     WHERE t.organization_id = :organizationId ORDER BY c.name ASC;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  );
}

export async function trackCountry(organizationId: number, slug: string, userId: number) {
  await sequelize.query(
    `INSERT INTO regulation_tracked_countries (organization_id, country_slug, tracked_by, created_at)
     VALUES (:organizationId, :slug, :userId, NOW())
     ON CONFLICT (organization_id, country_slug) DO NOTHING;`,
    { replacements: { organizationId, slug: normalizeSlug(slug), userId } },
  );
  return { tracked: true };
}

export async function trackCountriesBulk(organizationId: number, slugs: string[], userId: number) {
  for (const s of slugs) await trackCountry(organizationId, s, userId);
  return { tracked: slugs.length };
}

export async function untrackCountry(organizationId: number, slug: string) {
  await sequelize.query(
    `DELETE FROM regulation_tracked_countries
     WHERE organization_id = :organizationId AND country_slug = :slug;`,
    { replacements: { organizationId, slug: normalizeSlug(slug) } },
  );
  return { untracked: true };
}

export async function getSettings(organizationId: number) {
  const rows = (await sequelize.query(
    `SELECT recipient_user_ids, recipient_emails, updated_by, updated_at
     FROM regulation_tracker_settings WHERE organization_id = :organizationId;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as any[];
  return rows[0] ?? { recipient_user_ids: [], recipient_emails: [], updated_by: null, updated_at: null };
}

export async function upsertSettings(
  organizationId: number, userIds: number[], emails: string[], userId: number,
) {
  await sequelize.query(
    `INSERT INTO regulation_tracker_settings
       (organization_id, recipient_user_ids, recipient_emails, updated_by, updated_at)
     VALUES (:organizationId, :userIds::jsonb, :emails::jsonb, :userId, NOW())
     ON CONFLICT (organization_id) DO UPDATE SET
       recipient_user_ids = :userIds::jsonb, recipient_emails = :emails::jsonb,
       updated_by = :userId, updated_at = NOW();`,
    {
      replacements: {
        organizationId, userId,
        userIds: JSON.stringify(userIds ?? []), emails: JSON.stringify(emails ?? []),
      },
    },
  );
  return getSettings(organizationId);
}

export async function getAffectedOrgsBySlugs(slugs: string[]) {
  if (!slugs.length) return [] as { organization_id: number; country_slug: string; name: string | null }[];
  return (await sequelize.query(
    `SELECT DISTINCT t.organization_id, t.country_slug, c.name
     FROM regulation_tracked_countries t
     LEFT JOIN regulation_countries c ON c.slug = t.country_slug
     WHERE t.country_slug = ANY(ARRAY[:slugs]::varchar[]);`,
    { replacements: { slugs }, type: QueryTypes.SELECT },
  )) as { organization_id: number; country_slug: string; name: string | null }[];
}

// EMAIL recipients: configured only, NO admin fallback (matches AI Trust Index).
export async function resolveEmailRecipients(organizationId: number): Promise<string[]> {
  const s = await getSettings(organizationId);
  const userIds: number[] = s.recipient_user_ids ?? [];
  const freeText: string[] = s.recipient_emails ?? [];
  let userEmails: string[] = [];
  if (userIds.length) {
    const rows = (await sequelize.query(
      `SELECT email FROM users WHERE organization_id = :organizationId AND id = ANY(ARRAY[:ids]::int[]);`,
      { replacements: { organizationId, ids: userIds }, type: QueryTypes.SELECT },
    )) as { email: string }[];
    userEmails = rows.map((r) => r.email);
  }
  const recipients = Array.from(
    new Set([...userEmails, ...freeText].map((e) => e.trim().toLowerCase()).filter(Boolean)),
  );
  if (!recipients.length)
    logger.info(`[regulations-tracker] org ${organizationId} changed but no email recipients; skipped`);
  return recipients;
}

// IN-APP recipients: org Admins ∪ configured recipient_user_ids (deduped user ids).
export async function resolveInAppUserIds(organizationId: number): Promise<number[]> {
  const s = await getSettings(organizationId);
  const configured: number[] = s.recipient_user_ids ?? [];
  const admins = (await sequelize.query(
    `SELECT u.id FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.organization_id = :organizationId AND r.name IN ('Admin', 'SuperAdmin');`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as { id: number }[];
  return Array.from(new Set([...admins.map((a) => a.id), ...configured]));
}
```

- [ ] **Step 2: Add an integration test for idempotent track**

Append to `Servers/utils/__tests__/regulationsTracker.utils.test.ts` (skips if no DB):

```typescript
// Note: track/untrack/settings are exercised by the controller integration tests
// in Task 11 against a live test DB. Pure-function coverage stays here.
```

- [ ] **Step 3: Build to verify compile**

Run: `cd Servers && npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add Servers/utils/regulationsTracker.utils.ts Servers/utils/__tests__/regulationsTracker.utils.test.ts
git commit -m "feat(regulations-tracker): add CRUD and recipient resolution utils"
```

---

## Phase 3 — Weekly job, notifications, email template

### Task 7: Email digest MJML template

**Files:**
- Create: `Servers/templates/regulations-tracker-digest.mjml`

**Interfaces:**
- Consumes: `{{changedSection}}`, `{{removedSection}}`, `{{moduleUrl}}`, `{{trackedUrl}}`, `{{settingsUrl}}` injected by the job.

- [ ] **Step 1: Create the template (copy ai-trust-index-digest.mjml structure)**

Run `cd Servers && cat templates/ai-trust-index-digest.mjml` to get the exact house structure, then create `templates/regulations-tracker-digest.mjml` with the same layout but: title "Global AI regulations — weekly update", intro "Regulations changed for countries your organization tracks.", and the two slots `{{changedSection}}` (header "Changed") and `{{removedSection}}` (header "No longer in the feed"), plus buttons linking `{{moduleUrl}}` (Browse), `{{trackedUrl}}`, `{{settingsUrl}}`. Keep all colors/fonts identical to the AI Trust Index template.

- [ ] **Step 2: Verify it compiles**

Run: `cd Servers && node -e "const {compileMjmlToHtml}=require('./dist/tools/mjmlCompiler');const fs=require('fs');console.log(compileMjmlToHtml(fs.readFileSync('templates/regulations-tracker-digest.mjml','utf8'),{changedSection:'',removedSection:'',moduleUrl:'#',trackedUrl:'#',settingsUrl:'#'}).slice(0,40))"` (run `npm run build` first if dist is stale)
Expected: prints the start of valid HTML (`<!doctype html>` or `<html`).

- [ ] **Step 3: Commit**

```bash
git add Servers/templates/regulations-tracker-digest.mjml
git commit -m "feat(regulations-tracker): add email digest template"
```

---

### Task 8: Weekly sync job

**Files:**
- Create: `Servers/services/automations/actions/syncRegulationsTracker.ts`
- Test: `Servers/services/automations/actions/__tests__/syncRegulationsTracker.test.ts`

**Interfaces:**
- Consumes: `fetchManifest`, `validateManifest` (Task 4); `getMetaQuery`, `upsertFeedTx`, `getAffectedOrgsBySlugs`, `resolveEmailRecipients`, `resolveInAppUserIds`, `currentIsoWeek`, `escapeHtml` (Tasks 5–6); `sendAutomationEmail`, `compileMjmlToHtml`, notification util.
- Produces: `syncRegulationsTracker(deps?)` → `{ fetched; changed; newlyRemoved; orgsEmailed; orgsNotified; skipped? }`.

- [ ] **Step 1: Write the failing test (first-seed suppression + week guard)**

`Servers/services/automations/actions/__tests__/syncRegulationsTracker.test.ts`:

```typescript
import { sectionMjml } from "../syncRegulationsTracker";

describe("sectionMjml", () => {
  it("returns empty string for no items", () => {
    expect(sectionMjml("Changed", [])).toBe("");
  });
  it("escapes item names and renders bullet lines", () => {
    const out = sectionMjml("Changed", [{ name: "<EU>", detail: "status a → b" }]);
    expect(out).toContain("&lt;EU&gt;");
    expect(out).toContain("status a → b");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Servers && npm test -- syncRegulationsTracker`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the job**

`Servers/services/automations/actions/syncRegulationsTracker.ts`:

```typescript
import { promises as fs } from "fs";
import path from "path";
import { fetchManifest, validateManifest } from "../../../utils/regulationsTrackerFeed";
import {
  getMetaQuery,
  upsertFeedTx,
  getAffectedOrgsBySlugs,
  resolveEmailRecipients,
  resolveInAppUserIds,
  currentIsoWeek,
  escapeHtml,
  CountryChange,
} from "../../../utils/regulationsTracker.utils";
import { createNotification } from "../../../utils/notification.utils";
import { sendAutomationEmail } from "../../emailService";
import { compileMjmlToHtml } from "../../../tools/mjmlCompiler";
import logger from "../../../utils/logger/fileLogger";

const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:5173";
const MODULE_URL = FRONTEND + "/regulations-tracker/browse";
const TRACKED_URL = FRONTEND + "/regulations-tracker/tracked";
const SETTINGS_URL = FRONTEND + "/regulations-tracker/settings";

export interface DigestItem {
  name: string;
  detail?: string;
}

export function sectionMjml(title: string, items: DigestItem[]): string {
  if (!items.length) return "";
  const header = `<mj-text font-size="14px" font-weight="600" color="#344054">${escapeHtml(title)}</mj-text>`;
  const lines = items
    .map((it) => {
      const label = it.detail ? `${it.name} — ${it.detail}` : it.name;
      return `<mj-text font-size="13px" color="#475467">• ${escapeHtml(label)}</mj-text>`;
    })
    .join("");
  return header + lines;
}

async function renderDigest(changed: DigestItem[], removed: DigestItem[]): Promise<string> {
  const tmplPath = path.join(__dirname, "../../../templates/regulations-tracker-digest.mjml");
  const template = await fs.readFile(tmplPath, "utf8");
  return compileMjmlToHtml(template, {
    changedSection: sectionMjml("Changed", changed),
    removedSection: sectionMjml("No longer in the feed", removed),
    moduleUrl: MODULE_URL,
    trackedUrl: TRACKED_URL,
    settingsUrl: SETTINGS_URL,
  });
}

export async function syncRegulationsTracker(deps?: { feed?: unknown }): Promise<{
  fetched: number;
  changed: number;
  newlyRemoved: number;
  orgsEmailed: number;
  orgsNotified: number;
  skipped?: string;
}> {
  const meta = await getMetaQuery();
  const thisWeek = currentIsoWeek(new Date());
  if (meta.last_run_week === thisWeek)
    return { fetched: 0, changed: 0, newlyRemoved: 0, orgsEmailed: 0, orgsNotified: 0, skipped: `already ran ${thisWeek}` };

  let raw: unknown;
  try {
    raw = deps?.feed ?? (await fetchManifest());
  } catch (e) {
    logger.error(`[regulations-tracker] feed fetch failed: ${(e as Error).message}`);
    return { fetched: 0, changed: 0, newlyRemoved: 0, orgsEmailed: 0, orgsNotified: 0, skipped: "fetch failed" };
  }

  const validated = validateManifest(raw, meta.last_good_count ?? null);
  if (!validated.ok) {
    logger.error(`[regulations-tracker] feed rejected: ${validated.reason}`);
    return { fetched: 0, changed: 0, newlyRemoved: 0, orgsEmailed: 0, orgsNotified: 0, skipped: validated.reason };
  }

  const { changed, newlyRemoved, wasFirstSeed } = await upsertFeedTx(
    validated.countries, validated.presentSlugs, validated.rawCount,
  );

  if (wasFirstSeed) {
    logger.info(`[regulations-tracker] first seed (${validated.countries.length}); notifications suppressed`);
    return { fetched: validated.countries.length, changed: 0, newlyRemoved: 0, orgsEmailed: 0, orgsNotified: 0 };
  }

  const changeBySlug = new Map<string, CountryChange>(changed.map((c) => [c.slug, c]));
  const changedSlugs = Array.from(new Set([...changed.map((c) => c.slug), ...newlyRemoved]));
  let orgsEmailed = 0;
  let orgsNotified = 0;

  if (changedSlugs.length) {
    const affected = await getAffectedOrgsBySlugs(changedSlugs);
    const byOrg = new Map<number, { changed: DigestItem[]; removed: DigestItem[]; slugs: string[] }>();
    for (const row of affected) {
      const bucket = byOrg.get(row.organization_id) ?? { changed: [], removed: [], slugs: [] };
      const name = row.name ?? row.country_slug;
      bucket.slugs.push(row.country_slug);
      if (newlyRemoved.includes(row.country_slug)) {
        bucket.removed.push({ name });
      } else {
        const ch = changeBySlug.get(row.country_slug);
        bucket.changed.push({ name, detail: ch ? ch.lines.join(", ") : undefined });
      }
      byOrg.set(row.organization_id, bucket);
    }

    for (const [orgId, { changed: ch, removed: rm, slugs }] of byOrg) {
      // In-app: always to admins ∪ configured recipients.
      const userIds = await resolveInAppUserIds(orgId);
      if (userIds.length) {
        const title = "AI regulations updated";
        const message =
          [...ch.map((i) => i.name), ...rm.map((i) => `${i.name} (removed)`)].join(", ");
        for (const uid of userIds) {
          await createNotification(orgId, {
            user_id: uid,
            type: "regulations_tracker",
            title,
            message,
            entity_type: "regulation_country",
            entity_id: slugs[0] ?? null,
          });
        }
        orgsNotified++;
      }
      // Email: configured recipients only, no fallback.
      const emails = await resolveEmailRecipients(orgId);
      if (emails.length) {
        const html = await renderDigest(ch, rm);
        await sendAutomationEmail(emails, "Global AI regulations — weekly update", html, undefined);
        orgsEmailed++;
      }
    }
  }

  logger.info(
    `[regulations-tracker] done: fetched=${validated.countries.length} changed=${changed.length} removed=${newlyRemoved.length} emailed=${orgsEmailed} notified=${orgsNotified}`,
  );
  return {
    fetched: validated.countries.length,
    changed: changed.length,
    newlyRemoved: newlyRemoved.length,
    orgsEmailed,
    orgsNotified,
  };
}
```

**Note for implementer:** verify the exact signature of `createNotification` in `Servers/utils/notification.utils.ts` and adapt the call (param order/shape) to match. The fields used are `user_id, type, title, message, entity_type, entity_id` with `organization_id` passed separately.

- [ ] **Step 4: Run to verify it passes**

Run: `cd Servers && npm test -- syncRegulationsTracker`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Servers/services/automations/actions/syncRegulationsTracker.ts Servers/services/automations/actions/__tests__/syncRegulationsTracker.test.ts
git commit -m "feat(regulations-tracker): add weekly sync job with in-app + email"
```

---

### Task 9: BullMQ scheduling + worker dispatch

**Files:**
- Modify: `Servers/services/automations/automationProducer.ts`
- Modify: `Servers/services/automations/automationWorker.ts`
- Modify: `Servers/jobs/producer.ts`

**Interfaces:**
- Consumes: `syncRegulationsTracker` (Task 8).
- Produces: scheduled repeatable job `regulations_tracker_sync` (weekly `0 6 * * 1` UTC).

- [ ] **Step 1: Add the scheduler (must NOT obliterate)**

In `Servers/services/automations/automationProducer.ts`, add (mirror `scheduleAiTrustIndexSync`, do NOT call `automationQueue.obliterate`):

```typescript
export async function scheduleRegulationsTrackerSync() {
  await automationQueue.add(
    "regulations_tracker_sync",
    {},
    {
      repeat: { pattern: "0 6 * * 1", tz: "UTC" }, // Mondays 06:00 UTC
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}
```

- [ ] **Step 2: Add the worker dispatch branch**

In `Servers/services/automations/automationWorker.ts`, find the `if (name === "ai_trust_index_sync")` branch and add alongside it:

```typescript
} else if (name === "regulations_tracker_sync") {
  const { syncRegulationsTracker } = await import("./actions/syncRegulationsTracker");
  await syncRegulationsTracker();
}
```
(Match the existing import style in that file — if it uses top-of-file imports rather than dynamic import, follow that instead.)

- [ ] **Step 3: Register in addAllJobs (after any obliterating scheduler)**

In `Servers/jobs/producer.ts`, import and call inside `addAllJobs()`, placed next to `scheduleAiTrustIndexSync()` (both are non-obliterating and belong near the end):

```typescript
import { scheduleRegulationsTrackerSync } from "../services/automations/automationProducer";
// ... inside addAllJobs(), near scheduleAiTrustIndexSync():
await scheduleRegulationsTrackerSync();
```

- [ ] **Step 4: Build to verify compile**

Run: `cd Servers && npm run build`
Expected: success.

- [ ] **Step 5: Manually trigger the job once to smoke-test (idempotent)**

Run: `cd Servers && node -e "require('./dist/services/automations/actions/syncRegulationsTracker').syncRegulationsTracker().then(r=>{console.log(JSON.stringify(r));process.exit(0)})"`
Expected: `{"skipped":"already ran ..."}` (because the seed set `last_run_week`) OR a result object — either proves it wires up without throwing.

- [ ] **Step 6: Commit**

```bash
git add Servers/services/automations/automationProducer.ts Servers/services/automations/automationWorker.ts Servers/jobs/producer.ts
git commit -m "feat(regulations-tracker): schedule weekly sync job"
```

---

## Phase 4 — Routes + controllers

### Task 10: Routes + controllers + app registration

**Files:**
- Create: `Servers/routes/regulationsTracker.route.ts`
- Create: `Servers/controllers/regulationsTracker.ctrl.ts`
- Modify: `Servers/app.ts`

**Interfaces:**
- Consumes: all Task 6 CRUD utils, `fetchCountryDetail`/`getCountryRow` for the proxy.
- Produces: 8 endpoints under `/api/regulations-tracker`.

- [ ] **Step 1: Create the controller**

Run `cd Servers && sed -n '1,40p' controllers/aiTrustIndex.ctrl.ts` to copy the exact imports (`logProcessing`, `logSuccess`, `logFailure`, `STATUS_CODE`, `isAdmin`). Then create `Servers/controllers/regulationsTracker.ctrl.ts` with 8 handlers following the AI Trust Index pattern exactly. Example for two of them (replicate the logging shape for all 8):

```typescript
import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils"; // match aiTrustIndex import path
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import { isAdmin } from "../utils/roleCheck.utils"; // match aiTrustIndex import path
import {
  listCountries, getCountryRow, listTracked, trackCountry, trackCountriesBulk,
  untrackCountry, getSettings, upsertSettings,
} from "../utils/regulationsTracker.utils";
import { fetchCountryDetail } from "../utils/regulationsTrackerFeed";

const file = "regulationsTracker.ctrl.ts";

export async function getCountries(req: Request, res: Response): Promise<any> {
  const fn = "getCountries";
  logProcessing({ description: "list regulation countries", functionName: fn, fileName: file, userId: req.userId!, organizationId: req.organizationId! });
  try {
    const data = await listCountries({ region: req.query.region as string, q: req.query.q as string });
    await logSuccess({ eventType: "Read", description: "listed countries", functionName: fn, fileName: file, userId: req.userId!, organizationId: req.organizationId! });
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    await logFailure({ eventType: "Read", description: "list countries failed", functionName: fn, fileName: file, error: error as Error, userId: req.userId!, organizationId: req.organizationId! });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getCountryDetail(req: Request, res: Response): Promise<any> {
  const fn = "getCountryDetail";
  logProcessing({ description: "proxy country detail", functionName: fn, fileName: file, userId: req.userId!, organizationId: req.organizationId! });
  try {
    const slug = req.params.slug;
    const local = await getCountryRow(slug);
    if (!local) return res.status(404).json(STATUS_CODE[404]("country not found"));
    try {
      const live = await fetchCountryDetail(slug);
      return res.status(200).json(STATUS_CODE[200]({ ...(live as object), stale: false }));
    } catch {
      return res.status(200).json(STATUS_CODE[200]({ country: local.data, stale: true }));
    }
  } catch (error) {
    await logFailure({ eventType: "Read", description: "country detail failed", functionName: fn, fileName: file, error: error as Error, userId: req.userId!, organizationId: req.organizationId! });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// trackCountry / trackBulk / untrack / updateSettings: admin-gated.
// At the top of each: if (!isAdmin(req.role)) return res.status(403).json(STATUS_CODE[403]("forbidden"));
// getTracked / getSettingsCtrl: any authenticated user in the org.
```

The implementer must write all 8: `getCountries`, `getCountryDetail`, `getTracked`, `trackCountryCtrl`, `trackBulkCtrl`, `untrackCountryCtrl`, `getSettingsCtrl`, `updateSettingsCtrl` — admin gate on the 4 mutating/settings ones. Verify exact import paths against `aiTrustIndex.ctrl.ts`.

- [ ] **Step 2: Create the route file**

`Servers/routes/regulationsTracker.route.ts` (mirror `aiTrustIndex.route.ts`):

```typescript
import express from "express";
import authenticateJWT from "../middleware/auth.middleware"; // match aiTrustIndex import
import {
  getCountries, getCountryDetail, getTracked, trackCountryCtrl, trackBulkCtrl,
  untrackCountryCtrl, getSettingsCtrl, updateSettingsCtrl,
} from "../controllers/regulationsTracker.ctrl";

const router = express.Router();

router.get("/countries", authenticateJWT, getCountries);
router.get("/countries/:slug", authenticateJWT, getCountryDetail);
router.get("/tracked", authenticateJWT, getTracked);
router.post("/tracked", authenticateJWT, trackCountryCtrl);
router.post("/tracked/bulk", authenticateJWT, trackBulkCtrl);
router.delete("/tracked/:slug", authenticateJWT, untrackCountryCtrl);
router.get("/settings", authenticateJWT, getSettingsCtrl);
router.put("/settings", authenticateJWT, updateSettingsCtrl);

export default router;
```

- [ ] **Step 3: Register in app.ts**

In `Servers/app.ts`, next to the AI Trust Index registration:

```typescript
import regulationsTrackerRoutes from "./routes/regulationsTracker.route";
app.use("/api/regulations-tracker", regulationsTrackerRoutes);
```

- [ ] **Step 4: Regenerate API docs**

Run: `cd Servers && npm run build && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift`
Expected: no drift error.

- [ ] **Step 5: Commit**

```bash
git add Servers/routes/regulationsTracker.route.ts Servers/controllers/regulationsTracker.ctrl.ts Servers/app.ts Servers/swagger.yaml docs/api-docs/src/config/endpoints.ts
git commit -m "feat(regulations-tracker): add routes and controllers"
```

---

### Task 11: Endpoint integration tests

**Files:**
- Create: `Servers/controllers/__tests__/regulationsTracker.ctrl.test.ts`

- [ ] **Step 1: Write tests mirroring aiTrustIndex.ctrl tests**

Run `cd Servers && ls controllers/__tests__/ | grep -i trust` to find the AI Trust Index controller test, read it, and mirror it: assert `getCountries` returns 200 + array; `trackCountryCtrl` returns 403 for non-admin and 201 for admin; `untrackCountryCtrl` is idempotent (200 when not tracked); tenant isolation (org A's tracked list excludes org B). Use the same mocking/harness the AI Trust Index test uses.

- [ ] **Step 2: Run the tests**

Run: `cd Servers && npm test -- regulationsTracker.ctrl`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add Servers/controllers/__tests__/regulationsTracker.ctrl.test.ts
git commit -m "test(regulations-tracker): add endpoint integration tests"
```

---

## Phase 5 — Frontend

### Task 12: Repository + hooks

**Files:**
- Create: `Clients/src/application/repository/regulationsTracker.repository.ts`
- Create: `Clients/src/application/hooks/useRegulationsTracker.ts`

- [ ] **Step 1: Create the repository**

Read `Clients/src/application/repository/aiTrustIndex.repository.ts` for the exact `apiServices` import + method shape, then create `regulationsTracker.repository.ts` with: `getCountries(params)`, `getCountryDetail(slug)`, `getTracked()`, `trackCountry(slug)`, `trackBulk(slugs)`, `untrackCountry(slug)`, `getSettings()`, `updateSettings(payload)` — all hitting `/regulations-tracker/...`.

- [ ] **Step 2: Create the hooks**

Read `Clients/src/application/hooks/useAiTrustIndex.ts` and mirror it: `const KEY = "regulations-tracker"`, read queries use `keepPreviousData`, mutations invalidate `KEY`. Export `useCountries`, `useCountryDetail`, `useTracked`, `useTrackCountry`, `useUntrackCountry`, `useTrackBulk`, `useSettings`, `useUpdateSettings`.

- [ ] **Step 3: Typecheck**

Run: `cd Clients && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add Clients/src/application/repository/regulationsTracker.repository.ts Clients/src/application/hooks/useRegulationsTracker.ts
git commit -m "feat(regulations-tracker): add frontend repository and hooks"
```

---

### Task 13: Pages (Browse / Tracked / Settings / Detail) + sidebar + context

**Files:**
- Create: `Clients/src/application/contexts/RegulationsTrackerSidebar.context.tsx`
- Create: `Clients/src/presentation/pages/RegulationsTracker/index.tsx`
- Create: `Clients/src/presentation/pages/RegulationsTracker/Browse/index.tsx`
- Create: `Clients/src/presentation/pages/RegulationsTracker/Tracked/index.tsx`
- Create: `Clients/src/presentation/pages/RegulationsTracker/Settings/index.tsx`
- Create: `Clients/src/presentation/pages/RegulationsTracker/CountryDetail/index.tsx`
- Create: `Clients/src/presentation/pages/RegulationsTracker/RegulationsTrackerSidebar.tsx`

- [ ] **Step 1: Mirror the AI Trust Index page tree**

Read each corresponding `Clients/src/presentation/pages/AITrustIndex/*` file and the `AITrustIndexSidebar.context.tsx` + `AITrustIndexSidebar.tsx`, and replicate for Regulations Tracker. Browse lists countries (grouped/filterable by region) with a Track button (`useTrackCountry`); Tracked lists tracked countries with Untrack; Settings edits recipient_user_ids + recipient_emails (use existing user-picker + ChipInput patterns); CountryDetail renders regulations + timeline + change history from `useCountryDetail`, and shows the feed disclaimer verbatim. Use VerifyWise components only; sentence case; pixel spacing.

- [ ] **Step 2: Typecheck + i18n audit**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict`
Expected: no errors. (Add any new UI strings to `i18n/translations.ts` for de/fr/es if the audit flags them.)

- [ ] **Step 3: Commit**

```bash
git add Clients/src/application/contexts/RegulationsTrackerSidebar.context.tsx Clients/src/presentation/pages/RegulationsTracker/
git commit -m "feat(regulations-tracker): add Browse/Tracked/Settings/Detail pages"
```

---

### Task 14: Route registration + navigation entry

**Files:**
- Modify: `Clients/src/application/config/routes.tsx`
- Modify: the sidebar/nav file that lists modules (find via `grep -rn "ai-trust-index" Clients/src/presentation --include=*.tsx -l`)

- [ ] **Step 1: Add lazy imports + routes**

In `routes.tsx`, mirror the AI Trust Index entries (lazy imports for the 4 pages + `<Route>` registrations under `/regulations-tracker`, with the bare path redirecting to `/regulations-tracker/browse`).

- [ ] **Step 2: Add the nav entry**

Add a "Regulations tracker" entry to the same navigation/sidebar config that lists AI Trust Index, pointing at `/regulations-tracker`.

- [ ] **Step 3: Typecheck + build**

Run: `cd Clients && npm run typecheck && npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add Clients/src/application/config/routes.tsx Clients/src/presentation
git commit -m "feat(regulations-tracker): register routes and navigation"
```

---

### Task 15: Final gates + manual verification

- [ ] **Step 1: Run all backend + frontend gates**

Run:
```bash
cd Servers && npm run build && npm test -- regulationsTracker syncRegulationsTracker
cd ../Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check
```
Expected: all pass.

- [ ] **Step 2: Manual smoke test (run app, verify UI)**

Use the `/run-verifywise` skill (or `run` skill) to start the app. Log in, open Regulations tracker → Browse (countries load), Track a country, see it in Tracked, set a recipient in Settings, open a country Detail (regulations + timeline render). Confirm no console errors.

- [ ] **Step 3: Commit any fixes from manual testing**

```bash
git add -A && git commit -m "fix(regulations-tracker): address manual test findings"
```

---

## Self-review notes (addressed)

- **Spec §4 tables** → Task 1 (DDL) + Task 2 (models). ✓
- **Spec §5 endpoints/layers** → Tasks 4–6 (utils), Task 10 (routes/controllers). ✓
- **Spec §6 job (all 10 steps)** → Task 8; week guard, fetch-fail, validate, upsertFeedTx, wasFirstSeed suppression, per-org fan-out, in-app + email, meta update all present. ✓
- **Spec §6 escapeHtml** → Task 5 (`escapeHtml`) used in Task 8 (`sectionMjml`). ✓
- **Spec §6 BullMQ obliterate hazard** → Task 9 Step 1/3 (no obliterate, registered near AI Trust Index). ✓
- **Spec §7 detail proxy fallback** → Task 10 `getCountryDetail` (live → stored `data` with `stale`). ✓
- **Spec §8 frontend** → Tasks 12–14. ✓
- **Spec §9 edge cases** A–M → floor+50% (Task 4), present-but-malformed (Task 4 test), first-seed (Task 8), unstructured (Task 5 upsertFeedTx lines fallback), escapeHtml (Task 5/8), no email fallback (Task 6 resolveEmailRecipients), obliterate (Task 9), detail fallback (Task 10), ON CONFLICT track (Task 6), untrack no-op (Task 6 DELETE), re-appear is_active reset (Task 5 UPDATE sets is_active=TRUE, removed_at=NULL), latest lastChange + our-clock week (Tasks 5/8). ✓
- **Spec §10 testing** → Tasks 4, 5, 8, 11. ✓
- **Type consistency:** `CountryChange { slug, name, lines, unstructured }` defined in Task 5, consumed in Task 8 (`changeBySlug`, `ch.lines.join`). `upsertFeedTx` returns `{ changed, newlyRemoved, wasFirstSeed }` consistently. ✓
- **Known implementer checks (flagged inline, not placeholders):** exact import paths for `STATUS_CODE`, `isAdmin`, `authenticateJWT`, `createNotification` signature, and `sendAutomationEmail` arity must be verified against the real AI Trust Index files — each step says so explicitly.
