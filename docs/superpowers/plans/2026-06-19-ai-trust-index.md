# AI Trust Index Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 6th sidebar module that weekly-fetches the public AI Trust Index feed, lets each org browse/search and track apps, and emails configured recipients when a tracked app's risk-material profile changes or it leaves the index.

**Architecture:** A lean Node/Express + Postgres + React module — no new service, no Python, no LLM. One global mirror table for the feed (no `organization_id`), two per-org tables (tracking, settings), one global meta row. One weekly BullMQ job does fetch → sanity-gate → canonical-hash diff → email. Frontend follows the established 6th-module pattern (AppSwitcher entry + sidebar context + lazy routes).

**Tech Stack:** TypeScript, Express 4, Sequelize 6 (raw SQL migrations, `sequelize-typescript` decorator models), BullMQ 5, PostgreSQL (`verifywise` schema), MJML 5 + nodemailer, React 19 + React Query + MUI 7, Vitest (frontend), Jest (backend).

Full design: `docs/superpowers/specs/2026-06-19-ai-trust-index-design.md`.

## Global Constraints

- **No new dependencies.** Everything needed is already on `develop` (bullmq ^5.76.6, axios ^1.16.0, mjml ^5.2.0, nodemailer ^8.0.7, sequelize ^6.37.8).
- **Multi-tenancy:** `ai_trust_index_apps` and `ai_trust_index_meta` are GLOBAL (no `organization_id`) — public data, documented exception. `ai_trust_index_tracked_apps` and `ai_trust_index_settings` ARE org-scoped. Every org-scoped query filters `WHERE organization_id = :organizationId`.
- **Schema:** tables live in the `verifywise` schema; migrations use `queryInterface.sequelize.query` with explicit `verifywise.` prefix; app queries use **unqualified** table names (resolved by the `search_path = verifywise` afterConnect hook in `Servers/database/db.ts`).
- **Backend response format:** `STATUS_CODE[200](data)` from `../utils/statusCode.utils`. Logging via `logProcessing/logSuccess/logFailure` from `../utils/logger/logHelper`. Request context: `req.organizationId`, `req.userId`, `req.role` (set by `authenticateJWT` from `../middleware/auth.middleware`).
- **Admin = role NAME** `IN ('Admin','SuperAdmin')` via `JOIN roles r ON users.role_id = r.id` — never a hardcoded `role_id`.
- **Canonical hashing (the #1 correctness rule):** hash the INCOMING parsed feed object, NEVER re-derive from stored JSONB; deep-sort object keys + sort unordered arrays before hashing.
- **Two hashes:** `material_hash` (drives emails) over `{scoreOutOf100, letterGrade, displayedGrade, dealbreakerFlags, policyLastUpdated, processesBiometrics}`; `full_hash` (drives `data` refresh / `last_changed_at`) over the full app object minus `iconUrl`, with `policyUrl` stripped of query+fragment.
- **Cron:** `"0 6 * * 1"` Monday 06:00 **UTC**; scheduler MUST NOT call `automationQueue.obliterate()`; register it LAST in `Servers/jobs/producer.ts`.
- **UI:** sentence case; VerifyWise components over raw MUI; grade chips render `displayedGrade` (not `letterGrade`); use our theme palette, not the feed's `design` block.
- **i18n:** every new user-facing string gets de/fr/es entries in `Clients/src/i18n/translations.ts` (English string is the key); must pass `npm run i18n:audit:strict`.
- **Pre-PR gates:** `cd Servers && npm run build && npm run format-check`; `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npm run build`.

---

## File Structure

**Backend — new:**
- `Servers/database/migrations/<ts>-create-ai-trust-index-tables.js` — 4 tables + indexes
- `Servers/domain.layer/interfaces/i.aiTrustIndex.ts` — TS interfaces for the 4 models
- `Servers/domain.layer/models/aiTrustIndex/aiTrustIndexApp.model.ts`
- `Servers/domain.layer/models/aiTrustIndex/aiTrustIndexTrackedApp.model.ts`
- `Servers/domain.layer/models/aiTrustIndex/aiTrustIndexSettings.model.ts`
- `Servers/domain.layer/models/aiTrustIndex/aiTrustIndexMeta.model.ts`
- `Servers/utils/aiTrustIndexHash.ts` — pure canonicalization + hashing (no DB; easy to unit-test)
- `Servers/utils/aiTrustIndexFeed.ts` — fetch + sanity-gate the feed (pure-ish; injectable fetcher)
- `Servers/utils/aiTrustIndex.utils.ts` — all DB queries (browse, tracking, settings, upsert/diff, recipients)
- `Servers/controllers/aiTrustIndex.ctrl.ts` — thin controllers
- `Servers/routes/aiTrustIndex.route.ts` — routes behind `authenticateJWT`
- `Servers/services/automations/actions/syncAiTrustIndex.ts` — the weekly job body
- `Servers/templates/ai-trust-index-digest.mjml` — digest email

**Backend — edit:**
- `Servers/services/automations/automationProducer.ts` — add `scheduleAiTrustIndexSync()`
- `Servers/services/automations/automationWorker.ts` — add dispatch branch
- `Servers/jobs/producer.ts` — import + call scheduler LAST
- `Servers/app.ts` — mount the route

**Frontend — new:**
- `Clients/src/application/repository/aiTrustIndex.repository.ts`
- `Clients/src/application/hooks/useAiTrustIndex.ts`
- `Clients/src/application/contexts/AITrustIndexSidebar.context.tsx`
- `Clients/src/presentation/pages/AITrustIndex/shared.ts`
- `Clients/src/presentation/pages/AITrustIndex/AITrustIndexSidebar.tsx`
- `Clients/src/presentation/pages/AITrustIndex/index.tsx`
- `Clients/src/presentation/pages/AITrustIndex/Browse/index.tsx`
- `Clients/src/presentation/pages/AITrustIndex/Tracked/index.tsx`
- `Clients/src/presentation/pages/AITrustIndex/Settings/index.tsx`
- `Clients/src/presentation/pages/AITrustIndex/AppDetail/index.tsx`

**Frontend — edit:**
- `Clients/src/application/redux/ui/uiSlice.ts` — add `"ai-trust-index"` to `AppModule` union
- `Clients/src/application/hooks/useActiveModule.ts` — 3 edits (path detect, navigate case, storage validation)
- `Clients/src/presentation/components/AppSwitcher/index.tsx` — add module entry
- `Clients/src/application/config/routes.tsx` — add 5 routes
- `Clients/src/i18n/translations.ts` — de/fr/es strings

**Docs:**
- `docs/technical/domains/ai-trust-index.md`; edit root `CLAUDE.md` references table
- `shared/user-guide-content/content/ai-trust-index/{dashboard,browse,tracked,settings}.ts`; edit `content/index.ts` + `userGuideConfig.ts` (both locations)

---

# PHASE 1 — Backend foundation

### Task 1: Database migration (4 tables)

**Files:**
- Create: `Servers/database/migrations/<ts>-create-ai-trust-index-tables.js` (use a 14-digit UTC timestamp newer than the latest existing migration; check with `ls -t Servers/database/migrations | head -1`)

**Interfaces:**
- Produces tables: `ai_trust_index_apps`, `ai_trust_index_tracked_apps`, `ai_trust_index_settings`, `ai_trust_index_meta` in schema `verifywise`.

- [ ] **Step 1: Write the migration**

```javascript
"use strict";

/**
 * AI Trust Index module tables.
 *
 * `ai_trust_index_apps` and `ai_trust_index_meta` are GLOBAL (no
 * organization_id): the AI Trust Index feed is public reference data,
 * identical for every org. Tenancy is enforced only on
 * `ai_trust_index_tracked_apps` and `ai_trust_index_settings`.
 *
 * Apps are linked from tracking by `app_slug` (the feed's stable identity),
 * intentionally WITHOUT a foreign key, so a feed re-import can never
 * cascade-delete durable user tracking.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.ai_trust_index_apps (
        id                SERIAL PRIMARY KEY,
        slug              VARCHAR(120) NOT NULL UNIQUE,
        name              VARCHAR(255) NOT NULL,
        vendor            VARCHAR(255),
        category          VARCHAR(100),
        letter_grade      VARCHAR(2),
        score_out_of_100  SMALLINT,
        data              JSONB NOT NULL,
        material_hash     CHAR(64) NOT NULL,
        full_hash         CHAR(64) NOT NULL,
        is_active         BOOLEAN NOT NULL DEFAULT TRUE,
        removed_at        TIMESTAMPTZ,
        last_changed_at   TIMESTAMPTZ,
        last_fetched_at   TIMESTAMPTZ
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ati_apps_active_category
        ON verifywise.ai_trust_index_apps(is_active, category);
      CREATE INDEX IF NOT EXISTS idx_ati_apps_active_grade
        ON verifywise.ai_trust_index_apps(is_active, letter_grade);
      CREATE INDEX IF NOT EXISTS idx_ati_apps_name
        ON verifywise.ai_trust_index_apps(name);
      CREATE INDEX IF NOT EXISTS idx_ati_apps_vendor
        ON verifywise.ai_trust_index_apps(vendor);
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.ai_trust_index_tracked_apps (
        id               SERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        app_slug         VARCHAR(120) NOT NULL,
        tracked_by       INTEGER REFERENCES verifywise.users(id),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (organization_id, app_slug)
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ati_tracked_org
        ON verifywise.ai_trust_index_tracked_apps(organization_id);
      CREATE INDEX IF NOT EXISTS idx_ati_tracked_slug
        ON verifywise.ai_trust_index_tracked_apps(app_slug);
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.ai_trust_index_settings (
        organization_id     INTEGER PRIMARY KEY REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        recipient_user_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
        recipient_emails    JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_by          INTEGER REFERENCES verifywise.users(id),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.ai_trust_index_meta (
        id              SMALLINT PRIMARY KEY DEFAULT 1,
        seeded_at       TIMESTAMPTZ,
        last_good_count INTEGER,
        last_run_week   VARCHAR(10),
        CONSTRAINT ai_trust_index_meta_singleton CHECK (id = 1)
      );
    `);
    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.ai_trust_index_meta (id)
      VALUES (1) ON CONFLICT (id) DO NOTHING;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.ai_trust_index_tracked_apps CASCADE"
    );
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.ai_trust_index_settings CASCADE"
    );
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.ai_trust_index_meta CASCADE"
    );
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.ai_trust_index_apps CASCADE"
    );
  },
};
```

- [ ] **Step 2: Run the migration**

Run: `cd Servers && npm run migrate-db`
(VERIFIED: the migrate script is `migrate-db` → `npx sequelize db:migrate --debug`.)
Expected: migration runs without error; 4 tables created.

- [ ] **Step 3: Verify tables exist**

Run (psql against the dev DB, or via any DB client): `\dt verifywise.ai_trust_index_*`
Expected: 4 tables listed — `ai_trust_index_apps`, `ai_trust_index_tracked_apps`, `ai_trust_index_settings`, `ai_trust_index_meta`. (There is no `db:migrate:status` npm script; verify by listing tables.)

- [ ] **Step 4: Commit**

```bash
git add Servers/database/migrations/*-create-ai-trust-index-tables.js
git commit -m "feat(ai-trust-index): add database tables"
```

---

### Task 2: Model interfaces + Sequelize models

**Files:**
- Create: `Servers/domain.layer/interfaces/i.aiTrustIndex.ts`
- Create: `Servers/domain.layer/models/aiTrustIndex/aiTrustIndexApp.model.ts`
- Create: `Servers/domain.layer/models/aiTrustIndex/aiTrustIndexTrackedApp.model.ts`
- Create: `Servers/domain.layer/models/aiTrustIndex/aiTrustIndexSettings.model.ts`
- Create: `Servers/domain.layer/models/aiTrustIndex/aiTrustIndexMeta.model.ts`

**Interfaces:**
- Consumes: tables from Task 1.
- Produces: `ITrustIndexApp`, `ITrustIndexAppData` interfaces; `AiTrustIndexAppModel`, `AiTrustIndexTrackedAppModel`, `AiTrustIndexSettingsModel`, `AiTrustIndexMetaModel` classes.

> Note: these models register the tables with Sequelize. Most queries in this module use raw SQL via `sequelize.query` (Task 4 pattern), so the models are primarily for typing + registration; no behavior tests are needed here. The "test" for this task is that the backend builds.

- [ ] **Step 1: Write the interfaces file**

```typescript
// Servers/domain.layer/interfaces/i.aiTrustIndex.ts

/** One app object as it appears inside the feed's `apps[]` (and our `data` JSONB). */
export interface ITrustIndexAppData {
  slug: string;
  name: string;
  vendor: string;
  domain: string;
  category: string;
  scoreOutOf100: number;
  letterGrade: string;
  displayedGrade: string;
  confidence: string;
  dealbreakerFlags: string[];
  summary: string;
  highlights: { label: string; text: string }[];
  policyUrl: string;
  policyLastUpdated: string | null;
  modalities: string[];
  processesBiometrics: boolean;
  iconUrl?: string;
}

