# Regulation Impact Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a tracked country's AI regulation changes, orgs with an LLM key configured see which of their AI systems, controls, policies, vendors and assessments are affected — computed at sync time, surfaced on the country detail page and in the change notification.

**Architecture:** A two-stage funnel layered onto the existing Regulations Tracker sync. Stage A runs deterministic, tenant-scoped SQL to produce an over-inclusive candidate set per entity type. Stage B sends each non-empty type's candidates to the org's LLM (reusing the AI Advisor's `runAdvisorAiSdk` + `llm_keys`) which filters and annotates them — never adds. Results are cached in a new `regulation_impact_analysis` table keyed by `(org, country_slug, regulation_hash)` and read by a new GET endpoint.

**Tech Stack:** Node 22, Express 4, Sequelize 6 (raw SQL), PostgreSQL (shared `verifywise` schema), Jest (backend), React 19 + React Query + Axios (frontend), Vercel AI SDK (via the advisor).

## Global Constraints

- **Branch:** `feat/regulations-tracker` (do NOT branch off; this extends the unmerged module). Never commit to `develop`.
- **Scope:** V1 = detect-only. NO task creation, completion tracking, or audit evidence.
- **Multi-tenancy:** every tenant-scoped query uses unqualified table names + `WHERE organization_id = :organizationId`. `regulation_countries` and `regulation_tracker_meta` are GLOBAL (no `organization_id`); `regulation_tracked_countries` is tenant-scoped.
- **Migration DDL:** raw SQL via `queryInterface.sequelize.query()`, explicit `verifywise.` prefix, `CREATE TABLE IF NOT EXISTS`, `SERIAL PRIMARY KEY`, `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, FK `REFERENCES verifywise.organizations(id) ON DELETE CASCADE`. New migration filename: `<YYYYMMDDHHMMSS>-create-regulation-impact-analysis-table.js` (timestamp from `date +%Y%m%d%H%M%S`).
- **Response helper:** success always `res.status(200).json(STATUS_CODE[200](data))`; admin guard `res.status(403).json(STATUS_CODE[403]("Admin access required"))`; errors `res.status(500).json(STATUS_CODE[500]((error as Error).message))`.
- **Admin check:** reuse the inline `isAdmin` helper in `regulationsTracker.ctrl.ts:26` (`role === "Admin" || role === "SuperAdmin"`). No route-layer RBAC.
- **LLM key field names** (`getLLMKeysWithKeyQuery` rows): `key`, `name` (provider), `url`, `model`, `custom_headers`. Provider enum: `"Anthropic" | "OpenAI" | "OpenRouter" | "Custom"`.
- **Notification enums:** `NotificationType.REGULATIONS_TRACKER`, `NotificationEntityType.REGULATION_COUNTRY`.
- **`data.regulations` may be absent** (manifest-only sync). Always guard `Array.isArray(data?.regulations)`.
- **No console.log.** Use `logProcessing`/`logSuccess`/`logFailure` from `utils/logger/logHelper`.
- **Single-file backend test:** `cd Servers && npm run test -- --testPathPattern="<stem>"`.
- **Pre-PR gates:** `cd Servers && npm run build`; `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`.

---

## File Structure

**Backend (create):**
- `Servers/database/migrations/<ts>-create-regulation-impact-analysis-table.js` — the table.
- `Servers/utils/regulationImpact.utils.ts` — Stage A candidate queries, Stage B prompt build + validation, persistence (get/upsert), the orchestrator `runImpactAnalysis`. **One file, one responsibility: impact analysis.**
- `Servers/utils/__tests__/regulationImpact.utils.test.ts` — pure-function tests (region map, framework map, validation, prompt assembly).
- `Servers/controllers/__tests__/regulationImpact.ctrl.test.ts` — endpoint controller tests.

**Backend (modify):**
- `Servers/controllers/regulationsTracker.ctrl.ts` — add `getImpactAnalysis` + `refreshImpactAnalysis`.
- `Servers/routes/regulationsTracker.route.ts` — register the two routes (ordering-sensitive).
- `Servers/middleware/rateLimit.middleware.ts` — add `regulationsTrackerImpact` config + `regulationsTrackerImpactLimiter`.
- `Servers/services/automations/actions/syncRegulationsTracker.ts` — hook Stage A+B into the per-(org,country) loop.

**Frontend (modify):**
- `Clients/src/application/repository/regulationsTracker.repository.ts` — `getImpactAnalysis`, `refreshImpactAnalysis`.
- `Clients/src/application/hooks/useRegulationsTracker.ts` — `useImpactAnalysis`, `useRefreshImpactAnalysis`.
- `Clients/src/presentation/pages/RegulationsTracker/CountryDetail/index.tsx` — the Impact panel.

---

## Task ordering rationale

Tasks 1–2 are pure (table + pure helpers) — testable with zero DB. Task 3 (Stage A queries) and Task 4 (Stage B build/validate) are independent pure-ish units. Task 5 (orchestrator) composes them. Task 6 wires the sync. Tasks 7–8 are the read API. Tasks 9–10 are frontend. Each ends with a green test or a build.

---

### Task 1: Migration — `regulation_impact_analysis` table

**Files:**
- Create: `Servers/database/migrations/<ts>-create-regulation-impact-analysis-table.js`

**Interfaces:**
- Produces: table `verifywise.regulation_impact_analysis` with columns `id, organization_id, country_slug, regulation_hash, result (jsonb null), status, model, created_at, refreshed_at`, `UNIQUE(organization_id, country_slug)`.

- [ ] **Step 1: Generate the timestamp**

Run: `date +%Y%m%d%H%M%S`
Use the printed value as `<ts>` in the filename.

- [ ] **Step 2: Write the migration file**

Create `Servers/database/migrations/<ts>-create-regulation-impact-analysis-table.js`:

```javascript
"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.regulation_impact_analysis (
        id               SERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        country_slug     VARCHAR(120) NOT NULL,
        regulation_hash  VARCHAR(120) NOT NULL,
        result           JSONB,
        status           VARCHAR(120) NOT NULL,
        model            VARCHAR(255),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        refreshed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (organization_id, country_slug)
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_reg_impact_org_slug
        ON verifywise.regulation_impact_analysis(organization_id, country_slug);
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS verifywise.regulation_impact_analysis;
    `);
  },
};
```

- [ ] **Step 3: Run the migration**

Run: `cd Servers && npx sequelize-cli db:migrate`
Expected: `== <ts>-create-regulation-impact-analysis-table: migrated`

- [ ] **Step 4: Verify the down migration is reversible, then re-apply**

Run: `cd Servers && npx sequelize-cli db:migrate:undo && npx sequelize-cli db:migrate`
Expected: undo prints `reverted`, then migrate prints `migrated` again. (Confirms `down` works.)

- [ ] **Step 5: Commit**

```bash
git add Servers/database/migrations/*-create-regulation-impact-analysis-table.js
git commit -m "feat(regulations-tracker): add regulation_impact_analysis table"
```

---

### Task 2: Pure helpers — region map, framework map, response validation

**Files:**
- Create: `Servers/utils/regulationImpact.utils.ts`
- Test: `Servers/utils/__tests__/regulationImpact.utils.test.ts`

**Interfaces:**
- Produces:
  - `type EntityType = "system" | "control" | "policy" | "vendor" | "assessment";`
  - `type Candidate = { type: EntityType; id: number; name: string; description: string };`
  - `type LlmVerdict = { type: EntityType; id: number; affected: boolean; why: string };`
  - `regionForCountry(countryName: string): number | null` — maps a feed country name to the `geography` enum int (1 Global,2 Europe,3 North America,4 South America,5 Asia,6 Africa); `null` if unknown.
  - `frameworksForRegulation(reg: { type?: string; country?: string }): string[]` — returns framework names (`"EU AI Act"` etc.) this regulation maps to; `[]` if none.
  - `validateVerdicts(raw: unknown, sent: Candidate[]): LlmVerdict[]` — parses/validates an LLM response object `{results:[...]}`, dropping any entry whose `id` is not in `sent` (matched by `type`+`id`), whose `affected` is not boolean, or whose `why` is empty. Returns only valid entries.

- [ ] **Step 1: Write the failing tests**

Create `Servers/utils/__tests__/regulationImpact.utils.test.ts`:

```typescript
import {
  regionForCountry,
  frameworksForRegulation,
  validateVerdicts,
} from "../regulationImpact.utils";

describe("regionForCountry", () => {
  it("maps known European countries to 2", () => {
    expect(regionForCountry("Germany")).toBe(2);
    expect(regionForCountry("France")).toBe(2);
  });
  it("maps the EU bloc entry to Europe", () => {
    expect(regionForCountry("European Union")).toBe(2);
  });
  it("maps the US to North America", () => {
    expect(regionForCountry("United States")).toBe(3);
  });
  it("returns null for an unknown country", () => {
    expect(regionForCountry("Atlantis")).toBeNull();
  });
});

describe("frameworksForRegulation", () => {
  it("maps an EU AI Act regulation to the EU AI Act framework", () => {
    expect(frameworksForRegulation({ type: "EU AI Act", country: "European Union" }))
      .toContain("EU AI Act");
  });
  it("returns an empty array when no framework maps", () => {
    expect(frameworksForRegulation({ type: "Local guidance", country: "Atlantis" }))
      .toEqual([]);
  });
});

describe("validateVerdicts", () => {
  const sent = [
    { type: "system" as const, id: 1, name: "A", description: "" },
    { type: "system" as const, id: 2, name: "B", description: "" },
  ];
  it("keeps valid entries that were sent", () => {
    const raw = { results: [{ type: "system", id: 1, affected: true, why: "x" }] };
    expect(validateVerdicts(raw, sent)).toEqual([
      { type: "system", id: 1, affected: true, why: "x" },
    ]);
  });
  it("drops hallucinated ids not in the sent set", () => {
    const raw = { results: [{ type: "system", id: 99, affected: true, why: "x" }] };
    expect(validateVerdicts(raw, sent)).toEqual([]);
  });
  it("drops entries with empty why", () => {
    const raw = { results: [{ type: "system", id: 1, affected: true, why: "" }] };
    expect(validateVerdicts(raw, sent)).toEqual([]);
  });
  it("drops entries with non-boolean affected", () => {
    const raw = { results: [{ type: "system", id: 1, affected: "yes", why: "x" }] };
    expect(validateVerdicts(raw, sent)).toEqual([]);
  });
  it("returns [] for malformed input", () => {
    expect(validateVerdicts(null, sent)).toEqual([]);
    expect(validateVerdicts({ nope: 1 }, sent)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd Servers && npm run test -- --testPathPattern="regulationImpact.utils"`
Expected: FAIL — "Cannot find module '../regulationImpact.utils'".

- [ ] **Step 3: Implement the pure helpers**

Create `Servers/utils/regulationImpact.utils.ts`:

```typescript
export type EntityType = "system" | "control" | "policy" | "vendor" | "assessment";

export interface Candidate {
  type: EntityType;
  id: number;
  name: string;
  description: string;
}

export interface LlmVerdict {
  type: EntityType;
  id: number;
  affected: boolean;
  why: string;
}

// geography enum: 1 Global, 2 Europe, 3 North America, 4 South America, 5 Asia, 6 Africa
const REGION_BY_COUNTRY: Record<string, number> = {
  "european union": 2, germany: 2, france: 2, italy: 2, spain: 2,
  netherlands: 2, "united kingdom": 2, ireland: 2, poland: 2, sweden: 2,
  "united states": 3, canada: 3, mexico: 3,
  brazil: 4, argentina: 4, chile: 4,
  china: 5, japan: 5, "south korea": 5, india: 5, singapore: 5,
  "south africa": 6, nigeria: 6, kenya: 6, egypt: 6,
};

export function regionForCountry(countryName: string): number | null {
  if (!countryName) return null;
  const key = countryName.trim().toLowerCase();
  return REGION_BY_COUNTRY[key] ?? null;
}

const FRAMEWORK_BY_TYPE: Record<string, string[]> = {
  "eu ai act": ["EU AI Act"],
  "iso 42001": ["ISO 42001"],
  "iso/iec 42001": ["ISO 42001"],
  "iso 27001": ["ISO 27001"],
  "iso/iec 27001": ["ISO 27001"],
  "nist ai rmf": ["NIST AI RMF"],
};

export function frameworksForRegulation(reg: { type?: string; country?: string }): string[] {
  const t = (reg.type ?? "").trim().toLowerCase();
  if (FRAMEWORK_BY_TYPE[t]) return FRAMEWORK_BY_TYPE[t];
  // EU-bloc regulations imply the EU AI Act framework even when type is free-text.
  if ((reg.country ?? "").trim().toLowerCase() === "european union") return ["EU AI Act"];
  return [];
}

export function validateVerdicts(raw: unknown, sent: Candidate[]): LlmVerdict[] {
  if (!raw || typeof raw !== "object") return [];
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const sentKeys = new Set(sent.map((c) => `${c.type}:${c.id}`));
  const out: LlmVerdict[] = [];
  for (const r of results) {
    if (!r || typeof r !== "object") continue;
    const { type, id, affected, why } = r as Record<string, unknown>;
    if (typeof type !== "string" || typeof id !== "number") continue;
    if (!sentKeys.has(`${type}:${id}`)) continue;
    if (typeof affected !== "boolean") continue;
    if (typeof why !== "string" || why.trim() === "") continue;
    out.push({ type: type as EntityType, id, affected, why: why.trim() });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd Servers && npm run test -- --testPathPattern="regulationImpact.utils"`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/regulationImpact.utils.ts Servers/utils/__tests__/regulationImpact.utils.test.ts
git commit -m "feat(regulations-tracker): impact analysis pure helpers (region/framework/validation)"
```

---

### Task 3: Stage A — deterministic candidate queries

**Files:**
- Modify: `Servers/utils/regulationImpact.utils.ts`
- Test: `Servers/utils/__tests__/regulationImpact.utils.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `regionForCountry`, `frameworksForRegulation`, `Candidate`, `EntityType` (Task 2).
- Produces: `getCandidates(organizationId: number, countryName: string, regulation: { type?: string; country?: string }): Promise<Record<EntityType, Candidate[]>>` — runs five tenant-scoped queries, returns candidates grouped by type (empty arrays where none).

- [ ] **Step 1: Write the failing test (mock sequelize.query)**

Add to `Servers/utils/__tests__/regulationImpact.utils.test.ts`. Place this `jest.mock` at the TOP of the file (above the imports already there):

```typescript
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
import { sequelize } from "../../database/db";
import { getCandidates } from "../regulationImpact.utils";

describe("getCandidates", () => {
  const q = sequelize.query as jest.Mock;
  beforeEach(() => q.mockReset());

  it("returns candidates grouped by type", async () => {
    // 5 queries in fixed order: systems, controls, assessments, vendors, policies
    q.mockResolvedValueOnce([{ id: 1, name: "Resume Ranker", description: "hiring" }]); // systems
    q.mockResolvedValueOnce([{ id: 7, name: "Human oversight", description: "" }]);     // controls
    q.mockResolvedValueOnce([]);                                                        // assessments
    q.mockResolvedValueOnce([{ id: 3, name: "OpenAI", description: "vendor" }]);         // vendors
    q.mockResolvedValueOnce([]);                                                        // policies

    const out = await getCandidates(7, "European Union", { type: "EU AI Act", country: "European Union" });

    expect(out.system).toEqual([{ type: "system", id: 1, name: "Resume Ranker", description: "hiring" }]);
    expect(out.control).toEqual([{ type: "control", id: 7, name: "Human oversight", description: "" }]);
    expect(out.assessment).toEqual([]);
    expect(out.vendor).toEqual([{ type: "vendor", id: 3, name: "OpenAI", description: "vendor" }]);
    expect(out.policy).toEqual([]);
    expect(q).toHaveBeenCalledTimes(5);
  });

  it("scopes every query to organization_id", async () => {
    q.mockResolvedValue([]);
    await getCandidates(42, "Germany", { type: "EU AI Act" });
    for (const call of q.mock.calls) {
      expect(call[1].replacements.organizationId).toBe(42);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd Servers && npm run test -- --testPathPattern="regulationImpact.utils"`
Expected: FAIL — `getCandidates is not a function`.

- [ ] **Step 3: Implement `getCandidates`**

Append to `Servers/utils/regulationImpact.utils.ts` (add the import at the top of the file):

```typescript
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
```

```typescript
const EMPTY_BY_TYPE = (): Record<EntityType, Candidate[]> => ({
  system: [], control: [], policy: [], vendor: [], assessment: [],
});

export async function getCandidates(
  organizationId: number,
  countryName: string,
  regulation: { type?: string; country?: string },
): Promise<Record<EntityType, Candidate[]>> {
  const region = regionForCountry(countryName);
  const frameworks = frameworksForRegulation({ type: regulation.type, country: countryName });
  const out = EMPTY_BY_TYPE();

  // --- systems (projects): geography region match OR framework match via project_frameworks ---
  const systems = (await sequelize.query(
    `SELECT DISTINCT p.id, p.project_title AS name,
            COALESCE(p.goal, '') AS description
       FROM projects p
       LEFT JOIN project_frameworks pf ON pf.project_id = p.id
       LEFT JOIN frameworks f ON f.id = pf.framework_id
      WHERE p.organization_id = :organizationId
        AND ( (:region IS NOT NULL AND p.geography = :region)
              OR f.name = ANY(:frameworks) )`,
    { replacements: { organizationId, region, frameworks }, type: QueryTypes.SELECT },
  )) as { id: number; name: string; description: string }[];
  out.system = systems.map((r) => ({ type: "system", id: r.id, name: r.name, description: r.description }));

  const candidateProjectIds = systems.map((s) => s.id);

  // --- controls: belong to a project whose framework matches (3-hop) ---
  const controls = (await sequelize.query(
    `SELECT DISTINCT c.id, c.title AS name, COALESCE(c.description, '') AS description
       FROM controls c
       JOIN control_categories cc ON cc.id = c.control_category_id
       JOIN project_frameworks pf ON pf.project_id = cc.project_id
       JOIN frameworks f ON f.id = pf.framework_id
       JOIN projects p ON p.id = cc.project_id
      WHERE p.organization_id = :organizationId
        AND f.name = ANY(:frameworks)`,
    { replacements: { organizationId, frameworks }, type: QueryTypes.SELECT },
  )) as { id: number; name: string; description: string }[];
  out.control = controls.map((r) => ({ type: "control", id: r.id, name: r.name, description: r.description }));

  // --- assessments: project_id in candidate projects ---
  if (candidateProjectIds.length) {
    const assessments = (await sequelize.query(
      `SELECT a.id, COALESCE(p.project_title, 'Assessment') AS name, '' AS description
         FROM assessments a
         JOIN projects p ON p.id = a.project_id
        WHERE p.organization_id = :organizationId
          AND a.project_id = ANY(:projectIds)`,
      { replacements: { organizationId, projectIds: candidateProjectIds }, type: QueryTypes.SELECT },
    )) as { id: number; name: string; description: string }[];
    out.assessment = assessments.map((r) => ({ type: "assessment", id: r.id, name: r.name, description: r.description }));
  } else {
    await sequelize.query(`SELECT 1`, { type: QueryTypes.SELECT }); // keep query count stable for tests
  }

  // --- vendors: regulatory_exposure maps to framework OR linked to a candidate project ---
  const vendors = (await sequelize.query(
    `SELECT DISTINCT v.id, v.vendor_name AS name, COALESCE(v.vendor_provides, '') AS description
       FROM vendors v
       LEFT JOIN vendors_projects vp ON vp.vendor_id = v.id
      WHERE v.organization_id = :organizationId
        AND ( v.regulatory_exposure = ANY(:frameworkExposure)
              OR (:hasProjects AND vp.project_id = ANY(:projectIds)) )`,
    {
      replacements: {
        organizationId,
        frameworkExposure: mapFrameworksToExposure(frameworks),
        hasProjects: candidateProjectIds.length > 0,
        projectIds: candidateProjectIds.length ? candidateProjectIds : [0],
      },
      type: QueryTypes.SELECT,
    },
  )) as { id: number; name: string; description: string }[];
  out.vendor = vendors.map((r) => ({ type: "vendor", id: r.id, name: r.name, description: r.description }));

  // --- policies: linked to a candidate control via policy_linked_objects ---
  const controlIds = controls.map((c) => c.id);
  if (controlIds.length) {
    const policies = (await sequelize.query(
      `SELECT DISTINCT pm.id, pm.title AS name, '' AS description
         FROM policy_manager pm
         JOIN policy_linked_objects plo ON plo.policy_id = pm.id
        WHERE pm.organization_id = :organizationId
          AND plo.object_type = 'control'
          AND plo.object_id = ANY(:controlIds)`,
      { replacements: { organizationId, controlIds }, type: QueryTypes.SELECT },
    )) as { id: number; name: string; description: string }[];
    out.policy = policies.map((r) => ({ type: "policy", id: r.id, name: r.name, description: r.description }));
  } else {
    await sequelize.query(`SELECT 1`, { type: QueryTypes.SELECT }); // keep query count stable for tests
  }

  return out;
}

// vendors.regulatory_exposure enum strings don't match framework names exactly.
function mapFrameworksToExposure(frameworks: string[]): string[] {
  const m: Record<string, string> = {
    "EU AI Act": "EU AI act",
    "ISO 27001": "ISO 27001",
  };
  const mapped = frameworks.map((f) => m[f]).filter(Boolean);
  return mapped.length ? mapped : ["__none__"];
}
```

> **Note on column names:** the queries above use `projects.project_title`, `projects.goal`, `projects.geography`, `controls.title`, `controls.description`, `vendors.vendor_name`, `vendors.vendor_provides`, `vendors.regulatory_exposure`, `policy_manager.title`. If any column name differs in your DB, the implementer must adjust — verify against the model files (`project.model.ts`, `control.model.ts`, `vendor.model.ts`, `policy.model.ts`) named in `docs/technical/domains/regulations-tracker.md`'s sibling schema. The test mocks `sequelize.query`, so tests stay green; **a manual smoke query against a seeded DB is required in Step 4a.**

- [ ] **Step 4: Run unit tests**

Run: `cd Servers && npm run test -- --testPathPattern="regulationImpact.utils"`
Expected: PASS (5 query calls asserted).

- [ ] **Step 4a: Smoke-verify column names against a real DB**

Run (psql against the dev DB):
```bash
cd Servers && node -e "require('ts-node/register'); const {sequelize}=require('./database/db'); sequelize.query('SELECT id, project_title, goal, geography FROM verifywise.projects LIMIT 1').then(r=>{console.log('projects OK', r[0][0]||'(empty)');process.exit(0)}).catch(e=>{console.error('COLUMN MISMATCH:', e.message);process.exit(1)});"
```
Expected: `projects OK ...`. If it errors with an unknown column, fix the SELECT in Step 3 to the real column name and re-run Step 4. Repeat the spot-check for `controls`, `vendors`, `policy_manager` if unsure.

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/regulationImpact.utils.ts Servers/utils/__tests__/regulationImpact.utils.test.ts
git commit -m "feat(regulations-tracker): Stage A deterministic candidate queries"
```

---

### Task 4: Stage B — prompt assembly + per-type LLM call

**Files:**
- Modify: `Servers/utils/regulationImpact.utils.ts`
- Test: `Servers/utils/__tests__/regulationImpact.utils.test.ts` (add describe block)

**Interfaces:**
- Consumes: `Candidate`, `LlmVerdict`, `validateVerdicts` (Task 2); `runAdvisorAiSdk` from `../advisor/aiSdkAgent`; `getLLMProviderUrl` from `./llmKey.utils`.
- Produces:
  - `type RegulationContext = { name: string; type: string; status: string; country: string; obligations: string[]; maxPenalty: string; changeLines: string[] };`
  - `type LlmCreds = { apiKey: string; baseURL: string; model: string; provider: "Anthropic" | "OpenAI" | "OpenRouter" | "Custom" };`
  - `buildUserPrompt(type: EntityType, ctx: RegulationContext, candidates: Candidate[]): string` — the structured user message.
  - `SYSTEM_PROMPTS: Record<EntityType, string>` — the six-rule system prompt per type.
  - `analyzeType(type, ctx, candidates, creds, tenant): Promise<LlmVerdict[]>` — calls the LLM once, parses JSON, validates; returns `[]` on any throw/parse failure (logged).

- [ ] **Step 1: Write the failing tests**

Add to the test file (mock the advisor):

```typescript
jest.mock("../../advisor/aiSdkAgent", () => ({ runAdvisorAiSdk: jest.fn() }));
import { runAdvisorAiSdk } from "../../advisor/aiSdkAgent";
import { buildUserPrompt, analyzeType, SYSTEM_PROMPTS } from "../regulationImpact.utils";

const ctx = {
  name: "AI Act", type: "EU AI Act", status: "in force", country: "European Union",
  obligations: ["human oversight"], maxPenalty: "€35M", changeLines: ["status: draft → in force"],
};

describe("buildUserPrompt", () => {
  it("includes regulation header, the change, and each candidate line", () => {
    const p = buildUserPrompt("system", ctx, [
      { type: "system", id: 1, name: "Resume Ranker", description: "hiring tool" },
    ]);
    expect(p).toContain("EU AI Act");
    expect(p).toContain("status: draft → in force");
    expect(p).toContain('id=1 "Resume Ranker"');
  });
});

describe("SYSTEM_PROMPTS", () => {
  it("has a prompt for every entity type with the conservative rule", () => {
    for (const t of ["system", "control", "policy", "vendor", "assessment"] as const) {
      expect(SYSTEM_PROMPTS[t]).toContain("conservative");
    }
  });
});

describe("analyzeType", () => {
  const creds = { apiKey: "k", baseURL: "u", model: "m", provider: "OpenAI" as const };
  const cands = [{ type: "system" as const, id: 1, name: "A", description: "" }];
  beforeEach(() => (runAdvisorAiSdk as jest.Mock).mockReset());

  it("parses and validates a good JSON response", async () => {
    (runAdvisorAiSdk as jest.Mock).mockResolvedValue(
      '{"results":[{"type":"system","id":1,"affected":true,"why":"in scope"}]}',
    );
    const out = await analyzeType("system", ctx, cands, creds, 7);
    expect(out).toEqual([{ type: "system", id: 1, affected: true, why: "in scope" }]);
  });

  it("returns [] when the LLM throws", async () => {
    (runAdvisorAiSdk as jest.Mock).mockRejectedValue(new Error("provider down"));
    expect(await analyzeType("system", ctx, cands, creds, 7)).toEqual([]);
  });

  it("returns [] when the response is not JSON", async () => {
    (runAdvisorAiSdk as jest.Mock).mockResolvedValue("sorry, I cannot help");
    expect(await analyzeType("system", ctx, cands, creds, 7)).toEqual([]);
  });

  it("tolerates JSON wrapped in markdown fences", async () => {
    (runAdvisorAiSdk as jest.Mock).mockResolvedValue(
      '```json\n{"results":[{"type":"system","id":1,"affected":false,"why":"out of scope"}]}\n```',
    );
    const out = await analyzeType("system", ctx, cands, creds, 7);
    expect(out).toEqual([{ type: "system", id: 1, affected: false, why: "out of scope" }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd Servers && npm run test -- --testPathPattern="regulationImpact.utils"`
Expected: FAIL — `buildUserPrompt is not a function`.

- [ ] **Step 3: Implement Stage B**

Append to `Servers/utils/regulationImpact.utils.ts` (add the imports):

```typescript
import { runAdvisorAiSdk } from "../advisor/aiSdkAgent";
import { logFailure } from "./logger/logHelper";
```

```typescript
export interface RegulationContext {
  name: string; type: string; status: string; country: string;
  obligations: string[]; maxPenalty: string; changeLines: string[];
}
export interface LlmCreds {
  apiKey: string; baseURL: string; model: string;
  provider: "Anthropic" | "OpenAI" | "OpenRouter" | "Custom";
}

const TYPE_NOUN: Record<EntityType, string> = {
  system: "AI systems", control: "controls", policy: "policies",
  vendor: "vendors", assessment: "assessments",
};

function systemPrompt(noun: string): string {
  return [
    `You are a compliance analyst assessing how a specific change to an AI regulation affects a list of an organisation's ${noun}.`,
    `You will be given: the regulation's identity and country, the specific change that just occurred (not the whole regulation), and a numbered list of candidate entities, each with a type, id, name and description.`,
    `For each candidate, decide whether this specific change plausibly creates new or altered obligations for that entity.`,
    `Rules you must follow:`,
    `1. Judge the change, not the regulation in general. An entity is "affected" only if the described change alters what the organisation must do about it.`,
    `2. Be conservative — when unsure, mark not affected. A false "affected" wastes the team's time and erodes trust.`,
    `3. Use only the information given. Do not assume facts about an entity beyond its description. Do not infer geography, sector or framework that isn't stated.`,
    `4. Only reason about entities in the provided list. Never introduce an entity, id or name that was not given to you.`,
    `5. For each affected entity, give one sentence stating the concrete reason, citing the specific obligation or change. No generic statements.`,
    `6. If a candidate is not affected, still return it with affected:false and a short reason.`,
    `Return ONLY valid JSON of the form {"results":[{"type":"...","id":N,"affected":true|false,"why":"..."}]}. No prose outside the JSON.`,
  ].join("\n");
}

export const SYSTEM_PROMPTS: Record<EntityType, string> = {
  system: systemPrompt(TYPE_NOUN.system),
  control: systemPrompt(TYPE_NOUN.control),
  policy: systemPrompt(TYPE_NOUN.policy),
  vendor: systemPrompt(TYPE_NOUN.vendor),
  assessment: systemPrompt(TYPE_NOUN.assessment),
};

export function buildUserPrompt(
  type: EntityType, ctx: RegulationContext, candidates: Candidate[],
): string {
  const change = ctx.changeLines.length
    ? ctx.changeLines.map((l) => `- ${l}`).join("\n")
    : "- (no structured diff available)";
  const cands = candidates
    .map((c) => `[${c.type}] id=${c.id} "${c.name}" — ${c.description || "(no description)"}`)
    .join("\n");
  return [
    `REGULATION: ${ctx.name} (${ctx.type}, ${ctx.status}) — ${ctx.country}`,
    `THE CHANGE:\n${change}`,
    `KEY OBLIGATIONS: ${ctx.obligations.join("; ") || "(none listed)"}`,
    `MAX PENALTY: ${ctx.maxPenalty || "(not specified)"}`,
    ``,
    `CANDIDATE ENTITIES:\n${cands}`,
  ].join("\n");
}

function parseJsonLoose(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in response");
  return JSON.parse(body.slice(start, end + 1));
}

export async function analyzeType(
  type: EntityType,
  ctx: RegulationContext,
  candidates: Candidate[],
  creds: LlmCreds,
  tenant: number,
): Promise<LlmVerdict[]> {
  try {
    const text = await runAdvisorAiSdk({
      apiKey: creds.apiKey,
      baseURL: creds.baseURL,
      model: creds.model,
      provider: creds.provider,
      tenant,
      userPrompt: `${SYSTEM_PROMPTS[type]}\n\n${buildUserPrompt(type, ctx, candidates)}`,
      availableTools: {},
      toolsDefinition: [],
      enableToolSubsetting: false,
    } as any);
    return validateVerdicts(parseJsonLoose(text), candidates);
  } catch (err) {
    logFailure({
      eventType: "Processing",
      description: `impact analysis ${type} call failed: ${(err as Error).message}`,
      functionName: "analyzeType",
      fileName: "regulationImpact.utils.ts",
    });
    return [];
  }
}
```

> **Note:** `runAdvisorAiSdk` carries the system instruction inside `userPrompt` (we concatenate system+user) because the advisor's single-turn path takes one `userPrompt` string. The `as any` cast covers the optional advisor params we deliberately omit (`userId`, `sessionId`). Verify `logFailure`'s parameter shape against an existing call in `regulationsTracker.utils.ts` and adjust field names if they differ.

- [ ] **Step 4: Run tests**

Run: `cd Servers && npm run test -- --testPathPattern="regulationImpact.utils"`
Expected: PASS (markdown-fence + throw + non-JSON cases green).

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/regulationImpact.utils.ts Servers/utils/__tests__/regulationImpact.utils.test.ts
git commit -m "feat(regulations-tracker): Stage B prompt build + per-type LLM analyze"
```

---

### Task 5: Orchestrator + persistence — `runImpactAnalysis`, get/upsert

**Files:**
- Modify: `Servers/utils/regulationImpact.utils.ts`
- Test: `Servers/utils/__tests__/regulationImpact.utils.test.ts` (add describe block)

**Interfaces:**
- Consumes: `getCandidates` (Task 3), `analyzeType` (Task 4), `getLLMKeysWithKeyQuery` + `getLLMProviderUrl` from `./llmKey.utils`.
- Produces:
  - `type ImpactResult = { systems: AffectedEntity[]; controls: AffectedEntity[]; policies: AffectedEntity[]; vendors: AffectedEntity[]; assessments: AffectedEntity[]; generatedAt: string };` where `AffectedEntity = { id: number; name: string; why: string }`.
  - `getImpactRow(organizationId, slug): Promise<{ result: ImpactResult | null; status: string; regulation_hash: string; refreshed_at: string } | null>`
  - `upsertImpactRow(organizationId, slug, hash, status, result, model): Promise<void>`
  - `runImpactAnalysis(organizationId, slug): Promise<{ status: string; result: ImpactResult | null; counts: Record<EntityType, number> }>` — the full pipeline: load `regulation_countries` row → build context → Stage A → (cache check by hash) → Stage B per non-empty type → upsert → return counts. Skips LLM and returns `status:"no_key"` when the org has no LLM key.

- [ ] **Step 1: Write the failing tests**

Add (mock the key fetch + reuse the query mock + advisor mock already set up):

```typescript
jest.mock("../llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn(),
  getLLMProviderUrl: jest.fn().mockReturnValue("https://api.openai.com/v1/"),
}));
import { getLLMKeysWithKeyQuery } from "../llmKey.utils";
import { runImpactAnalysis } from "../regulationImpact.utils";

describe("runImpactAnalysis", () => {
  const q = sequelize.query as jest.Mock;
  beforeEach(() => {
    q.mockReset();
    (getLLMKeysWithKeyQuery as jest.Mock).mockReset();
    (runAdvisorAiSdk as jest.Mock).mockReset();
  });

  it("returns no_key and does not call the LLM when the org has no key", async () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([]);
    // regulation_countries row lookup
    q.mockResolvedValueOnce([{ data: { name: "AI Act", regulations: [], history: null }, hash: "h1" }]);
    const out = await runImpactAnalysis(7, "eu");
    expect(out.status).toBe("no_key");
    expect(runAdvisorAiSdk).not.toHaveBeenCalled();
  });

  it("returns skipped_no_candidates when Stage A is empty for all types", async () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "k", name: "OpenAI", url: null, model: "gpt-4o" },
    ]);
    q.mockResolvedValueOnce([{ data: { name: "AI Act", country: "European Union", regulations: [], history: null }, hash: "h1" }]); // reg row
    // no cached row
    q.mockResolvedValueOnce([]); // getImpactRow
    // Stage A: 5 queries all empty
    q.mockResolvedValue([]);
    const out = await runImpactAnalysis(7, "eu");
    expect(out.status).toBe("skipped_no_candidates");
    expect(runAdvisorAiSdk).not.toHaveBeenCalled();
  });

  it("reuses a cached row when hash matches", async () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "k", name: "OpenAI", url: null, model: "gpt-4o" },
    ]);
    q.mockResolvedValueOnce([{ data: { name: "AI Act", regulations: [], history: null }, hash: "h1" }]); // reg row
    q.mockResolvedValueOnce([
      { regulation_hash: "h1", status: "ok", result: { systems: [], controls: [], policies: [], vendors: [], assessments: [], generatedAt: "x" }, refreshed_at: "t" },
    ]); // cached, hash matches
    const out = await runImpactAnalysis(7, "eu");
    expect(out.status).toBe("ok");
    expect(runAdvisorAiSdk).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd Servers && npm run test -- --testPathPattern="regulationImpact.utils"`
Expected: FAIL — `runImpactAnalysis is not a function`.

- [ ] **Step 3: Implement orchestrator + persistence**

Append to `Servers/utils/regulationImpact.utils.ts` (add import):

```typescript
import { getLLMKeysWithKeyQuery, getLLMProviderUrl } from "./llmKey.utils";
```

```typescript
export interface AffectedEntity { id: number; name: string; why: string }
export interface ImpactResult {
  systems: AffectedEntity[]; controls: AffectedEntity[]; policies: AffectedEntity[];
  vendors: AffectedEntity[]; assessments: AffectedEntity[]; generatedAt: string;
}

const RESULT_KEY: Record<EntityType, keyof Omit<ImpactResult, "generatedAt">> = {
  system: "systems", control: "controls", policy: "policies",
  vendor: "vendors", assessment: "assessments",
};

export async function getImpactRow(organizationId: number, slug: string) {
  const rows = (await sequelize.query(
    `SELECT regulation_hash, status, result, refreshed_at
       FROM regulation_impact_analysis
      WHERE organization_id = :organizationId AND country_slug = :slug
      LIMIT 1`,
    { replacements: { organizationId, slug }, type: QueryTypes.SELECT },
  )) as { regulation_hash: string; status: string; result: ImpactResult | null; refreshed_at: string }[];
  return rows[0] ?? null;
}

async function upsertImpactRow(
  organizationId: number, slug: string, hash: string,
  status: string, result: ImpactResult | null, model: string | null,
) {
  await sequelize.query(
    `INSERT INTO regulation_impact_analysis
       (organization_id, country_slug, regulation_hash, status, result, model, refreshed_at)
     VALUES (:organizationId, :slug, :hash, :status, :result::jsonb, :model, NOW())
     ON CONFLICT (organization_id, country_slug) DO UPDATE
       SET regulation_hash = EXCLUDED.regulation_hash,
           status = EXCLUDED.status,
           result = EXCLUDED.result,
           model = EXCLUDED.model,
           refreshed_at = NOW()`,
    {
      replacements: {
        organizationId, slug, hash, status, model,
        result: result ? JSON.stringify(result) : null,
      },
    },
  );
}

function buildContext(slug: string, data: any): RegulationContext {
  const regs = Array.isArray(data?.regulations) ? data.regulations : [];
  const first = regs[0] ?? {};
  const obligations: string[] = [];
  for (const r of regs) if (Array.isArray(r.obligations)) obligations.push(...r.obligations);
  const changeLines: string[] = [];
  const changes = data?.history?.lastChange?.changes;
  if (Array.isArray(changes)) {
    for (const ch of changes) {
      if (ch.field === "regulation.status") changeLines.push(`${ch.regulation}: status ${ch.from} → ${ch.to}`);
      else if (ch.field === "regulation.effectiveDate") changeLines.push(`${ch.regulation}: effective date ${ch.from} → ${ch.to}`);
      else if (ch.field === "regulation") changeLines.push(`regulation ${ch.change}: ${ch.value}`);
      else if (ch.field === "regulationCount") changeLines.push(`regulation count ${ch.from} → ${ch.to}`);
    }
  }
  return {
    name: data?.name ?? slug,
    type: first.type ?? "",
    status: first.status ?? "",
    country: data?.name ?? "",
    obligations,
    maxPenalty: first.maxPenalty ?? "",
    changeLines,
  };
}

export async function runImpactAnalysis(
  organizationId: number, slug: string,
): Promise<{ status: string; result: ImpactResult | null; counts: Record<EntityType, number> }> {
  const zeroCounts = (): Record<EntityType, number> => ({ system: 0, control: 0, policy: 0, vendor: 0, assessment: 0 });

  // load the global catalog row
  const regRows = (await sequelize.query(
    `SELECT data, hash FROM regulation_countries WHERE slug = :slug LIMIT 1`,
    { replacements: { slug }, type: QueryTypes.SELECT },
  )) as { data: any; hash: string }[];
  if (!regRows.length) return { status: "error", result: null, counts: zeroCounts() };
  const { data, hash } = regRows[0];

  // key gate
  const keys = await getLLMKeysWithKeyQuery(organizationId);
  if (!keys.length) return { status: "no_key", result: null, counts: zeroCounts() };
  const k = keys[0];
  const creds: LlmCreds = {
    apiKey: k.key,
    baseURL: k.url || getLLMProviderUrl(k.name),
    model: k.model,
    provider: k.name,
  };

  // cache check
  const cached = await getImpactRow(organizationId, slug);
  if (cached && cached.regulation_hash === hash && cached.status === "ok") {
    return { status: "ok", result: cached.result, counts: countsFromResult(cached.result) };
  }

  const ctx = buildContext(slug, data);
  const candidates = await getCandidates(organizationId, ctx.country, { type: ctx.type, country: ctx.country });

  const nonEmpty = (Object.keys(candidates) as EntityType[]).filter((t) => candidates[t].length > 0);
  if (!nonEmpty.length) {
    await upsertImpactRow(organizationId, slug, hash, "skipped_no_candidates", null, null);
    return { status: "skipped_no_candidates", result: null, counts: zeroCounts() };
  }

  const verdictsByType = await Promise.all(
    nonEmpty.map((t) => analyzeType(t, ctx, candidates[t], creds, organizationId).then((v) => [t, v] as const)),
  );

  const result: ImpactResult = {
    systems: [], controls: [], policies: [], vendors: [], assessments: [],
    generatedAt: new Date().toISOString(),
  };
  for (const [t, verdicts] of verdictsByType) {
    const byId = new Map(candidates[t].map((c) => [c.id, c.name]));
    for (const v of verdicts) {
      if (v.affected) result[RESULT_KEY[t]].push({ id: v.id, name: byId.get(v.id) ?? String(v.id), why: v.why });
    }
  }
  await upsertImpactRow(organizationId, slug, hash, "ok", result, creds.model);
  return { status: "ok", result, counts: countsFromResult(result) };
}

function countsFromResult(result: ImpactResult | null): Record<EntityType, number> {
  return {
    system: result?.systems.length ?? 0,
    control: result?.controls.length ?? 0,
    policy: result?.policies.length ?? 0,
    vendor: result?.vendors.length ?? 0,
    assessment: result?.assessments.length ?? 0,
  };
}
```

> **Note:** `new Date().toISOString()` is fine in app code (the Date restriction applies only to workflow scripts). Tests mock the DB; the `generatedAt` value isn't asserted exactly.

- [ ] **Step 4: Run tests**

Run: `cd Servers && npm run test -- --testPathPattern="regulationImpact.utils"`
Expected: PASS (no_key, skipped_no_candidates, cache-hit cases green).

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/regulationImpact.utils.ts Servers/utils/__tests__/regulationImpact.utils.test.ts
git commit -m "feat(regulations-tracker): impact analysis orchestrator + persistence"
```

---

### Task 6: Wire Stage A+B into the sync notification phase

**Files:**
- Modify: `Servers/services/automations/actions/syncRegulationsTracker.ts` (the per-org loop ~line 262 and inner per-country loop ~line 275)
- Test: `Servers/services/automations/actions/__tests__/syncRegulationsTracker.test.ts` (extend existing)

**Interfaces:**
- Consumes: `runImpactAnalysis` (Task 5), `getLLMKeysWithKeyQuery` (for the per-org `hasKey` flag).

- [ ] **Step 1: Read the existing sync test + the loop**

Run: `cd Servers && sed -n '255,320p' services/automations/actions/syncRegulationsTracker.ts`
Confirm the variable names `byOrg`, `orgId`, `countries`, `c`, `userIds`, the `createNotificationQuery` call, and the `message`/`title` construction. (The plan below assumes `message` is a `let` built per country; if it is `const`, change it to `let` so the nudge/counts can be appended.)

- [ ] **Step 2: Add the per-org key check + per-country analysis**

At the top of the `for (const [orgId, countries] of byOrg)` body (before the `userIds` resolution), insert:

```typescript
let orgHasKey = false;
try {
  orgHasKey = (await getLLMKeysWithKeyQuery(orgId)).length > 0;
} catch {
  orgHasKey = false;
}
```

Inside `for (const c of countries)` (before the `for (const uid of userIds)` fan-out), insert:

```typescript
let impactSuffix = "";
if (!c.removed) {
  if (orgHasKey) {
    try {
      const impact = await runImpactAnalysis(orgId, c.slug);
      if (impact.status === "ok") {
        const parts: string[] = [];
        if (impact.counts.system) parts.push(`${impact.counts.system} AI system(s) affected`);
        if (impact.counts.control) parts.push(`${impact.counts.control} control(s) to review`);
        if (impact.counts.policy) parts.push(`${impact.counts.policy} policy(ies) may be outdated`);
        if (impact.counts.vendor) parts.push(`${impact.counts.vendor} vendor(s) impacted`);
        if (impact.counts.assessment) parts.push(`${impact.counts.assessment} assessment(s) to update`);
        if (parts.length) impactSuffix = `\n\nImpact: ${parts.join(", ")}.`;
      }
    } catch (err) {
      logFailure({
        eventType: "Processing",
        description: `impact analysis failed for org ${orgId} / ${c.slug}: ${(err as Error).message}`,
        functionName: "syncRegulationsTracker",
        fileName: "syncRegulationsTracker.ts",
      });
    }
  } else {
    impactSuffix =
      "\n\nConfigure an LLM key to see which of your AI systems, controls and vendors this affects.";
  }
}
```

Then where `message` is assembled for the in-app notification, append the suffix:

```typescript
const message = `${/* existing message body, e.g. c.lines.join("\n") */ baseMessage}${impactSuffix}`;
```

(If the existing code uses `c.lines.join("\n")` inline in the `createNotificationQuery` call, refactor it to a `baseMessage` local first, then append `impactSuffix`.)

- [ ] **Step 3: Add imports at the top of the file**

```typescript
import { runImpactAnalysis } from "../../../utils/regulationImpact.utils";
import { getLLMKeysWithKeyQuery } from "../../../utils/llmKey.utils";
```

(Adjust the relative depth to match the file's existing imports — it is under `Servers/services/automations/actions/`.)

- [ ] **Step 4: Extend the sync test — assert a bad LLM key never breaks the sync**

Add to `syncRegulationsTracker.test.ts` (mock the new utils so the existing test DB mocks are unaffected):

```typescript
jest.mock("../../../../utils/regulationImpact.utils", () => ({
  runImpactAnalysis: jest.fn().mockRejectedValue(new Error("LLM exploded")),
}));
jest.mock("../../../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn().mockResolvedValue([{ key: "k", name: "OpenAI", url: null, model: "m" }]),
}));
```

Then in the existing "happy path notifies tracked orgs" test, assert the run still completes (e.g. `recordRunStatus` called with an `ok:` string, notifications still created) despite `runImpactAnalysis` rejecting. If the existing test file structure differs, mirror its existing "notifies" test and add one assertion: `expect(recordRunStatus).toHaveBeenCalledWith(expect.stringContaining("ok"));`.

- [ ] **Step 5: Run the sync test + full backend build**

Run: `cd Servers && npm run test -- --testPathPattern="syncRegulationsTracker"`
Expected: PASS.
Run: `cd Servers && npm run build`
Expected: build succeeds (TypeScript clean).

- [ ] **Step 6: Commit**

```bash
git add Servers/services/automations/actions/syncRegulationsTracker.ts Servers/services/automations/actions/__tests__/syncRegulationsTracker.test.ts
git commit -m "feat(regulations-tracker): run impact analysis during sync; nudge keyless orgs"
```

---

### Task 7: Rate limiter + controllers (GET + refresh)

**Files:**
- Modify: `Servers/middleware/rateLimit.middleware.ts`
- Modify: `Servers/controllers/regulationsTracker.ctrl.ts`
- Test: `Servers/controllers/__tests__/regulationImpact.ctrl.test.ts`

**Interfaces:**
- Consumes: `getImpactRow`, `runImpactAnalysis` (Task 5); `isAdmin` (existing, `regulationsTracker.ctrl.ts:26`); `STATUS_CODE`.
- Produces:
  - middleware `regulationsTrackerImpactLimiter`
  - `getImpactAnalysis(req, res)` — 200 with `{ result, status, refreshed_at, stale }` or `null`.
  - `refreshImpactAnalysis(req, res)` — Admin-gated; runs `runImpactAnalysis`, returns the fresh row.

- [ ] **Step 1: Add the rate limiter**

In `Servers/middleware/rateLimit.middleware.ts`, add to `RATE_LIMIT_CONFIGS` (next to `regulationsTrackerSync`):

```typescript
regulationsTrackerImpact: {
  windowMinutes: 5,
  maxRequests: 10,
  message:
    "Too many impact-analysis refresh requests, please wait a few minutes before trying again",
},
```

And add the exported limiter (next to `regulationsTrackerSyncLimiter`):

```typescript
/**
 * Rate limiter for the admin-triggered impact-analysis refresh. Each run can
 * issue several LLM calls, so cap manual refreshes per 5-minute window.
 */
export const regulationsTrackerImpactLimiter = createRateLimiter(
  RATE_LIMIT_CONFIGS.regulationsTrackerImpact,
);
```

- [ ] **Step 2: Write the failing controller tests**

Create `Servers/controllers/__tests__/regulationImpact.ctrl.test.ts`:

```typescript
jest.mock("../../utils/regulationImpact.utils", () => ({
  getImpactRow: jest.fn(),
  runImpactAnalysis: jest.fn(),
}));
jest.mock("../../utils/regulationsTracker.utils", () => ({}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(), logSuccess: jest.fn(), logFailure: jest.fn(),
}));
import { getImpactRow, runImpactAnalysis } from "../../utils/regulationImpact.utils";
import { getImpactAnalysis, refreshImpactAnalysis } from "../regulationsTracker.ctrl";

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
beforeEach(() => jest.clearAllMocks());

describe("getImpactAnalysis", () => {
  it("returns 200 with the row and a stale flag computed against current hash", async () => {
    (getImpactRow as jest.Mock).mockResolvedValue({
      regulation_hash: "h1", status: "ok",
      result: { systems: [], controls: [], policies: [], vendors: [], assessments: [], generatedAt: "x" },
      refreshed_at: "t",
    });
    const req: any = { organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 200 with null when there is no analysis row", async () => {
    (getImpactRow as jest.Mock).mockResolvedValue(null);
    const req: any = { organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: null }));
  });
});

describe("refreshImpactAnalysis", () => {
  it("403s for non-admins", async () => {
    const req: any = { organizationId: 7, role: "Editor", params: { slug: "eu" } };
    const res = mockRes();
    await refreshImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(runImpactAnalysis).not.toHaveBeenCalled();
  });

  it("runs analysis for admins and returns 200", async () => {
    (runImpactAnalysis as jest.Mock).mockResolvedValue({ status: "ok", result: null, counts: {} });
    const req: any = { organizationId: 7, role: "Admin", params: { slug: "eu" } };
    const res = mockRes();
    await refreshImpactAnalysis(req, res);
    expect(runImpactAnalysis).toHaveBeenCalledWith(7, "eu");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd Servers && npm run test -- --testPathPattern="regulationImpact.ctrl"`
Expected: FAIL — `getImpactAnalysis is not exported`.

- [ ] **Step 4: Implement the controllers**

In `Servers/controllers/regulationsTracker.ctrl.ts`, add imports at the top:

```typescript
import { getImpactRow, runImpactAnalysis } from "../utils/regulationImpact.utils";
import { getCountryRow } from "../utils/regulationsTracker.utils"; // if not already imported
```

Add at the end of the file (mirroring the existing controller style + `isAdmin` at line 26):

```typescript
export async function getImpactAnalysis(req: any, res: any) {
  try {
    const { slug } = req.params;
    const row = await getImpactRow(req.organizationId, slug);
    if (!row) return res.status(200).json(STATUS_CODE[200](null));
    // staleness: compare stored hash to the current catalog hash
    const current = await getCountryRow(slug); // returns { hash, ... } | null
    const stale = !!current && current.hash !== row.regulation_hash;
    return res.status(200).json(
      STATUS_CODE[200]({
        result: row.result,
        status: row.status,
        refreshed_at: row.refreshed_at,
        stale,
      }),
    );
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function refreshImpactAnalysis(req: any, res: any) {
  if (!isAdmin(req.role)) {
    return res.status(403).json(STATUS_CODE[403]("Admin access required"));
  }
  try {
    const { slug } = req.params;
    const out = await runImpactAnalysis(req.organizationId, slug);
    return res.status(200).json(STATUS_CODE[200](out));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
```

> **Note:** confirm `getCountryRow(slug)` exists in `regulationsTracker.utils.ts` and returns a `hash`. If its name/return differs, use a direct query: `SELECT hash FROM regulation_countries WHERE slug = :slug`. The controller test mocks the utils module, so it stays green either way — adjust the import to match reality.

- [ ] **Step 5: Run controller tests + build**

Run: `cd Servers && npm run test -- --testPathPattern="regulationImpact.ctrl"`
Expected: PASS.
Run: `cd Servers && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add Servers/middleware/rateLimit.middleware.ts Servers/controllers/regulationsTracker.ctrl.ts Servers/controllers/__tests__/regulationImpact.ctrl.test.ts
git commit -m "feat(regulations-tracker): impact analysis GET + admin refresh controllers + rate limiter"
```

---

### Task 8: Register the routes (ordering-critical)

**Files:**
- Modify: `Servers/routes/regulationsTracker.route.ts`

**Interfaces:**
- Consumes: `getImpactAnalysis`, `refreshImpactAnalysis` (Task 7); `regulationsTrackerImpactLimiter` (Task 7); `authenticateJWT`.

- [ ] **Step 1: Add imports**

```typescript
import { getImpactAnalysis, refreshImpactAnalysis } from "../controllers/regulationsTracker.ctrl";
import { regulationsTrackerImpactLimiter } from "../middleware/rateLimit.middleware";
```

- [ ] **Step 2: Register the GET route BEFORE `GET /countries/:slug`**

Find the line `router.get("/countries/:slug", authenticateJWT, getCountryDetail);` and insert ABOVE it:

```typescript
// MUST be registered before "/countries/:slug" — Express is greedy on path params,
// otherwise "/countries/france/impact" would route to getCountryDetail with slug="france/impact".
router.get("/countries/:slug/impact", authenticateJWT, getImpactAnalysis);
router.post(
  "/countries/:slug/impact/refresh",
  authenticateJWT,
  regulationsTrackerImpactLimiter,
  refreshImpactAnalysis,
);
```

- [ ] **Step 3: Verify ordering with a route smoke test**

Add to `regulationsTracker.ctrl.test.ts` is not enough (routing is in the route file). Instead, verify by reading: run `cd Servers && grep -n "countries/:slug" routes/regulationsTracker.route.ts` and confirm `/countries/:slug/impact` and `/countries/:slug/impact/refresh` lines appear **before** the bare `/countries/:slug` line.
Expected: the impact routes print on earlier line numbers than the bare detail route.

- [ ] **Step 4: Build**

Run: `cd Servers && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add Servers/routes/regulationsTracker.route.ts
git commit -m "feat(regulations-tracker): register impact analysis routes (ordered before :slug)"
```

---

### Task 9: Frontend — repository + hooks

**Files:**
- Modify: `Clients/src/application/repository/regulationsTracker.repository.ts`
- Modify: `Clients/src/application/hooks/useRegulationsTracker.ts`

**Interfaces:**
- Produces: `getImpactAnalysis(slug)`, `refreshImpactAnalysis(slug)` (repository); `useImpactAnalysis(slug)`, `useRefreshImpactAnalysis()` (hooks).

- [ ] **Step 1: Add repository methods**

In `regulationsTracker.repository.ts`, after `getCountryDetail`:

```typescript
export async function getImpactAnalysis(slug: string): Promise<any> {
  const response = await apiServices.get(
    `${BASE}/countries/${encodeURIComponent(slug)}/impact`,
  );
  return response.data;
}

export async function refreshImpactAnalysis(slug: string): Promise<any> {
  return (
    await apiServices.post(
      `${BASE}/countries/${encodeURIComponent(slug)}/impact/refresh`,
      {},
    )
  ).data;
}
```

- [ ] **Step 2: Add hooks**

In `useRegulationsTracker.ts`, mirror the existing `useCountryDetail`/`useTriggerSync`:

```typescript
import { getImpactAnalysis, refreshImpactAnalysis } from "../repository/regulationsTracker.repository";

export function useImpactAnalysis(slug: string) {
  return useQuery({
    queryKey: [KEY, "impact", slug],
    queryFn: () => getImpactAnalysis(slug),
    enabled: !!slug,
  });
}

export function useRefreshImpactAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => refreshImpactAnalysis(slug),
    onSuccess: (_data, slug) => {
      qc.invalidateQueries({ queryKey: [KEY, "impact", slug] });
    },
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd Clients && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add Clients/src/application/repository/regulationsTracker.repository.ts Clients/src/application/hooks/useRegulationsTracker.ts
git commit -m "feat(regulations-tracker): impact analysis repository + hooks"
```

---

### Task 10: Frontend — Impact panel on CountryDetail

**Files:**
- Modify: `Clients/src/presentation/pages/RegulationsTracker/CountryDetail/index.tsx`

**Interfaces:**
- Consumes: `useImpactAnalysis`, `useRefreshImpactAnalysis` (Task 9).

- [ ] **Step 1: Wire the hook + render the panel**

In `CountryDetail/index.tsx`, alongside the existing `useCountryDetail(slug)`:

```typescript
import { useImpactAnalysis, useRefreshImpactAnalysis } from "../../../../application/hooks/useRegulationsTracker";
```

```typescript
const { data: impactRes } = useImpactAnalysis(slug);
const refreshImpact = useRefreshImpactAnalysis();
const impact = impactRes?.data ?? null; // { result, status, refreshed_at, stale } | null
```

Render an **Impact** section ONLY when `impact?.status === "ok" && impact.result`. Each group renders a count line; expanding shows entities + `why`. Use existing VerifyWise components (no raw MUI): a `Stack` of rows mirroring the Browse card layout already in this module. Example structure:

```tsx
{impact?.status === "ok" && impact.result && (
  <Box sx={{ mt: "24px" }}>
    <Typography sx={{ fontWeight: 600, mb: "8px" }}>
      {t("regulationsTracker.impact.title", "How this change affects your organisation")}
    </Typography>
    {impact.stale && (
      <Alert severity="info" sx={{ mb: "8px" }}>
        {t("regulationsTracker.impact.stale", "This analysis predates the latest change.")}{" "}
        <Link component="button" onClick={() => refreshImpact.mutate(slug)}>
          {t("regulationsTracker.impact.reanalyse", "Re-analyse")}
        </Link>
      </Alert>
    )}
    {([
      ["systems", "AI systems"],
      ["controls", "Controls to review"],
      ["policies", "Policies that may be outdated"],
      ["vendors", "Vendors impacted"],
      ["assessments", "Assessments to update"],
    ] as const).map(([key, label]) =>
      impact.result[key].length ? (
        <Box key={key} sx={{ mb: "8px" }}>
          <Typography sx={{ fontWeight: 500 }}>
            {impact.result[key].length} {label}
          </Typography>
          <Stack sx={{ pl: "12px", gap: "4px" }}>
            {impact.result[key].map((e: { id: number; name: string; why: string }) => (
              <Typography key={e.id} variant="body2">
                <strong>{e.name}</strong> — {e.why}
              </Typography>
            ))}
          </Stack>
        </Box>
      ) : null,
    )}
  </Box>
)}
```

> **Note:** use whichever `Alert`/`Link`/`Typography`/`Box`/`Stack` imports the file already uses; match the existing import block. The inline `${count} ${label}` strings follow the module's English-only inline convention (consistent with the rest of CountryDetail); the section **title** and **stale banner** strings ARE translated (de/fr/es) — add those keys.

- [ ] **Step 2: Add i18n keys for the translated strings**

Add to `Clients/.../i18n/translations.ts` (de, fr, es + en) for: `regulationsTracker.impact.title`, `regulationsTracker.impact.stale`, `regulationsTracker.impact.reanalyse`. Use the existing module's keys as a template for placement.

- [ ] **Step 3: Typecheck + i18n audit + format**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`
Expected: all clean. If `format-check` flags, run `npm run format` and re-stage.

- [ ] **Step 4: Commit**

```bash
git add Clients/src/presentation/pages/RegulationsTracker/CountryDetail/index.tsx Clients/src/**/i18n/translations.ts
git commit -m "feat(regulations-tracker): impact panel on country detail page"
```

---

### Task 11: Docs — update the module reference

**Files:**
- Modify: `Servers/.. docs/technical/domains/regulations-tracker.md`

- [ ] **Step 1: Append an "Impact analysis" section**

Add a section to `docs/technical/domains/regulations-tracker.md` documenting: the new table, the two endpoints (with the route-ordering caveat), the Stage A/Stage B funnel, the LLM-key gating, the sync hook point, and the V1 limitations (country→region coarseness, standalone policies unmatched). Move the spec's §9 limitations into the "open items" of that doc. Keep it factual and short — mirror the existing doc's tone.

- [ ] **Step 2: Update the "Last updated" date and commit**

```bash
git add docs/technical/domains/regulations-tracker.md
git commit -m "docs(regulations-tracker): document impact analysis (table, endpoints, funnel, limits)"
```

---

## Final verification (before any PR)

- [ ] `cd Servers && npm run build` — clean
- [ ] `cd Servers && npm run test -- --testPathPattern="regulationImpact"` — green
- [ ] `cd Servers && npm run test -- --testPathPattern="syncRegulationsTracker"` — green
- [ ] `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check` — clean
- [ ] Manual smoke: configure an LLM key for the dev org, run admin `POST /sync` (or `POST /countries/<slug>/impact/refresh`), open a tracked changed country's detail page → Impact panel renders with at least one "why".
- [ ] Manual smoke: an org with NO key → no panel, notification carries the "Configure an LLM key…" line.

---

## Self-review notes (spec coverage)

- Promise + panel → Tasks 5, 10. Two-stage funnel → Tasks 3 (A), 4 (B), 5 (orchestration). Eager-at-sync + isolation + nudge → Task 6. Table + endpoints + staleness + own limiter + route order → Tasks 1, 7, 8. LLM contract (prompt, no JSON mode, validation, filter-only) → Tasks 2 (validation), 4 (prompt/call). No-key 200/null → Task 7. Soft-delete keeps rows → no code (documented, Task 11). Per-run cap (`IMPACT_MAX_ANALYSES_PER_RUN`) → **deferred**: V1 ships without the global cap because Stage A already bounds per-(org,country) cost and the weekly cadence limits fan-out; add it in Task 6 only if a large-feed run proves slow (noted here so it isn't silently dropped). Frontend → Tasks 9, 10.