export interface ITrustIndexApp {
  id?: number;
  slug: string;
  name: string;
  vendor?: string;
  category?: string;
  letter_grade?: string;
  score_out_of_100?: number;
  data: ITrustIndexAppData;
  material_hash: string;
  full_hash: string;
  is_active: boolean;
  removed_at?: Date | null;
  last_changed_at?: Date | null;
  last_fetched_at?: Date | null;
}
```

- [ ] **Step 2: Write the app model**

```typescript
// Servers/domain.layer/models/aiTrustIndex/aiTrustIndexApp.model.ts
import { Column, DataType, Model, Table } from "sequelize-typescript";
import { ITrustIndexApp, ITrustIndexAppData } from "../../interfaces/i.aiTrustIndex";

@Table({ tableName: "ai_trust_index_apps", timestamps: false })
export class AiTrustIndexAppModel extends Model<AiTrustIndexAppModel> implements ITrustIndexApp {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id?: number;

  @Column({ type: DataType.STRING(120), allowNull: false })
  slug!: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  vendor?: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  category?: string;

  @Column({ type: DataType.STRING(2), allowNull: true })
  letter_grade?: string;

  @Column({ type: DataType.SMALLINT, allowNull: true })
  score_out_of_100?: number;

  @Column({ type: DataType.JSONB, allowNull: false })
  data!: ITrustIndexAppData;

  @Column({ type: DataType.CHAR(64), allowNull: false })
  material_hash!: string;

  @Column({ type: DataType.CHAR(64), allowNull: false })
  full_hash!: string;

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

- [ ] **Step 3: Write the tracked-app, settings, and meta models**

```typescript
// Servers/domain.layer/models/aiTrustIndex/aiTrustIndexTrackedApp.model.ts
import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table({ tableName: "ai_trust_index_tracked_apps", timestamps: false })
export class AiTrustIndexTrackedAppModel extends Model<AiTrustIndexTrackedAppModel> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id?: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  organization_id!: number;

  @Column({ type: DataType.STRING(120), allowNull: false })
  app_slug!: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  tracked_by?: number;

  @Column({ type: DataType.DATE, allowNull: false })
  created_at?: Date;
}
```

```typescript
// Servers/domain.layer/models/aiTrustIndex/aiTrustIndexSettings.model.ts
import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table({ tableName: "ai_trust_index_settings", timestamps: false })
export class AiTrustIndexSettingsModel extends Model<AiTrustIndexSettingsModel> {
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

```typescript
// Servers/domain.layer/models/aiTrustIndex/aiTrustIndexMeta.model.ts
import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table({ tableName: "ai_trust_index_meta", timestamps: false })
export class AiTrustIndexMetaModel extends Model<AiTrustIndexMetaModel> {
  @Column({ type: DataType.SMALLINT, primaryKey: true })
  id!: number;

  @Column({ type: DataType.DATE, allowNull: true })
  seeded_at?: Date | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  last_good_count?: number | null;

  @Column({ type: DataType.STRING(10), allowNull: true })
  last_run_week?: string | null;
}
```

- [ ] **Step 4: Verify the backend compiles**

Run: `cd Servers && npm run build`
Expected: build succeeds (no TS errors).

- [ ] **Step 5: Commit**

```bash
git add Servers/domain.layer/interfaces/i.aiTrustIndex.ts Servers/domain.layer/models/aiTrustIndex/
git commit -m "feat(ai-trust-index): add interfaces and models"
```

---

# PHASE 2 — Pure logic (hashing + feed gating)

### Task 3: Canonical hashing utility

**Files:**
- Create: `Servers/utils/aiTrustIndexHash.ts`
- Test: `Servers/utils/__tests__/aiTrustIndexHash.test.ts`

**Interfaces:**
- Consumes: `ITrustIndexAppData` from Task 2.
- Produces:
  - `canonicalize(value: unknown): unknown` — deep-sorts object keys; sorts string arrays; sorts `highlights` by `label` then `text`.
  - `computeHashes(app: ITrustIndexAppData): { materialHash: string; fullHash: string }`.

- [ ] **Step 1: Write the failing test**

```typescript
// Servers/utils/__tests__/aiTrustIndexHash.test.ts
import { computeHashes } from "../aiTrustIndexHash";
import { ITrustIndexAppData } from "../../domain.layer/interfaces/i.aiTrustIndex";

const baseApp: ITrustIndexAppData = {
  slug: "claude", name: "Claude", vendor: "Anthropic", domain: "claude.ai",
  category: "Assistant", scoreOutOf100: 83, letterGrade: "B", displayedGrade: "B",
  confidence: "High", dealbreakerFlags: [], summary: "Strong policy.",
  highlights: [{ label: "Training", text: "Opt-out." }, { label: "Deletion", text: "30 days." }],
  policyUrl: "https://anthropic.com/legal/privacy", policyLastUpdated: "2026-06-08",
  modalities: ["text"], processesBiometrics: false,
  iconUrl: "https://icons.duckduckgo.com/ip3/claude.ai.ico",
};

describe("computeHashes", () => {
  it("is stable across object key and array ordering (no false 'changed')", () => {
    const a = computeHashes(baseApp);
    const reordered: ITrustIndexAppData = {
      ...baseApp,
      modalities: [...baseApp.modalities].reverse(),
      highlights: [...baseApp.highlights].reverse(),
      dealbreakerFlags: [],
    };
    const b = computeHashes(reordered);
    expect(b.fullHash).toBe(a.fullHash);
    expect(b.materialHash).toBe(a.materialHash);
  });

  it("ignores iconUrl in both hashes (cosmetic/derived)", () => {
    const a = computeHashes(baseApp);
    const b = computeHashes({ ...baseApp, iconUrl: "https://example.com/other.ico" });
    expect(b.fullHash).toBe(a.fullHash);
    expect(b.materialHash).toBe(a.materialHash);
  });

  it("ignores policyUrl query/fragment in full hash", () => {
    const a = computeHashes(baseApp);
    const b = computeHashes({ ...baseApp, policyUrl: baseApp.policyUrl + "?v=2#section" });
    expect(b.fullHash).toBe(a.fullHash);
  });

  it("changes full hash but NOT material hash when only summary is reworded", () => {
    const a = computeHashes(baseApp);
    const b = computeHashes({ ...baseApp, summary: "A reworded summary." });
    expect(b.materialHash).toBe(a.materialHash);
    expect(b.fullHash).not.toBe(a.fullHash);
  });

  it("changes material hash when grade changes", () => {
    const a = computeHashes(baseApp);
    const b = computeHashes({ ...baseApp, letterGrade: "C", displayedGrade: "C", scoreOutOf100: 60 });
    expect(b.materialHash).not.toBe(a.materialHash);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Servers && npx jest utils/__tests__/aiTrustIndexHash.test.ts`
Expected: FAIL — "Cannot find module '../aiTrustIndexHash'".

- [ ] **Step 3: Write the implementation**

```typescript
// Servers/utils/aiTrustIndexHash.ts
import { createHash } from "crypto";
import { ITrustIndexAppData } from "../domain.layer/interfaces/i.aiTrustIndex";

/** Recursively sort object keys and unordered arrays so the hash is order-independent. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(canonicalize);
    // Sort by stable JSON of each item so element order never affects the hash.
    return items
      .map((v) => ({ v, k: JSON.stringify(v) }))
      .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
      .map((x) => x.v);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = canonicalize(obj[key]);
    return out;
  }
  return value;
}

/** Strip query string and fragment from a URL; return original on parse failure. */
function stripUrlNoise(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

function sha256(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(input))).digest("hex");
}

export function computeHashes(app: ITrustIndexAppData): {
  materialHash: string;
  fullHash: string;
} {
  const material = {
    scoreOutOf100: app.scoreOutOf100,
    letterGrade: app.letterGrade,
    displayedGrade: app.displayedGrade,
    dealbreakerFlags: app.dealbreakerFlags ?? [],
    policyLastUpdated: app.policyLastUpdated ?? null,
    processesBiometrics: app.processesBiometrics,
  };
  // Full = everything that renders/stores, minus derived iconUrl, with policyUrl noise stripped.
  const { iconUrl: _iconUrl, ...rest } = app;
  const full = { ...rest, policyUrl: stripUrlNoise(app.policyUrl ?? "") };
  return { materialHash: sha256(material), fullHash: sha256(full) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Servers && npx jest utils/__tests__/aiTrustIndexHash.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/aiTrustIndexHash.ts Servers/utils/__tests__/aiTrustIndexHash.test.ts
git commit -m "feat(ai-trust-index): canonical two-hash change detection"
```

---

### Task 4: Feed fetch + sanity gates

**Files:**
- Create: `Servers/utils/aiTrustIndexFeed.ts`
- Test: `Servers/utils/__tests__/aiTrustIndexFeed.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks (pure).
- Produces:
  - `FEED_URL = "https://verifywise.ai/ai-trust-index.json"`.
  - `validateFeed(raw: unknown, lastGoodCount: number | null): { ok: true; apps: ITrustIndexAppData[] } | { ok: false; reason: string }` — applies all gates from spec §7.
  - `fetchFeed(deps?: { get?: (url: string) => Promise<{ status: number; data: unknown }> }): Promise<unknown>` — axios GET with timeout; `deps.get` injectable for tests.

- [ ] **Step 1: Write the failing test**

```typescript
// Servers/utils/__tests__/aiTrustIndexFeed.test.ts
import { validateFeed } from "../aiTrustIndexFeed";

const app = (slug: string) => ({
  slug, name: slug, vendor: "V", domain: `${slug}.com`, category: "Assistant",
  scoreOutOf100: 50, letterGrade: "C", displayedGrade: "C", confidence: "High",
  dealbreakerFlags: [], summary: "s", highlights: [], policyUrl: "https://x.com",
  policyLastUpdated: null, modalities: ["text"], processesBiometrics: false,
});
const feed = (n: number, extra = {}) => ({
  feedVersion: 1, count: n, apps: Array.from({ length: n }, (_, i) => app(`a${i}`)), ...extra,
});

describe("validateFeed", () => {
  it("accepts a healthy feed", () => {
    const r = validateFeed(feed(37), 37);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.apps).toHaveLength(37);
  });
  it("rejects a non-1 feedVersion", () => {
    expect(validateFeed(feed(37, { feedVersion: 2 }), 37)).toMatchObject({ ok: false });
  });
  it("rejects when count !== apps.length", () => {
    expect(validateFeed({ feedVersion: 1, count: 99, apps: [app("a")] }, 37)).toMatchObject({ ok: false });
  });
  it("rejects an empty / below-absolute-floor feed", () => {
    expect(validateFeed(feed(0), 37)).toMatchObject({ ok: false });
    expect(validateFeed(feed(5), 37)).toMatchObject({ ok: false }); // < 10 absolute floor
  });
  it("rejects a feed below 50% of last good count", () => {
    expect(validateFeed(feed(15), 40)).toMatchObject({ ok: false }); // 15 < 20
  });
  it("accepts when no prior good count exists (first seed) if above absolute floor", () => {
    expect(validateFeed(feed(12), null)).toMatchObject({ ok: true });
  });
  it("drops individual apps missing required fields but keeps the run", () => {
    const bad = feed(12);
    delete (bad.apps[0] as any).slug;
    const r = validateFeed(bad, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.apps).toHaveLength(11);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Servers && npx jest utils/__tests__/aiTrustIndexFeed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// Servers/utils/aiTrustIndexFeed.ts
import axios from "axios";
import { ITrustIndexAppData } from "../domain.layer/interfaces/i.aiTrustIndex";

export const FEED_URL = "https://verifywise.ai/ai-trust-index.json";
const ABSOLUTE_FLOOR = 10;

const REQUIRED_KEYS: (keyof ITrustIndexAppData)[] = [
  "slug", "name", "category", "scoreOutOf100", "letterGrade",
  "displayedGrade", "dealbreakerFlags", "processesBiometrics",
];

function hasRequired(a: any): a is ITrustIndexAppData {
  return a && typeof a === "object" && REQUIRED_KEYS.every((k) => a[k] !== undefined && a[k] !== null);
}

export type ValidateResult =
  | { ok: true; apps: ITrustIndexAppData[] }
  | { ok: false; reason: string };

export function validateFeed(raw: unknown, lastGoodCount: number | null): ValidateResult {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "feed is not an object" };
  const f = raw as Record<string, unknown>;
  if (f.feedVersion !== 1) return { ok: false, reason: `unsupported feedVersion ${String(f.feedVersion)}` };
  if (!Array.isArray(f.apps)) return { ok: false, reason: "apps is not an array" };
  if (typeof f.count !== "number" || f.count !== f.apps.length)
    return { ok: false, reason: `count (${String(f.count)}) != apps.length (${f.apps.length})` };
  if (f.apps.length < ABSOLUTE_FLOOR) return { ok: false, reason: `below absolute floor (${f.apps.length})` };
  if (lastGoodCount != null && f.apps.length < lastGoodCount * 0.5)
    return { ok: false, reason: `below 50% of last good count (${f.apps.length} < ${lastGoodCount})` };
  const apps = (f.apps as unknown[]).filter(hasRequired) as ITrustIndexAppData[];
  return { ok: true, apps };
}

export async function fetchFeed(
  deps?: { get?: (url: string) => Promise<{ status: number; data: unknown }> }
): Promise<unknown> {
  const get = deps?.get ?? ((url: string) => axios.get(url, { timeout: 20000 }));
  const res = await get(FEED_URL);
  if (res.status !== 200) throw new Error(`feed HTTP ${res.status}`);
  return res.data;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Servers && npx jest utils/__tests__/aiTrustIndexFeed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/aiTrustIndexFeed.ts Servers/utils/__tests__/aiTrustIndexFeed.test.ts
git commit -m "feat(ai-trust-index): feed fetch + sanity gates"
```

---

# PHASE 3 — Data access layer

### Task 5: Browse + tracking + settings queries

**Files:**
- Create: `Servers/utils/aiTrustIndex.utils.ts`
- Test: `Servers/utils/__tests__/aiTrustIndex.utils.test.ts`

**Interfaces:**
- Consumes: `sequelize` from `../database/db`; `computeHashes` (Task 3).
- Produces (all use unqualified table names + `:replacements`):
  - `getAppsQuery(orgId, { search?, category?, grade?, page, pageSize, sort })` → `{ apps, total, page, pageSize, categories }` (each app row: promoted cols + `data` + `is_tracked` boolean).
  - `getAppBySlugQuery(orgId, slug)` → `{ ...row, is_tracked, no_longer_in_index } | null`.
  - `getTrackedQuery(orgId)` → array of rows (LEFT JOIN, includes `no_longer_in_index`).
  - `trackAppQuery(orgId, slug, userId)` → `{ tracked: boolean }` (false if slug not active/not found).
  - `trackAppsBulkQuery(orgId, slugs, userId)` → `{ tracked: string[]; skipped: string[] }`.
  - `untrackAppQuery(orgId, slug)` → `void`.
  - `getSettingsQuery(orgId)` → `{ recipientUserIds, recipientEmails }`.
  - `upsertSettingsQuery(orgId, userId, recipientUserIds, recipientEmails)` → `void`.
  - `normalizeSlug(slug): string` → `slug.trim().toLowerCase()`.

> Most functions here are thin SQL wrappers best covered by integration tests that need a live DB. For the unit layer, test only the pure helper (`normalizeSlug`) and the SQL-building branches you can exercise without a DB by asserting on a captured `sequelize.query` mock. Heavier DB-backed behavior is verified manually in Task 13 (live run) and by the existing CI DB if present.

- [ ] **Step 1: Write the failing test (pure helper + query shape via mock)**

```typescript
// Servers/utils/__tests__/aiTrustIndex.utils.test.ts
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));
import { normalizeSlug, getAppsQuery } from "../aiTrustIndex.utils";
import { sequelize } from "../../database/db";

describe("normalizeSlug", () => {
  it("lowercases and trims", () => {
    expect(normalizeSlug("  ChatGPT  ")).toBe("chatgpt");
  });
});

describe("getAppsQuery", () => {
  it("only selects active apps and passes the org id for is_tracked", async () => {
    (sequelize.query as jest.Mock).mockResolvedValueOnce([{ total: "0" }]) // count
      .mockResolvedValueOnce([]); // data
    await getAppsQuery(7, { page: 1, pageSize: 25, sort: "score" });
    const sql = (sequelize.query as jest.Mock).mock.calls.map((c) => c[0]).join("\n");
    expect(sql).toMatch(/is_active\s*=\s*true|is_active = TRUE/i);
    const repl = (sequelize.query as jest.Mock).mock.calls[0][1].replacements;
    expect(repl.organizationId).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Servers && npx jest utils/__tests__/aiTrustIndex.utils.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// Servers/utils/aiTrustIndex.utils.ts
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";

export function normalizeSlug(slug: string): string {
  return String(slug).trim().toLowerCase();
}

const SORT_COLUMNS: Record<string, string> = {
  score: "score_out_of_100 DESC NULLS LAST",
  name: "name ASC",
};

export async function getAppsQuery(
  organizationId: number,
  opts: { search?: string; category?: string; grade?: string; page: number; pageSize: number; sort: string }
): Promise<{ apps: any[]; total: number; page: number; pageSize: number; categories: string[] }> {
  const { search, category, grade } = opts;
  const page = Math.max(1, opts.page);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize));
  const offset = (page - 1) * pageSize;
  const orderBy = SORT_COLUMNS[opts.sort] ?? SORT_COLUMNS.score;

  const conditions: string[] = ["a.is_active = TRUE"];
  const replacements: Record<string, unknown> = { organizationId, limit: pageSize, offset };
  if (search) { conditions.push("(a.name ILIKE :search OR a.vendor ILIKE :search)"); replacements.search = `%${search}%`; }
  if (category) { conditions.push("a.category = :category"); replacements.category = category; }
  if (grade) { conditions.push("a.letter_grade = :grade"); replacements.grade = grade; }
  const where = "WHERE " + conditions.join(" AND ");

  const countSql = `SELECT COUNT(*) AS total FROM ai_trust_index_apps a ${where};`;
  const dataSql = `
    SELECT a.*, (t.app_slug IS NOT NULL) AS is_tracked
    FROM ai_trust_index_apps a
    LEFT JOIN ai_trust_index_tracked_apps t
      ON t.app_slug = a.slug AND t.organization_id = :organizationId
    ${where}
    ORDER BY ${orderBy}, a.id ASC
    LIMIT :limit OFFSET :offset;`;
  const catSql = `SELECT DISTINCT category FROM ai_trust_index_apps WHERE is_active = TRUE AND category IS NOT NULL ORDER BY category;`;

  const [countRows, dataRows, catRows] = await Promise.all([
    sequelize.query(countSql, { replacements, type: QueryTypes.SELECT }),
    sequelize.query(dataSql, { replacements, type: QueryTypes.SELECT }),
    sequelize.query(catSql, { type: QueryTypes.SELECT }),
  ]);
  return {
    apps: dataRows as any[],
    total: parseInt((countRows[0] as { total: string }).total, 10),
    page, pageSize,
    categories: (catRows as { category: string }[]).map((r) => r.category),
  };
}

export async function getAppBySlugQuery(organizationId: number, slugRaw: string) {
  const slug = normalizeSlug(slugRaw);
  const rows = (await sequelize.query(
    `SELECT a.*, (t.app_slug IS NOT NULL) AS is_tracked
     FROM ai_trust_index_apps a
     LEFT JOIN ai_trust_index_tracked_apps t
       ON t.app_slug = a.slug AND t.organization_id = :organizationId
     WHERE a.slug = :slug;`,
    { replacements: { organizationId, slug }, type: QueryTypes.SELECT }
  )) as any[];
  if (!rows.length) return null;
  const row = rows[0];
  return { ...row, no_longer_in_index: row.is_active === false };
}

export async function getTrackedQuery(organizationId: number) {
  return (await sequelize.query(
    `SELECT t.app_slug, a.id, a.name, a.vendor, a.category, a.letter_grade,
            a.score_out_of_100, a.data, a.is_active,
            (a.id IS NULL OR a.is_active = FALSE) AS no_longer_in_index
     FROM ai_trust_index_tracked_apps t
     LEFT JOIN ai_trust_index_apps a ON a.slug = t.app_slug
     WHERE t.organization_id = :organizationId
     ORDER BY a.score_out_of_100 DESC NULLS LAST, t.app_slug ASC;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT }
  )) as any[];
}

export async function trackAppQuery(organizationId: number, slugRaw: string, userId: number) {
  const slug = normalizeSlug(slugRaw);
  const active = (await sequelize.query(
    `SELECT 1 FROM ai_trust_index_apps WHERE slug = :slug AND is_active = TRUE;`,
    { replacements: { slug }, type: QueryTypes.SELECT }
  )) as unknown[];
  if (!active.length) return { tracked: false };
  await sequelize.query(
    `INSERT INTO ai_trust_index_tracked_apps (organization_id, app_slug, tracked_by, created_at)
     VALUES (:organizationId, :slug, :userId, NOW())
     ON CONFLICT (organization_id, app_slug) DO NOTHING;`,
    { replacements: { organizationId, slug, userId } }
  );
  return { tracked: true };
}

export async function trackAppsBulkQuery(organizationId: number, slugsRaw: string[], userId: number) {
  const slugs = Array.from(new Set(slugsRaw.map(normalizeSlug))).slice(0, 200);
  const tracked: string[] = [];
  const skipped: string[] = [];
  await sequelize.transaction(async (transaction) => {
    for (const slug of slugs) {
      const active = (await sequelize.query(
        `SELECT 1 FROM ai_trust_index_apps WHERE slug = :slug AND is_active = TRUE;`,
        { replacements: { slug }, type: QueryTypes.SELECT, transaction }
      )) as unknown[];
      if (!active.length) { skipped.push(slug); continue; }
      // RETURNING makes "inserted vs. already-tracked" deterministic: a conflict
      // (DO NOTHING) returns zero rows; a real insert returns one row.
      const inserted = (await sequelize.query(
        `INSERT INTO ai_trust_index_tracked_apps (organization_id, app_slug, tracked_by, created_at)
         VALUES (:organizationId, :slug, :userId, NOW())
         ON CONFLICT (organization_id, app_slug) DO NOTHING
         RETURNING id;`,
        { replacements: { organizationId, slug, userId }, type: QueryTypes.SELECT, transaction }
      )) as unknown[];
      if (inserted.length) tracked.push(slug);
      else skipped.push(slug);
    }
  });
  return { tracked, skipped };
}

export async function untrackAppQuery(organizationId: number, slugRaw: string) {
  const slug = normalizeSlug(slugRaw);
  await sequelize.query(
    `DELETE FROM ai_trust_index_tracked_apps WHERE organization_id = :organizationId AND app_slug = :slug;`,
    { replacements: { organizationId, slug } }
  );
}

export async function getSettingsQuery(organizationId: number) {
  const rows = (await sequelize.query(
    `SELECT recipient_user_ids, recipient_emails FROM ai_trust_index_settings WHERE organization_id = :organizationId;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT }
  )) as any[];
  if (!rows.length) return { recipientUserIds: [], recipientEmails: [] };
  return { recipientUserIds: rows[0].recipient_user_ids ?? [], recipientEmails: rows[0].recipient_emails ?? [] };
}

export async function upsertSettingsQuery(
  organizationId: number, userId: number, recipientUserIds: number[], recipientEmails: string[]
) {
  await sequelize.query(
    `INSERT INTO ai_trust_index_settings (organization_id, recipient_user_ids, recipient_emails, updated_by, updated_at)
     VALUES (:organizationId, :userIds::jsonb, :emails::jsonb, :userId, NOW())
     ON CONFLICT (organization_id) DO UPDATE
       SET recipient_user_ids = :userIds::jsonb, recipient_emails = :emails::jsonb,
           updated_by = :userId, updated_at = NOW();`,
    { replacements: {
        organizationId, userId,
        userIds: JSON.stringify(recipientUserIds),
        emails: JSON.stringify(recipientEmails),
      } }
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Servers && npx jest utils/__tests__/aiTrustIndex.utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/aiTrustIndex.utils.ts Servers/utils/__tests__/aiTrustIndex.utils.test.ts
git commit -m "feat(ai-trust-index): browse, tracking, settings queries"
```

---

### Task 6: Sync queries (upsert/diff + recipients)

**Files:**
- Modify: `Servers/utils/aiTrustIndex.utils.ts`
- Test: `Servers/utils/__tests__/aiTrustIndex.recipients.test.ts`

**Interfaces:**
- Consumes: `computeHashes` (Task 3).
- Produces:
  - `getMetaQuery()` → `{ seeded_at, last_good_count, last_run_week }`.
  - `upsertFeedTx(apps: ITrustIndexAppData[]): Promise<{ materialChanged: string[]; newlyRemoved: string[]; wasFirstSeed: boolean }>` — runs the whole diff in ONE transaction, sets `seeded_at` on first seed, updates `last_good_count`/`last_run_week`.
  - `getAffectedOrgsBySlugs(slugs: string[])` → `Array<{ organization_id: number; app_slug: string }>`.
  - `resolveRecipients(organizationId)` → `string[]` (users ∪ free-text, fallback to Admin/SuperAdmin), all org-filtered.
  - `currentIsoWeek(date: Date): string` (e.g. `"2026-W25"`).

- [ ] **Step 1: Write the failing test (recipients fallback + isoweek, mocked DB)**

```typescript
// Servers/utils/__tests__/aiTrustIndex.recipients.test.ts
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
import { resolveRecipients, currentIsoWeek } from "../aiTrustIndex.utils";
import { sequelize } from "../../database/db";

const q = sequelize.query as jest.Mock;

describe("currentIsoWeek", () => {
  it("formats ISO week", () => {
    expect(currentIsoWeek(new Date(Date.UTC(2026, 5, 15)))).toMatch(/^2026-W\d{2}$/);
  });
});

describe("resolveRecipients", () => {
  beforeEach(() => q.mockReset());
  it("unions configured users and free-text emails", async () => {
    q.mockResolvedValueOnce([{ recipient_user_ids: [1], recipient_emails: ["dpo@acme.com"] }]) // settings
     .mockResolvedValueOnce([{ email: "user1@acme.com" }]); // user emails for org
    const r = await resolveRecipients(7);
    expect(r.sort()).toEqual(["dpo@acme.com", "user1@acme.com"]);
  });
  it("falls back to org Admins when no recipients are configured", async () => {
    q.mockResolvedValueOnce([{ recipient_user_ids: [], recipient_emails: [] }]) // settings
     .mockResolvedValueOnce([]) // user emails (none)
     .mockResolvedValueOnce([{ email: "admin@acme.com" }]); // admin fallback
    const r = await resolveRecipients(7);
    expect(r).toEqual(["admin@acme.com"]);
    const adminSql = q.mock.calls[2][0];
    expect(adminSql).toMatch(/role/i);
    expect(adminSql).toMatch(/organization_id\s*=\s*:organizationId/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Servers && npx jest utils/__tests__/aiTrustIndex.recipients.test.ts`
Expected: FAIL — `resolveRecipients`/`currentIsoWeek` not exported.

- [ ] **Step 3: Append the implementation to `aiTrustIndex.utils.ts`**

```typescript
// --- append to Servers/utils/aiTrustIndex.utils.ts ---
import { computeHashes } from "./aiTrustIndexHash";
import { ITrustIndexAppData } from "../domain.layer/interfaces/i.aiTrustIndex";

export function currentIsoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week =
    1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function getMetaQuery() {
  const rows = (await sequelize.query(
    `SELECT seeded_at, last_good_count, last_run_week FROM ai_trust_index_meta WHERE id = 1;`,
    { type: QueryTypes.SELECT }
  )) as any[];
  return rows[0] ?? { seeded_at: null, last_good_count: null, last_run_week: null };
}

export async function upsertFeedTx(apps: ITrustIndexAppData[]): Promise<{
  materialChanged: string[]; newlyRemoved: string[]; wasFirstSeed: boolean;
}> {
  const materialChanged: string[] = [];
  const newlyRemoved: string[] = [];
  let wasFirstSeed = false;

  await sequelize.transaction(async (transaction) => {
    const metaRows = (await sequelize.query(
      `SELECT seeded_at FROM ai_trust_index_meta WHERE id = 1 FOR UPDATE;`,
      { type: QueryTypes.SELECT, transaction }
    )) as any[];
    wasFirstSeed = !metaRows[0]?.seeded_at;

    const seenSlugs: string[] = [];
    for (const app of apps) {
      const slug = normalizeSlug(app.slug);
      seenSlugs.push(slug);
      const { materialHash, fullHash } = computeHashes(app);
      const existing = (await sequelize.query(
        `SELECT material_hash, full_hash FROM ai_trust_index_apps WHERE slug = :slug;`,
        { replacements: { slug }, type: QueryTypes.SELECT, transaction }
      )) as any[];

      if (existing.length) {
        if (existing[0].material_hash !== materialHash) materialChanged.push(slug);
        const fullChanged = existing[0].full_hash !== fullHash;
        await sequelize.query(
          `UPDATE ai_trust_index_apps SET
             name = :name, vendor = :vendor, category = :category,
             letter_grade = :grade, score_out_of_100 = :score,
             data = :data::jsonb, material_hash = :mh, full_hash = :fh,
             is_active = TRUE, removed_at = NULL, last_fetched_at = NOW()
             ${fullChanged ? ", last_changed_at = NOW()" : ""}
           WHERE slug = :slug;`,
          { replacements: {
              slug, name: app.name, vendor: app.vendor ?? null, category: app.category ?? null,
              grade: app.letterGrade ?? null, score: app.scoreOutOf100 ?? null,
              data: JSON.stringify(app), mh: materialHash, fh: fullHash,
            }, transaction }
        );
      } else {
        await sequelize.query(
          `INSERT INTO ai_trust_index_apps
             (slug, name, vendor, category, letter_grade, score_out_of_100, data,
              material_hash, full_hash, is_active, last_changed_at, last_fetched_at)
           VALUES (:slug, :name, :vendor, :category, :grade, :score, :data::jsonb,
              :mh, :fh, TRUE, NOW(), NOW());`,
          { replacements: {
              slug, name: app.name, vendor: app.vendor ?? null, category: app.category ?? null,
              grade: app.letterGrade ?? null, score: app.scoreOutOf100 ?? null,
              data: JSON.stringify(app), mh: materialHash, fh: fullHash,
            }, transaction }
        );
        // New app on a non-first-seed run is NOT a "material change" email (nothing to compare).
      }
    }

    // Soft-delete apps that were active but are missing from this feed; collect newly removed.
    const removedRows = (await sequelize.query(
      `UPDATE ai_trust_index_apps
         SET is_active = FALSE, removed_at = NOW()
       WHERE is_active = TRUE AND slug <> ALL(ARRAY[:seen]::varchar[])
       RETURNING slug;`,
      { replacements: { seen: seenSlugs }, type: QueryTypes.SELECT, transaction }
    )) as any[];
    for (const r of removedRows) newlyRemoved.push(r.slug);

    await sequelize.query(
      `UPDATE ai_trust_index_meta
         SET last_good_count = :count, last_run_week = :week
             ${wasFirstSeed ? ", seeded_at = NOW()" : ""}
       WHERE id = 1;`,
      { replacements: { count: apps.length, week: currentIsoWeek(new Date()) }, transaction }
    );
  });

  return { materialChanged, newlyRemoved, wasFirstSeed };
}

export async function getAffectedOrgsBySlugs(slugs: string[]) {
  if (!slugs.length) return [] as { organization_id: number; app_slug: string }[];
  return (await sequelize.query(
    `SELECT DISTINCT organization_id, app_slug
     FROM ai_trust_index_tracked_apps
     WHERE app_slug = ANY(ARRAY[:slugs]::varchar[]);`,
    { replacements: { slugs }, type: QueryTypes.SELECT }
  )) as { organization_id: number; app_slug: string }[];
}

export async function resolveRecipients(organizationId: number): Promise<string[]> {
  const settings = (await sequelize.query(
    `SELECT recipient_user_ids, recipient_emails FROM ai_trust_index_settings WHERE organization_id = :organizationId;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT }
  )) as any[];
  const userIds: number[] = settings[0]?.recipient_user_ids ?? [];
  const freeText: string[] = settings[0]?.recipient_emails ?? [];

  let userEmails: string[] = [];
  if (userIds.length) {
    const rows = (await sequelize.query(
      `SELECT email FROM users
       WHERE organization_id = :organizationId AND id = ANY(ARRAY[:ids]::int[]);`,
      { replacements: { organizationId, ids: userIds }, type: QueryTypes.SELECT }
    )) as { email: string }[];
    userEmails = rows.map((r) => r.email);
  }

  let recipients = Array.from(new Set([...userEmails, ...freeText].map((e) => e.trim().toLowerCase()).filter(Boolean)));
  if (recipients.length === 0) {
    const admins = (await sequelize.query(
      `SELECT u.email FROM users u JOIN roles r ON u.role_id = r.id
       WHERE u.organization_id = :organizationId AND r.name IN ('Admin','SuperAdmin');`,
      { replacements: { organizationId }, type: QueryTypes.SELECT }
    )) as { email: string }[];
    recipients = Array.from(new Set(admins.map((a) => a.email.trim().toLowerCase()).filter(Boolean)));
  }
  return recipients;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Servers && npx jest utils/__tests__/aiTrustIndex.recipients.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/aiTrustIndex.utils.ts Servers/utils/__tests__/aiTrustIndex.recipients.test.ts
git commit -m "feat(ai-trust-index): sync upsert/diff + recipient resolution"
```

---

# PHASE 4 — API surface

### Task 7: Controller + routes + mount

**Files:**
- Create: `Servers/controllers/aiTrustIndex.ctrl.ts`
- Create: `Servers/routes/aiTrustIndex.route.ts`
- Modify: `Servers/app.ts` (add import + `app.use`)
- Test: `Servers/controllers/__tests__/aiTrustIndex.ctrl.test.ts`

**Interfaces:**
- Consumes: all Task 5 query functions; `STATUS_CODE`; `authenticateJWT`.
- Produces: HTTP endpoints under `/api/ai-trust-index` (spec §10).

- [ ] **Step 1: Write the failing test (settings PUT is Admin-only)**

```typescript
// Servers/controllers/__tests__/aiTrustIndex.ctrl.test.ts
jest.mock("../../utils/aiTrustIndex.utils", () => ({
  upsertSettingsQuery: jest.fn().mockResolvedValue(undefined),
  getSettingsQuery: jest.fn().mockResolvedValue({ recipientUserIds: [], recipientEmails: [] }),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(), logSuccess: jest.fn(), logFailure: jest.fn(),
}));
import { updateSettings } from "../aiTrustIndex.ctrl";
import { upsertSettingsQuery } from "../../utils/aiTrustIndex.utils";

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("updateSettings", () => {
  it("rejects non-admins with 403 and does not write", async () => {
    const req: any = { role: "Editor", organizationId: 7, userId: 1, body: { recipientUserIds: [], recipientEmails: [] } };
    const res = mockRes();
    await updateSettings(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(upsertSettingsQuery).not.toHaveBeenCalled();
  });
  it("rejects malformed emails with 400", async () => {
    const req: any = { role: "Admin", organizationId: 7, userId: 1, body: { recipientUserIds: [], recipientEmails: ["not-an-email"] } };
    const res = mockRes();
    await updateSettings(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("accepts an admin with valid input", async () => {
    const req: any = { role: "Admin", organizationId: 7, userId: 1, body: { recipientUserIds: [2], recipientEmails: ["dpo@acme.com"] } };
    const res = mockRes();
    await updateSettings(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(upsertSettingsQuery).toHaveBeenCalledWith(7, 1, [2], ["dpo@acme.com"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Servers && npx jest controllers/__tests__/aiTrustIndex.ctrl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the controller**

```typescript
// Servers/controllers/aiTrustIndex.ctrl.ts
import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import {
  getAppsQuery, getAppBySlugQuery, getTrackedQuery,
  trackAppQuery, trackAppsBulkQuery, untrackAppQuery,
  getSettingsQuery, upsertSettingsQuery,
} from "../utils/aiTrustIndex.utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isAdmin = (role?: string) => role === "Admin" || role === "SuperAdmin";

export async function getApps(req: Request, res: Response): Promise<any> {
  const fn = "getApps", file = "aiTrustIndex.ctrl.ts";
  logProcessing({ description: "list trust index apps", functionName: fn, fileName: file, userId: req.userId!, organizationId: req.organizationId! });
  try {
    const result = await getAppsQuery(req.organizationId!, {
      search: req.query.search as string | undefined,
      category: req.query.category as string | undefined,
      grade: req.query.grade as string | undefined,
      page: parseInt((req.query.page as string) ?? "1", 10),
      pageSize: parseInt((req.query.pageSize as string) ?? "25", 10),
      sort: (req.query.sort as string) ?? "score",
    });
    await logSuccess({ eventType: "Read", description: "listed apps", functionName: fn, fileName: file, userId: req.userId!, organizationId: req.organizationId! });
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({ eventType: "Read", description: "list apps failed", functionName: fn, fileName: file, error: error as Error, userId: req.userId!, organizationId: req.organizationId! });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getApp(req: Request, res: Response): Promise<any> {
  try {
    const app = await getAppBySlugQuery(req.organizationId!, req.params.slug);
    if (!app) return res.status(404).json(STATUS_CODE[404]("App not found"));
    return res.status(200).json(STATUS_CODE[200](app));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getTracked(req: Request, res: Response): Promise<any> {
  try {
    const tracked = await getTrackedQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](tracked));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function trackApp(req: Request, res: Response): Promise<any> {
  try {
    const slug = req.body?.slug;
    if (!slug) return res.status(400).json(STATUS_CODE[400]("slug is required"));
    const result = await trackAppQuery(req.organizationId!, slug, req.userId!);
    if (!result.tracked) return res.status(400).json(STATUS_CODE[400]("App not found or not active"));
    return res.status(201).json(STATUS_CODE[201](result));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function trackAppsBulk(req: Request, res: Response): Promise<any> {
  try {
    const slugs = req.body?.slugs;
    if (!Array.isArray(slugs) || slugs.length === 0)
      return res.status(400).json(STATUS_CODE[400]("slugs must be a non-empty array"));
    if (slugs.length > 200) return res.status(400).json(STATUS_CODE[400]("too many slugs (max 200)"));
    const result = await trackAppsBulkQuery(req.organizationId!, slugs, req.userId!);
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function untrackApp(req: Request, res: Response): Promise<any> {
  try {
    await untrackAppQuery(req.organizationId!, req.params.slug);
    return res.status(200).json(STATUS_CODE[200]({ untracked: true }));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getSettings(req: Request, res: Response): Promise<any> {
  try {
    const settings = await getSettingsQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateSettings(req: Request, res: Response): Promise<any> {
  const fn = "updateSettings", file = "aiTrustIndex.ctrl.ts";
  logProcessing({ description: "update trust index settings", functionName: fn, fileName: file, userId: req.userId!, organizationId: req.organizationId! });
  try {
    if (!isAdmin(req.role)) return res.status(403).json(STATUS_CODE[403]("Admin access required"));
    const recipientUserIds = req.body?.recipientUserIds ?? [];
    const recipientEmails = req.body?.recipientEmails ?? [];
    if (!Array.isArray(recipientUserIds) || !Array.isArray(recipientEmails))
      return res.status(400).json(STATUS_CODE[400]("recipientUserIds and recipientEmails must be arrays"));
    const badEmail = recipientEmails.find((e: unknown) => typeof e !== "string" || !EMAIL_RE.test(e));
    if (badEmail !== undefined) return res.status(400).json(STATUS_CODE[400](`Invalid email: ${String(badEmail)}`));
    await upsertSettingsQuery(req.organizationId!, req.userId!, recipientUserIds, recipientEmails);
    await logSuccess({ eventType: "Update", description: "updated settings", functionName: fn, fileName: file, userId: req.userId!, organizationId: req.organizationId! });
    return res.status(200).json(STATUS_CODE[200]({ recipientUserIds, recipientEmails }));
  } catch (error) {
    await logFailure({ eventType: "Update", description: "update settings failed", functionName: fn, fileName: file, error: error as Error, userId: req.userId!, organizationId: req.organizationId! });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
```

- [ ] **Step 4: Write the routes**

```typescript
// Servers/routes/aiTrustIndex.route.ts
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  getApps, getApp, getTracked, trackApp, trackAppsBulk, untrackApp, getSettings, updateSettings,
} from "../controllers/aiTrustIndex.ctrl";

const router = express.Router();

router.get("/apps", authenticateJWT, getApps);
router.get("/apps/:slug", authenticateJWT, getApp);
router.get("/tracked", authenticateJWT, getTracked);
router.post("/tracked/bulk", authenticateJWT, trackAppsBulk);
router.post("/tracked", authenticateJWT, trackApp);
router.delete("/tracked/:slug", authenticateJWT, untrackApp);
router.get("/settings", authenticateJWT, getSettings);
router.put("/settings", authenticateJWT, updateSettings);

export default router;
```

- [ ] **Step 5: Mount in `Servers/app.ts`**

Add the import near the other route imports and the mount near the other `app.use("/api/...")` lines:

```typescript
import aiTrustIndexRoutes from "./routes/aiTrustIndex.route";
// ...
app.use("/api/ai-trust-index", aiTrustIndexRoutes);
```

- [ ] **Step 6: Run tests + build**

Run: `cd Servers && npx jest controllers/__tests__/aiTrustIndex.ctrl.test.ts && npm run build`
Expected: tests PASS; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add Servers/controllers/aiTrustIndex.ctrl.ts Servers/routes/aiTrustIndex.route.ts Servers/app.ts Servers/controllers/__tests__/aiTrustIndex.ctrl.test.ts
git commit -m "feat(ai-trust-index): REST API (browse, tracking, settings)"
```

---

# PHASE 5 — Weekly job + email

### Task 8: Digest email template

**Files:**
- Create: `Servers/templates/ai-trust-index-digest.mjml`

**Interfaces:**
- Produces: an MJML template with placeholders `{{orgName}}`, a `{{changedRows}}` block, and a `{{removedRows}}` block (rendered by the job in Task 9 via string substitution, matching the existing template approach).

- [ ] **Step 1: Inspect an existing template to match the rendering approach**

Run: `sed -n '1,40p' Servers/templates/ai-gateway-budget-warning.mjml`
Expected: see how placeholders + MJML structure are used (substitution tokens like `{{...}}`).

- [ ] **Step 2: Write the template**

```xml
<mjml>
  <mj-body background-color="#f4f6f8">
    <mj-section background-color="#13715B" padding="20px">
      <mj-column>
        <mj-text color="#ffffff" font-size="18px" font-weight="600">AI Trust Index — weekly update</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="24px">
      <mj-column>
        <mj-text font-size="14px" color="#344054">
          Changes were detected in AI apps your organization tracks.
        </mj-text>
        {{changedSection}}
        {{removedSection}}
        <mj-button background-color="#13715B" href="{{appUrl}}" align="left" border-radius="4px">
          Open AI Trust Index
        </mj-button>
      </mj-column>
    </mj-section>
    <mj-section padding="12px">
      <mj-column>
        <mj-text font-size="11px" color="#98a2b3" align="center">
          You receive this because you are a configured recipient for AI Trust Index alerts.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

- [ ] **Step 3: Commit**

```bash
git add Servers/templates/ai-trust-index-digest.mjml
git commit -m "feat(ai-trust-index): weekly digest email template"
```

---

### Task 9: The weekly sync job

**Files:**
- Create: `Servers/services/automations/actions/syncAiTrustIndex.ts`
- Test: `Servers/services/automations/tests/syncAiTrustIndex.spec.ts`

**Interfaces:**
- Consumes: `fetchFeed`, `validateFeed` (Task 4); `getMetaQuery`, `upsertFeedTx`, `getAffectedOrgsBySlugs`, `resolveRecipients`, `currentIsoWeek` (Task 6); `sendAutomationEmail(to: string[], subject: string, body: string, attachments?)` from `../../emailService`; `compileMjmlToHtml(template: string, data: Record<string,string>)` from `../../../tools/mjmlCompiler` (the canonical MJML renderer — does `{{key}}` substitution then renders, returns `Promise<string>`).
- Produces: `export async function syncAiTrustIndex(deps?): Promise<{ fetched: number; materialChanged: number; newlyRemoved: number; orgsEmailed: number; skipped?: string }>`. `deps` allows injecting the feed for tests.

> VERIFIED: the codebase renders MJML via `compileMjmlToHtml` (in `Servers/tools/mjmlCompiler.ts`), used by `emailService.ts` and `utils/inviteEmail.utils.ts`. Do NOT call `mjml2html` directly — use this helper. Templates are read with `fs.readFile(path, "utf8")`.

- [ ] **Step 1: Confirm the render + send helpers (already verified during planning)**

Run: `grep -n "compileMjmlToHtml" Servers/tools/mjmlCompiler.ts && grep -n "export const sendAutomationEmail" Servers/services/emailService.ts`
Expected: `compileMjmlToHtml` is exported (template + `Record<string,string>` data → `Promise<string>`); `sendAutomationEmail(to, subject, body, attachments?)` is exported.

- [ ] **Step 2: Write the failing test (first-seed is silent; second run emails)**

```typescript
// Servers/services/automations/tests/syncAiTrustIndex.spec.ts
jest.mock("../../../utils/aiTrustIndex.utils");
jest.mock("../../emailService", () => ({ sendAutomationEmail: jest.fn().mockResolvedValue(undefined) }));

import { syncAiTrustIndex } from "../actions/syncAiTrustIndex";
import * as utils from "../../../utils/aiTrustIndex.utils";
import { sendAutomationEmail } from "../../emailService";

const feedApp = (slug: string, grade = "B") => ({
  slug, name: slug, vendor: "V", domain: `${slug}.com`, category: "Assistant",
  scoreOutOf100: 80, letterGrade: grade, displayedGrade: grade, confidence: "High",
  dealbreakerFlags: [], summary: "s", highlights: [], policyUrl: "https://x.com",
  policyLastUpdated: null, modalities: ["text"], processesBiometrics: false,
});
const feed = { feedVersion: 1, count: 12, apps: Array.from({ length: 12 }, (_, i) => feedApp(`a${i}`)) };

describe("syncAiTrustIndex", () => {
  beforeEach(() => jest.clearAllMocks());

  it("seeds silently on first run (no emails)", async () => {
    (utils.getMetaQuery as jest.Mock).mockResolvedValue({ seeded_at: null, last_good_count: null, last_run_week: null });
    (utils.upsertFeedTx as jest.Mock).mockResolvedValue({ materialChanged: ["a0"], newlyRemoved: [], wasFirstSeed: true });
    const r = await syncAiTrustIndex({ feed });
    expect(sendAutomationEmail).not.toHaveBeenCalled();
    expect(r.orgsEmailed).toBe(0);
  });

  it("emails affected orgs on a subsequent run", async () => {
    (utils.getMetaQuery as jest.Mock).mockResolvedValue({ seeded_at: new Date(), last_good_count: 12, last_run_week: "2026-W10" });
    (utils.upsertFeedTx as jest.Mock).mockResolvedValue({ materialChanged: ["a0"], newlyRemoved: ["a9"], wasFirstSeed: false });
    (utils.getAffectedOrgsBySlugs as jest.Mock).mockResolvedValue([{ organization_id: 7, app_slug: "a0" }, { organization_id: 7, app_slug: "a9" }]);
    (utils.resolveRecipients as jest.Mock).mockResolvedValue(["admin@acme.com"]);
    const r = await syncAiTrustIndex({ feed });
    expect(sendAutomationEmail).toHaveBeenCalledTimes(1);
    expect(r.orgsEmailed).toBe(1);
  });

  it("no-ops if already run this ISO week", async () => {
    const thisWeek = (utils as any).currentIsoWeek?.(new Date()) ?? "2026-W25";
    (utils.currentIsoWeek as jest.Mock).mockReturnValue(thisWeek);
    (utils.getMetaQuery as jest.Mock).mockResolvedValue({ seeded_at: new Date(), last_good_count: 12, last_run_week: thisWeek });
    const r = await syncAiTrustIndex({ feed });
    expect(utils.upsertFeedTx).not.toHaveBeenCalled();
    expect(r.skipped).toBeDefined();
  });

  it("aborts and writes nothing on a bad feed", async () => {
    (utils.getMetaQuery as jest.Mock).mockResolvedValue({ seeded_at: new Date(), last_good_count: 40, last_run_week: "2026-W10" });
    const r = await syncAiTrustIndex({ feed: { feedVersion: 2, count: 0, apps: [] } });
    expect(utils.upsertFeedTx).not.toHaveBeenCalled();
    expect(sendAutomationEmail).not.toHaveBeenCalled();
    expect(r.skipped).toBeDefined();
  });
});
```

- [ ] **Step 3: Write the implementation**

> Use the MJML render helper you found in Step 1 in place of `renderTemplate` below if the codebase names it differently. The control flow (gate → tx → email) must match exactly.

```typescript
// Servers/services/automations/actions/syncAiTrustIndex.ts
import { promises as fs } from "fs";
import path from "path";
import { fetchFeed, validateFeed } from "../../../utils/aiTrustIndexFeed";
import {
  getMetaQuery, upsertFeedTx, getAffectedOrgsBySlugs, resolveRecipients, currentIsoWeek,
} from "../../../utils/aiTrustIndex.utils";
import { sendAutomationEmail } from "../../emailService";
import { compileMjmlToHtml } from "../../../tools/mjmlCompiler";
import logger from "../../../utils/logger/fileLogger";

const APP_URL = (process.env.FRONTEND_URL ?? "http://localhost:5173") + "/ai-trust-index/tracked";

// Build MJML fragments (valid <mj-text> components) injected into the template's {{...}} slots.
function sectionMjml(title: string, slugs: string[]): string {
  if (!slugs.length) return "";
  const header = `<mj-text font-size="14px" font-weight="600" color="#344054">${title}</mj-text>`;
  const items = slugs.map((s) => `<mj-text font-size="13px" color="#475467">• ${s}</mj-text>`).join("");
  return header + items;
}

async function renderDigest(orgChanged: string[], orgRemoved: string[]): Promise<string> {
  const tmplPath = path.join(__dirname, "../../../templates/ai-trust-index-digest.mjml");
  const template = await fs.readFile(tmplPath, "utf8");
  return compileMjmlToHtml(template, {
    changedSection: sectionMjml("Changed", orgChanged),
    removedSection: sectionMjml("No longer assessed", orgRemoved),
    appUrl: APP_URL,
  });
}

export async function syncAiTrustIndex(
  deps?: { feed?: unknown }
): Promise<{ fetched: number; materialChanged: number; newlyRemoved: number; orgsEmailed: number; skipped?: string }> {
  const meta = await getMetaQuery();
  const thisWeek = currentIsoWeek(new Date());
  if (meta.last_run_week === thisWeek) {
    return { fetched: 0, materialChanged: 0, newlyRemoved: 0, orgsEmailed: 0, skipped: `already ran ${thisWeek}` };
  }

  let raw: unknown;
  try {
    raw = deps?.feed ?? (await fetchFeed());
  } catch (e) {
    logger.error(`[ai-trust-index] feed fetch failed: ${(e as Error).message}`);
    return { fetched: 0, materialChanged: 0, newlyRemoved: 0, orgsEmailed: 0, skipped: "fetch failed" };
  }

  const validated = validateFeed(raw, meta.last_good_count ?? null);
  if (!validated.ok) {
    logger.error(`[ai-trust-index] feed rejected: ${validated.reason}`);
    return { fetched: 0, materialChanged: 0, newlyRemoved: 0, orgsEmailed: 0, skipped: validated.reason };
  }

  const { materialChanged, newlyRemoved, wasFirstSeed } = await upsertFeedTx(validated.apps);

  if (wasFirstSeed) {
    logger.info(`[ai-trust-index] first seed complete (${validated.apps.length} apps); emails suppressed`);
    return { fetched: validated.apps.length, materialChanged: 0, newlyRemoved: 0, orgsEmailed: 0 };
  }

  const changedSlugs = Array.from(new Set([...materialChanged, ...newlyRemoved]));
  let orgsEmailed = 0;
  if (changedSlugs.length) {
    const affected = await getAffectedOrgsBySlugs(changedSlugs);
    const byOrg = new Map<number, { changed: string[]; removed: string[] }>();
    for (const row of affected) {
      const bucket = byOrg.get(row.organization_id) ?? { changed: [], removed: [] };
      if (newlyRemoved.includes(row.app_slug)) bucket.removed.push(row.app_slug);
      else bucket.changed.push(row.app_slug);
      byOrg.set(row.organization_id, bucket);
    }
    for (const [orgId, { changed, removed }] of byOrg) {
      const recipients = await resolveRecipients(orgId);
      if (!recipients.length) continue;
      const html = await renderDigest(changed, removed);
      await sendAutomationEmail(recipients, "AI Trust Index — weekly update", html, undefined);
      orgsEmailed++;
    }
  }

  logger.info(`[ai-trust-index] sync done: fetched=${validated.apps.length} changed=${materialChanged.length} removed=${newlyRemoved.length} orgsEmailed=${orgsEmailed}`);
  return { fetched: validated.apps.length, materialChanged: materialChanged.length, newlyRemoved: newlyRemoved.length, orgsEmailed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Servers && npx jest services/automations/tests/syncAiTrustIndex.spec.ts`
Expected: PASS (4 tests). If `sendAutomationEmail`'s signature differs from `(to, subject, html, attachments)`, adjust the call to match what Step 1 of Task 8 / the emailService shows.

- [ ] **Step 5: Commit**

```bash
git add Servers/services/automations/actions/syncAiTrustIndex.ts Servers/services/automations/tests/syncAiTrustIndex.spec.ts
git commit -m "feat(ai-trust-index): weekly sync job with first-seed guard and digest"
```

---

### Task 10: Wire the cron (producer + worker + producer registry)

**Files:**
- Modify: `Servers/services/automations/automationProducer.ts`
- Modify: `Servers/services/automations/automationWorker.ts`
- Modify: `Servers/jobs/producer.ts`

**Interfaces:**
- Consumes: `syncAiTrustIndex` (Task 9).
- Produces: a registered repeatable BullMQ job `ai_trust_index_sync` (Mon 06:00 UTC), dispatched by the worker.

- [ ] **Step 1: Add the scheduler to `automationProducer.ts` (NO obliterate)**

Append this function (mirror the non-obliterating `schedulePolicyDueSoonNotification` shape):

```typescript
export async function scheduleAiTrustIndexSync() {
  logger.info("Adding AI Trust Index weekly sync job to the queue...");
  // Monday 06:00 UTC. jobId keyed weekly is set at runtime is not needed here;
  // the handler self-guards via last_run_week. Repeatable add is idempotent by repeat key.
  await automationQueue.add(
    "ai_trust_index_sync",
    {},
    {
      repeat: { pattern: "0 6 * * 1", tz: "UTC" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}
```

- [ ] **Step 2: Add the worker dispatch branch in `automationWorker.ts`**

Add the import at the top with the other action imports:

```typescript
import { syncAiTrustIndex } from "./actions/syncAiTrustIndex";
```

Add the branch in the `if/else if` chain (e.g. right after the `mcp_audit_cleanup` branch):

```typescript
        } else if (name === "ai_trust_index_sync") {
          await syncAiTrustIndex();
```

- [ ] **Step 3: Register the scheduler LAST in `jobs/producer.ts`**

Add to the import list from `automationProducer` and call it as the **last** line of `addAllJobs()` (after `scheduleMcpGatewayCleanup()`), because earlier schedulers call `automationQueue.obliterate()` and would wipe a job added before them:

```typescript
  await scheduleMcpGatewayCleanup();
  await scheduleAiTrustIndexSync(); // MUST be last — earlier schedulers obliterate the queue
```

- [ ] **Step 4: Build**

Run: `cd Servers && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add Servers/services/automations/automationProducer.ts Servers/services/automations/automationWorker.ts Servers/jobs/producer.ts
git commit -m "feat(ai-trust-index): register weekly cron (Mon 06:00 UTC)"
```

---

# PHASE 6 — Frontend

### Task 11: Repository + hooks + module registration

**Files:**
- Create: `Clients/src/application/repository/aiTrustIndex.repository.ts`
- Create: `Clients/src/application/hooks/useAiTrustIndex.ts`
- Create: `Clients/src/presentation/pages/AITrustIndex/shared.ts`
- Modify: `Clients/src/application/redux/ui/uiSlice.ts`
- Modify: `Clients/src/application/hooks/useActiveModule.ts`
- Modify: `Clients/src/presentation/components/AppSwitcher/index.tsx`

**Interfaces:**
- Consumes: `apiServices` from `../../infrastructure/api/networkServices`.
- Produces: repository functions + React Query hooks + the registered `"ai-trust-index"` module.

- [ ] **Step 1: Write the repository**

```typescript
// Clients/src/application/repository/aiTrustIndex.repository.ts
import { apiServices } from "../../infrastructure/api/networkServices";

const BASE = "/ai-trust-index";

export async function getApps(params: {
  search?: string; category?: string; grade?: string; page?: number; pageSize?: number; sort?: string;
} = {}): Promise<any> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== "") q.set(k, String(v)); });
  const response = await apiServices.get(`${BASE}/apps?${q.toString()}`);
  return response.data;
}

export async function getApp(slug: string): Promise<any> {
  const response = await apiServices.get(`${BASE}/apps/${encodeURIComponent(slug)}`);
  return response.data;
}

export async function getTracked(): Promise<any> {
  const response = await apiServices.get(`${BASE}/tracked`);
  return response.data;
}

export async function trackApp(slug: string): Promise<any> {
  return (await apiServices.post(`${BASE}/tracked`, { slug })).data;
}

export async function trackAppsBulk(slugs: string[]): Promise<any> {
  return (await apiServices.post(`${BASE}/tracked/bulk`, { slugs })).data;
}

export async function untrackApp(slug: string): Promise<any> {
  return (await apiServices.delete(`${BASE}/tracked/${encodeURIComponent(slug)}`)).data;
}

export async function getSettings(): Promise<any> {
  return (await apiServices.get(`${BASE}/settings`)).data;
}

export async function updateSettings(body: { recipientUserIds: number[]; recipientEmails: string[] }): Promise<any> {
  return (await apiServices.put(`${BASE}/settings`, body)).data;
}
```

- [ ] **Step 2: Write the hooks**

```typescript
// Clients/src/application/hooks/useAiTrustIndex.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getApps, getApp, getTracked, trackApp, trackAppsBulk, untrackApp, getSettings, updateSettings,
} from "../repository/aiTrustIndex.repository";

const KEY = "ai-trust-index";

export function useApps(filters: Record<string, unknown>) {
  return useQuery({ queryKey: [KEY, "apps", filters], queryFn: () => getApps(filters as any) });
}
export function useApp(slug: string) {
  return useQuery({ queryKey: [KEY, "app", slug], queryFn: () => getApp(slug), enabled: !!slug });
}
export function useTracked() {
  return useQuery({ queryKey: [KEY, "tracked"], queryFn: () => getTracked() });
}
export function useTrackApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => trackApp(slug),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY, "apps"] }); qc.invalidateQueries({ queryKey: [KEY, "tracked"] }); },
  });
}
export function useTrackAppsBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slugs: string[]) => trackAppsBulk(slugs),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY, "apps"] }); qc.invalidateQueries({ queryKey: [KEY, "tracked"] }); },
  });
}
export function useUntrackApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => untrackApp(slug),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY, "apps"] }); qc.invalidateQueries({ queryKey: [KEY, "tracked"] }); },
  });
}
export function useSettings() {
  return useQuery({ queryKey: [KEY, "settings"], queryFn: () => getSettings() });
}
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { recipientUserIds: number[]; recipientEmails: string[] }) => updateSettings(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "settings"] }),
  });
}
```

- [ ] **Step 3: Write `shared.ts` (types + grade colors)**

```typescript
// Clients/src/presentation/pages/AITrustIndex/shared.ts
export interface TrustIndexAppData {
  slug: string; name: string; vendor: string; domain: string; category: string;
  scoreOutOf100: number; letterGrade: string; displayedGrade: string; confidence: string;
  dealbreakerFlags: string[]; summary: string; highlights: { label: string; text: string }[];
  policyUrl: string; policyLastUpdated: string | null; modalities: string[]; processesBiometrics: boolean;
}

export interface TrustIndexRow {
  slug: string; name: string; vendor?: string; category?: string;
  letter_grade?: string; score_out_of_100?: number; data: TrustIndexAppData;
  is_tracked?: boolean; is_active?: boolean; no_longer_in_index?: boolean;
}

/** Map a letter grade to a theme-aligned chip color (our palette, not the feed's design block). */
export const GRADE_COLOR: Record<string, string> = {
  A: "#13715B", B: "#3b82a0", C: "#b7791f", D: "#c2410c", F: "#b42318",
};

export function faviconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}
```

- [ ] **Step 4: Add `"ai-trust-index"` to the `AppModule` union**

In `Clients/src/application/redux/ui/uiSlice.ts`, change:

```typescript
export type AppModule =
  | "main"
  | "evals"
  | "ai-detection"
  | "shadow-ai"
  | "ai-gateway"
  | "ai-trust-index"
  | "super-admin";
```

- [ ] **Step 5: Three edits in `useActiveModule.ts`**

(a) In `getModuleFromPath`, add before the final `return "main";`:

```typescript
    if (pathname.startsWith("/ai-trust-index")) {
      return "ai-trust-index";
    }
```

(b) In the `handleModuleChange` switch, add a case:

```typescript
        case "ai-trust-index":
          navigate("/ai-trust-index/browse");
          break;
```

(c) In the localStorage validation array, add the new id:

```typescript
      ["main", "evals", "ai-detection", "shadow-ai", "ai-gateway", "ai-trust-index", "super-admin"].includes(stored)
```

- [ ] **Step 6: Add the module entry in `AppSwitcher/index.tsx`**

Add `Gauge` to the lucide import, and add the entry to the `modules` array (after `ai-gateway`):

```typescript
import { Shield, FlaskConical, ScanSearch, Eye, Router, Crown, Gauge } from "lucide-react";
// ...
  {
    id: "ai-trust-index",
    icon: <Gauge size={16} strokeWidth={1.5} />,
    label: "AI Trust Index",
    description: "Browse AI app risk scores and track the apps you use",
  },
```

- [ ] **Step 7: Typecheck**

Run: `cd Clients && npm run typecheck`
Expected: no errors in the new/edited files.

- [ ] **Step 8: Commit**

```bash
git add Clients/src/application/repository/aiTrustIndex.repository.ts Clients/src/application/hooks/useAiTrustIndex.ts Clients/src/presentation/pages/AITrustIndex/shared.ts Clients/src/application/redux/ui/uiSlice.ts Clients/src/application/hooks/useActiveModule.ts Clients/src/presentation/components/AppSwitcher/index.tsx
git commit -m "feat(ai-trust-index): repository, hooks, module registration"
```

---

### Task 12: Pages + sidebar + routes + i18n

**Files:**
- Create: `Clients/src/application/contexts/AITrustIndexSidebar.context.tsx`
- Create: `Clients/src/presentation/pages/AITrustIndex/AITrustIndexSidebar.tsx`
- Create: `Clients/src/presentation/pages/AITrustIndex/index.tsx`
- Create: `Clients/src/presentation/pages/AITrustIndex/Browse/index.tsx`
- Create: `Clients/src/presentation/pages/AITrustIndex/Tracked/index.tsx`
- Create: `Clients/src/presentation/pages/AITrustIndex/Settings/index.tsx`
- Create: `Clients/src/presentation/pages/AITrustIndex/AppDetail/index.tsx`
- Modify: `Clients/src/application/config/routes.tsx`
- Modify: `Clients/src/i18n/translations.ts`

**Interfaces:**
- Consumes: hooks from Task 11; `shared.ts`. Existing components: `SidebarShell` (`Clients/src/presentation/components/Sidebar/SidebarShell.tsx`), `CustomizableBasicTable` (`Clients/src/presentation/components/Table`), `SearchBox` (`Clients/src/presentation/components/Search`), `CustomSelect`, `EmptyState`, `PageBreadcrumbs`, the standard `Button` (`Clients/src/presentation/components/button`), `Chip`, `ChipInput`.
- Produces: the rendered module UI on `/ai-trust-index/*`.

> This is a large UI task; build it tab by tab but commit once at the end as one reviewable module. Mirror `AIDetectionSidebar.tsx` for the sidebar and an existing page (e.g. AI Detection's `ScanPage`) for table wiring. Match prop names exactly to the components you import (verify each component's props before use — the spec lists them but confirm in source).

- [ ] **Step 1: Write the sidebar context**

```typescript
// Clients/src/application/contexts/AITrustIndexSidebar.context.tsx
import { createContext, useContext, useState, FC, ReactNode } from "react";

interface Ctx {
  activeTab: string;
  setActiveTab: (t: string) => void;
  trackedCount: number;
  setTrackedCount: (n: number) => void;
}
const AITrustIndexSidebarContext = createContext<Ctx | undefined>(undefined);

export const AITrustIndexSidebarProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState("browse");
  const [trackedCount, setTrackedCount] = useState(0);
  return (
    <AITrustIndexSidebarContext.Provider value={{ activeTab, setActiveTab, trackedCount, setTrackedCount }}>
      {children}
    </AITrustIndexSidebarContext.Provider>
  );
};

export const useAITrustIndexSidebarContext = () => {
  const ctx = useContext(AITrustIndexSidebarContext);
  if (!ctx) throw new Error("useAITrustIndexSidebarContext must be used within AITrustIndexSidebarProvider");
  return ctx;
};
```

- [ ] **Step 2: Write the sidebar component**

```typescript
// Clients/src/presentation/pages/AITrustIndex/AITrustIndexSidebar.tsx
import { Compass, Star, Settings } from "lucide-react";
import SidebarShell from "../../components/Sidebar/SidebarShell";

interface Props {
  activeTab: string;
  onTabChange: (value: string) => void;
  trackedCount?: number;
  isAdmin?: boolean;
}

export default function AITrustIndexSidebar({ activeTab, onTabChange, trackedCount = 0, isAdmin = false }: Props) {
  const flatItems = [
    { id: "browse", label: "Browse", value: "browse", icon: <Compass size={16} strokeWidth={1.5} /> },
    { id: "tracked", label: "Tracked", value: "tracked", icon: <Star size={16} strokeWidth={1.5} />, count: trackedCount },
    ...(isAdmin ? [{ id: "settings", label: "Settings", value: "settings", icon: <Settings size={16} strokeWidth={1.5} /> }] : []),
  ];
  return (
    <SidebarShell
      flatItems={flatItems}
      isItemActive={(item: any) => item.value === activeTab}
      onItemClick={(item: any) => item.value && onTabChange(item.value)}
      showReadyToSubscribe={false}
    />
  );
}
```

- [ ] **Step 3: Write the page shell (`index.tsx`)**

```typescript
// Clients/src/presentation/pages/AITrustIndex/index.tsx
import { useLocation, useNavigate } from "react-router-dom";
import { Stack } from "@mui/material";
import AITrustIndexSidebar from "./AITrustIndexSidebar";
import { useTracked } from "../../../application/hooks/useAiTrustIndex";

// Renders only the sidebar; the active tab content is rendered by the route element.
export default function AITrustIndexShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: tracked } = useTracked();
  const activeTab = location.pathname.split("/")[2] || "browse";
  const trackedCount = Array.isArray(tracked?.data) ? tracked.data.length : 0;
  return (
    <Stack direction="row">
      <AITrustIndexSidebar
        activeTab={activeTab}
        onTabChange={(t) => navigate(`/ai-trust-index/${t}`)}
        trackedCount={trackedCount}
      />
      <Stack flex={1} sx={{ p: "24px" }}>{children}</Stack>
    </Stack>
  );
}
```

> If existing modules render their sidebar differently (e.g. the sidebar is mounted by the dashboard container, not per-page), follow that pattern instead and drop this shell. Verify against how `AIDetection` pages mount their sidebar before finalizing.

- [ ] **Step 4: Write Browse, Tracked, Settings, AppDetail**

Build each using the imported components. Required behaviors (from spec §11.4):
- **Browse:** `SearchBox` (debounced ~300ms) + category `CustomSelect` (options from `categories` in the response) + grade `CustomSelect` + sort; `CustomizableBasicTable` with server pagination (page/pageSize wired to `useApps`); a leading **checkbox column** with bulk-select state; a **"Track selected (N)"** button (calls `useTrackAppsBulk`, clears selection on success); per-row Track toggle (`useTrackApp`/`useUntrackApp`); grade chip renders `row.letter_grade` from `row.data.displayedGrade`; row click (not on checkbox/toggle) → `navigate('/ai-trust-index/' + row.slug)`; `EmptyState` for empty/error.
- **Tracked:** `useTracked`; same table minus the bulk checkboxes; **"No longer in index"** chip when `row.no_longer_in_index`; inline untrack.
- **Settings:** gate on admin role (read role from the existing auth selector used elsewhere, e.g. `useSelector` of auth state — match how other Settings pages read role); user multi-select (`CustomSelect` multi or the project's multi-select; populate from the existing users hook/repository) + free-text email `ChipInput`; auto-save via `useUpdateSettings` (debounced); read-only/hidden if not admin.
- **AppDetail:** `useApp(slug)`; `PageBreadcrumbs` (`AI Trust Index` → app name); header with favicon (`faviconUrl(data.domain)`, `onError` → hide img / show initial), name, vendor, `displayedGrade` chip, score, Track/Untrack button; sections — Summary, Highlights cards (`data.highlights`), Dealbreaker flags (if any), Policy details (link `data.policyUrl`, `data.policyLastUpdated`, `data.modalities`, `data.processesBiometrics`); handle `no_longer_in_index` (badge) and 404 (EmptyState + link back to Browse).

For each new user-facing string, use the existing translation hook the app uses for UI text where applicable; at minimum, ensure the literal strings are added to `translations.ts` (Step 6) so the i18n audit passes.

- [ ] **Step 5: Add routes in `routes.tsx`**

Mirror the AI Detection block. Add lazy imports at the top (using `lazyRoute` like the others) and the routes inside the dashboard `<Routes>`:

```tsx
<Route path="/ai-trust-index" element={<Navigate to="/ai-trust-index/browse" replace />} />
<Route path="/ai-trust-index/browse" element={<Suspense fallback={<LazyFallback />}><AITrustIndexBrowse /></Suspense>} />
<Route path="/ai-trust-index/tracked" element={<Suspense fallback={<LazyFallback />}><AITrustIndexTracked /></Suspense>} />
<Route path="/ai-trust-index/settings" element={<Suspense fallback={<LazyFallback />}><AITrustIndexSettings /></Suspense>} />
<Route path="/ai-trust-index/:slug" element={<Suspense fallback={<LazyFallback />}><AITrustIndexDetail /></Suspense>} />
```

(Each lazy element wraps its page in the `AITrustIndexShell` so the sidebar persists, OR mount the shell once if the dashboard layout supports it — match the existing module approach.)

- [ ] **Step 6: Add de/fr/es strings to `translations.ts`**

For every new English UI string (e.g. `"AI Trust Index"`, `"Browse"`, `"Tracked"`, `"Track selected"`, `"No longer in index"`, `"No longer assessed"`, `"Dealbreaker flags"`, `"Processes biometrics"`, `"Recipients"`, `"Add email"`, column headers, empty-state copy), add the key + translation under the `de`, `fr`, and `es` blocks. Use existing entries (e.g. `"Settings"`, `"Browse"`) where they already exist — do not duplicate keys.

- [ ] **Step 7: Run frontend gates**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict`
Expected: typecheck clean; i18n audit reports 0 gaps for de/fr/es.

- [ ] **Step 8: Commit**

```bash
git add Clients/src/application/contexts/AITrustIndexSidebar.context.tsx Clients/src/presentation/pages/AITrustIndex/ Clients/src/application/config/routes.tsx Clients/src/i18n/translations.ts
git commit -m "feat(ai-trust-index): module pages, sidebar, routes, i18n"
```

---

# PHASE 7 — Verify end-to-end + docs

### Task 13: Live verification

**Files:** none (manual verification + a seed run).

- [ ] **Step 1: Build both sides**

Run: `cd Servers && npm run build && cd ../Clients && npm run build`
Expected: both succeed.

- [ ] **Step 2: Trigger a one-off seed locally**

With the backend able to reach the internet, run a one-off invocation of the job (e.g. a temporary script or a node REPL that imports and calls `syncAiTrustIndex()` once), OR start the worker and enqueue `ai_trust_index_sync` once. Confirm in logs: `first seed complete (N apps); emails suppressed`. Verify `SELECT count(*) FROM verifywise.ai_trust_index_apps;` returns ~37 and `SELECT seeded_at FROM verifywise.ai_trust_index_meta;` is set.

- [ ] **Step 3: Exercise the UI**

Run the app (backend + frontend), log in (`gorkem.cetin@verifywise.ai` / `Verifywise#1`), open the new **AI Trust Index** module. Verify: Browse lists apps with grades/scores, search + category/grade filters work, pagination works, bulk-select + "Track selected" works, a row opens the full detail page, Tracked shows tracked apps, Settings (as Admin) saves recipients.

- [ ] **Step 4: Simulate a change → email path (optional but recommended)**

Manually mutate one app's `material_hash` in the DB to a dummy value, re-run `syncAiTrustIndex()`, and confirm the affected-org email path fires for an org tracking that app (check mail logs / nodemailer transport). Revert the manual change.

- [ ] **Step 5: Commit (if any fixups were needed)**

```bash
git add -A && git commit -m "fix(ai-trust-index): live-verification fixups"
```

(Skip if no changes.)

---

### Task 14: Documentation

**Files:**
- Create: `docs/technical/domains/ai-trust-index.md`
- Modify: root `CLAUDE.md` (Detailed References table)
- Create: `shared/user-guide-content/content/ai-trust-index/{dashboard,browse,tracked,settings}.ts`
- Modify: `shared/user-guide-content/content/index.ts`
- Modify: `shared/user-guide-content/userGuideConfig.ts`
- Mirror the user-guide changes into `/Users/gorkemcetin/website/verifywise/content/user-guide/` (do NOT commit the website repo)

- [ ] **Step 1: Write the technical domain doc**

Create `docs/technical/domains/ai-trust-index.md` documenting: purpose, the feed contract, the 4 tables, the global-vs-org-scoped decision, the two-hash change detection, the sanity gates, the weekly job (cron, first-seed guard, singleton), recipient resolution, the REST API, and the frontend module structure. Keep it consistent with `docs/technical/domains/policy-radar.md` in style.

- [ ] **Step 2: Add the references-table row to root `CLAUDE.md`**

Add a row under "Detailed References":

```markdown
| AI Trust Index | `docs/technical/domains/ai-trust-index.md` |
```

- [ ] **Step 3: Write the 4 user-guide articles**

Mirror the structure of an existing user-guide content file (e.g. one under `shared/user-guide-content/content/policy-radar/`). Each exports an `ArticleContent` with structured blocks: `dashboard.ts` (what the module is / overview), `browse.ts` (searching + tracking, incl. bulk), `tracked.ts` (your tracked apps + "no longer in index"), `settings.ts` (recipients). Copy verbatim claims must be true to the implemented UI.

- [ ] **Step 4: Wire the articles into config (both files, both locations)**

Update `shared/user-guide-content/content/index.ts` (imports + map) and `shared/user-guide-content/userGuideConfig.ts` (collection + articles + search) to include the new collection. Then copy the changed content + both config files into `/Users/gorkemcetin/website/verifywise/content/user-guide/` (same relative paths). Do not commit in the website repo — the user handles that.

- [ ] **Step 5: Verify the in-app guide builds**

Run: `cd Clients && npm run typecheck`
Expected: no errors (the in-app sidebar imports the shared content).

- [ ] **Step 6: Commit (monorepo only)**

```bash
git add docs/technical/domains/ai-trust-index.md CLAUDE.md shared/user-guide-content/
git commit -m "docs(ai-trust-index): technical reference + user guide"
```

---

## Final gate (before PR)

- [ ] `cd Servers && npm run build && npm run format-check`
- [ ] `cd Servers && npx jest utils/__tests__/aiTrustIndexHash.test.ts utils/__tests__/aiTrustIndexFeed.test.ts utils/__tests__/aiTrustIndex.utils.test.ts utils/__tests__/aiTrustIndex.recipients.test.ts controllers/__tests__/aiTrustIndex.ctrl.test.ts services/automations/tests/syncAiTrustIndex.spec.ts`
- [ ] `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npm run build`
- [ ] Manual UI pass (Task 13) green.

---

## Notes for the implementer

- **The #1 bug risk is hashing.** If you ever find yourself hashing a value read back from the `data` JSONB column, stop — hash the incoming feed object only (Task 3). Postgres reorders JSONB keys; re-hashing stored data flips every app to "changed."
- **Never call `automationQueue.obliterate()` in the new scheduler**, and keep `scheduleAiTrustIndexSync()` last in `addAllJobs()`.
- **Admin = role name**, not `role_id`.
- When a component's prop names differ from what this plan assumes, trust the component source — the plan lists intended props but the codebase is the authority.
- Commit after each task; keep tasks independently reviewable.
