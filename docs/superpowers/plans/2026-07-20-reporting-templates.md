# Reporting Phase 3 — Custom Templates, Section Catalog, and Org-Scope Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give organizations a write path for report templates — create, edit, archive — backed by a single server-owned section catalog, with the two org-scope holes that this feature would otherwise make exploitable closed first.

**Architecture:** The read-only template stack (`reportTemplate.ctrl.ts`, 2 handlers) grows a CRUD write path gated by `authorize(["Admin", "Editor"])`, matching the existing `scheduled_reports` write RBAC. Template *metadata* updates in place; template *config* is append-only — a config edit writes a new `report_template_versions` row rather than mutating one, which the existing `(template_id, version)` unique index already assumes. The section taxonomy moves from a frontend hardcoded list to `Servers/services/reporting/sectionCatalog.ts`, from which `VALID_SECTION_KEYS` is derived, and is served over a new `GET /api/reporting/sections`. On the frontend, a new `TemplateBuilder` drawer mounts beside the existing `ConfigureReportWizard` drawer in the Reporting page, and the wizard's hardcoded three AI checkboxes widen to the seven blocks Phase 2 shipped on the backend.

**Tech Stack:** Node 22, Express 4, Sequelize 6 (raw SQL + `:replacements`), PostgreSQL (`verifywise` shared schema, `organization_id` isolation), Jest (backend), React 19 + MUI 7 + React Query (frontend), Vitest + Testing Library (frontend).

---

## Context you need before Task 1

**This is Phase 3 of 4.** Phase 1 (async pipeline) and Phase 2 (six analyzers) are merged on this branch. Spec: `docs/superpowers/specs/2026-07-17-reporting-agent-analysis-design.md` §6 and §9. Issue: `verifywise-ai/verifywise#4280`.

### The three files you must not touch

`Clients/src/presentation/pages/Reporting/TemplatesTab.tsx`, `ScheduledReportsTab.tsx`, and `ArchiveTab.tsx` are **uncommitted work belonging to another developer** — a styling/design-token refactor (+202/−126, no logic changes). The user has explicitly chosen to defer anything touching them to a follow-up. Do not edit, stage, or commit them.

More generally: the working tree carries ~74 pre-existing dirty files that are not ours. **Never run `git add -A` or `git add .`** — stage only the exact paths each task names.

### Reconnaissance corrections — the spec is wrong in five places

The spec was written before the code was read closely. Where this plan and the spec disagree, **this plan is correct** — each of these was verified against the source:

1. **`getRunAnalysesQuery` already exists** (`Servers/utils/reportRunAnalysis.utils.ts:62-71`), written in Phase 2 and never wired to a route. Task 6 adds a controller and route over it; it does **not** write new SQL.
2. **There is no `api-docs-drift` CI job.** `Servers/CLAUDE.md:184` and spec §Documentation both assert one. No workflow in `.github/workflows/` runs `check:api-drift`, `generate:swagger`, or `generate:endpoints`. Regeneration is a manual pre-PR step — Task 8 does it explicitly and corrects the false claim in the docs.
3. **`useStandardModal` does not exist.** Spec §9 names it. Only the `StandardModal` component exists. Do not import a hook that isn't there.
4. **`reporting.repository.ts` is better typed than the spec claims.** `generateReportV2` and `getReportRun` are typed in addition to `downloadReportRun`; 7 of 10 functions return `any`, not 9.
5. **The spec conflates two independent UIs.** `ConfigureReportWizard` (scheduled reports) sends `aiBlocksConfig` — an object with three hardcoded keys. The legacy `components/Reporting/GenerateReport/` popup sends `aiEnhanced: boolean`. They share no code and no state. **Phase 3 changes only `ConfigureReportWizard`.** The manual `aiEnhanced` path stays exactly as Phase 2 shipped it (five behaviour-preserving blocks) — this was a locked user decision, not an oversight.

### The frontend type gate does not work the way you expect

`Clients/package.json`'s `build` script is `node scripts/build.js`, which runs **`vite build` only — no `tsc`**. Type errors do not fail the frontend build. There is a **pre-existing** `TS7030` error:

```
src/presentation/components/Reporting/GenerateReport/index.tsx(152,13): error TS7030: Not all code paths return a value.
```

That file is clean (nobody's uncommitted work) and out of scope. **Do not fix it** — it is the documented baseline. The frontend type gate for this phase is:

```bash
cd Clients && npx tsc --noEmit -p tsconfig.app.json
```

Expected: **exactly one error, the TS7030 above, and nothing else.** Any second error is yours.

This mirrors the Phase 2 discovery that `Servers/tsconfig.json` omits `./services/**`. Assume no gate works until you have watched it fail.

---

## Locked decisions

Read these before writing code. Each was forced by something in the schema or the existing code, not chosen for taste.

1. **DELETE is a soft delete — the schema already decided this.** `scheduled_reports.template_id` is `INTEGER NOT NULL REFERENCES report_templates(id)` with **no `ON DELETE` clause** (`20260619190359-create-reporting-domain.js:46`), so PostgreSQL defaults to `NO ACTION`. A hard `DELETE` of a template that any schedule references fails at the database with a foreign-key violation. `report_templates.is_active` already exists and `getTemplatesQuery` already filters `WHERE is_active = true`. So `DELETE /:id` sets `is_active = false`. There is no `deleted_at` column on this table and this plan does not add one.

2. **Config edits are append-only; metadata edits are in-place.** `idx_tpl_versions_unique ON report_template_versions(template_id, version)` (migration line 98) makes versions immutable by design. `PATCH /:id` therefore splits: `name`, `description`, `category`, `recommended_frequency`, `is_active` update the `report_templates` row; any of `sections_config`, `ai_blocks_config`, `format_config`, `branding_config`, `schedule_defaults`, `delivery_defaults` inserts a **new version row** at `MAX(version) + 1`. This is what the spec means by "versions stay append-only".

3. **System templates are read-only, enforced by the WHERE clause, not by an `if`.** The read queries use `(organization_id IS NULL OR organization_id = :organization_id)` so every org can *see* system templates. The write queries use `organization_id = :organization_id AND is_system_template = false` — a system template simply matches zero rows on write and the controller returns 404. There is no branch to forget.

4. **Slug is derived server-side and uniqueness is enforced by a partial index.** `report_templates.slug` is `NOT NULL` with no unique constraint today (only a plain `idx_report_templates_org` on `organization_id`). Two custom templates in one org could silently collide. Task 3 adds `UNIQUE (COALESCE(organization_id, 0), slug)` — `COALESCE` because system templates have `organization_id IS NULL` and NULLs never compare equal in a unique index, so a plain `(organization_id, slug)` index would not constrain them. A collision surfaces as `409`, not a silent second row. This is safe to add: no write path has ever existed, and the seed's three slugs are distinct and inserted idempotently.

5. **The section catalog becomes the single owner, and `VALID_SECTION_KEYS` derives from it.** Today `REPORT_SECTION_GROUPS` (frontend, 12 keys) and `VALID_SECTION_KEYS` (backend, 12 keys + the `all` wildcard) agree by luck — nothing enforces it. Task 2 creates `sectionCatalog.ts` as the source of truth and rebuilds `VALID_SECTION_KEYS` from it as `new Set([...SECTION_KEYS, "all"])`. A test pins the resulting set against the current 13 literals so the refactor cannot change behaviour.

6. **`REPORT_SECTION_GROUPS` is pinned, not deleted.** It belongs to the legacy immediate-generate popup, a different flow that Phase 3 does not touch. Ripping it out to "consume the catalog" would be a rewrite of an out-of-scope surface. Instead Task 2 adds a test asserting its `backendKey` set equals the catalog's key set, so drift fails a test. Migrating the popup itself is carried forward.

7. **The catalog's labels are new text and use sentence case; the pin test compares keys only.** Design rules mandate sentence case ("Use case risks"); the legacy constants use title case ("Use Case Risks"). Pinning labels would force one of the two to be wrong. Keys are the contract; labels are presentation.

8. **`ReportAnalysisPanel` is deferred to the follow-up, with its endpoint shipped now.** The only place a user selects a run is `ArchiveTab`, which is off-limits this phase. A panel with no mount point is unreachable UI — precisely the failure the spec cites as its own cautionary tale (`EvidenceAnalysisPanel`'s `document_signals` chip block, gated at `index.tsx:480`, has been unreachable since it was written because no backend field of that name has ever existed). Phase 3 ships `GET /runs/:id/analyses`, the `useRunAnalyses` hook, and the payload types — all independently testable. The panel and its mount land together.

9. **The `templateVersionId` ownership check must be `await`ed, and that is a trap worth a test.** `validateScheduledReportInput` is synchronous and `scheduledReport.ctrl.ts:35` calls it without `await`. The new ownership check needs a database lookup, so it is async. If a future edit drops the `await`, `errors.length` reads `undefined` on the returned Promise, `if (undefined)` is falsy, and **validation silently passes for every request**. Task 5 asserts the rejection path explicitly so a dropped `await` fails a test rather than opening the hole it just closed.

10. **The two "security holes" are real but neither is live today — fix them as hardening, not incident response.** `getVersionByIdQuery` has **zero callers repo-wide**; it is an unscoped primitive waiting for its first caller, and Task 5 is that caller. `getLatestVersionQuery` is unscoped but its one caller (`reportTemplate.ctrl.ts:33`) passes an id already validated by the org-scoped `getTemplateByIdQuery` on the line above. Separately, `scheduled_reports.template_version_id` is **never read back to fetch content** — `reportRunOrchestrator.ts` passes it to `createRunQuery` as an audit FK only, and report content comes from `sections_config` captured at creation time. So the unvalidated `templateVersionId` is a cross-org *attribution* defect, not a content-injection vector. Fix all three; do not describe them in the PR as active exploits, because they are not.

---

## File structure

**Created — backend**
| Path | Responsibility |
|---|---|
| `Servers/services/reporting/sectionCatalog.ts` | The 12 report sections: key, label, group. Sole owner of the taxonomy. |
| `Servers/database/migrations/<stamp>-report-template-slug-unique.js` | Partial unique index on `(COALESCE(organization_id,0), slug)`. |
| `Servers/services/reporting/__tests__/sectionCatalog.test.ts` | Pins catalog ↔ `VALID_SECTION_KEYS` ↔ `REPORT_SECTION_GROUPS`. |
| `Servers/controllers/__tests__/reportTemplate.ctrl.test.ts` | CRUD handler tests. |
| `Servers/services/reporting/__tests__/templateVersionOwnership.test.ts` | The `await` trap and cross-org rejection. |

**Modified — backend**
| Path | Change |
|---|---|
| `Servers/utils/reportTemplate.utils.ts` | Org-scope both version queries; add create/update/archive/version-insert. |
| `Servers/controllers/reportTemplate.ctrl.ts` | Add `listSections`, `createTemplate`, `updateTemplate`, `archiveTemplate`; adopt the `respondWithError` pattern. |
| `Servers/routes/reportTemplate.route.ts` | Add POST / PATCH / DELETE with `authorize(["Admin","Editor"])`. |
| `Servers/routes/reporting.route.ts` | Add `GET /sections`. |
| `Servers/routes/reportRun.route.ts` | Add `GET /:id/analyses`. |
| `Servers/controllers/reportRun.ctrl.ts` | Add `getRunAnalyses`. |
| `Servers/services/reporting/index.ts` | Derive `VALID_SECTION_KEYS` from the catalog. |
| `Servers/services/reporting/scheduledReportService.ts` | Add async `validateTemplateVersionOwnership`. |
| `Servers/controllers/scheduledReport.ctrl.ts` | Await the ownership check. |
| `Servers/utils/__tests__/reportTemplate.utils.test.ts` | Extend for the new queries. |
| `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts` | Regenerated (never hand-edited). |
| `Servers/CLAUDE.md` | Correct the false `api-docs-drift` CI claim. |

**Created — frontend**
| Path | Responsibility |
|---|---|
| `Clients/src/presentation/pages/Reporting/TemplateBuilder.tsx` | Stepper drawer for creating/editing a custom template. |
| `Clients/src/presentation/pages/Reporting/__tests__/TemplateBuilder.test.tsx` | Builder tests. |

**Modified — frontend**
| Path | Change |
|---|---|
| `Clients/src/domain/interfaces/i.reporting.ts` | Template / section / analysis types. |
| `Clients/src/application/repository/reporting.repository.ts` | Template CRUD, sections, analyses. |
| `Clients/src/application/hooks/useReporting.ts` | Matching hooks with cache invalidation. |
| `Clients/src/presentation/pages/Reporting/index.tsx` | "New template" button + builder drawer. |
| `Clients/src/presentation/pages/Reporting/ConfigureReportWizard.tsx` | Seven AI blocks; typed state. |
| `docs/technical/domains/reporting.md` | Document the write path. |

---

## Task 1: Org-scope the template version queries

Closes the first hole **before** Task 5 becomes its first caller. Ordering matters: do this first and Task 5 inherits a safe primitive.

**Files:**
- Modify: `Servers/utils/reportTemplate.utils.ts:24-39`
- Modify: `Servers/controllers/reportTemplate.ctrl.ts:33`
- Test: `Servers/utils/__tests__/reportTemplate.utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `Servers/utils/__tests__/reportTemplate.utils.test.ts`:

```ts
  it("getLatestVersionQuery passes organization_id into the query", async () => {
    q.mockResolvedValueOnce([{ id: 10, version: 3 }]);
    const v = await getLatestVersionQuery(1, 42);
    expect(v.version).toBe(3);
    const [sql, opts] = q.mock.calls[0];
    expect(opts.replacements.organization_id).toBe(42);
    expect(opts.replacements.template_id).toBe(1);
    // The org filter must reach the versions table by joining its parent
    // template — report_template_versions has no organization_id column.
    expect(sql).toContain("JOIN report_templates");
    expect(sql).toContain("organization_id");
  });

  it("getVersionByIdQuery passes organization_id into the query", async () => {
    q.mockResolvedValueOnce([{ id: 10, template_id: 1 }]);
    const v = await getVersionByIdQuery(10, 42);
    expect(v.id).toBe(10);
    const [sql, opts] = q.mock.calls[0];
    expect(opts.replacements.organization_id).toBe(42);
    expect(sql).toContain("JOIN report_templates");
  });

  it("both version queries still admit system templates (organization_id IS NULL)", async () => {
    q.mockResolvedValueOnce([{ id: 10 }]);
    await getVersionByIdQuery(10, 42);
    const [sql] = q.mock.calls[0];
    expect(sql).toContain("organization_id IS NULL");
  });
```

Update the import at the top of that file to include `getVersionByIdQuery`:

```ts
import {
  getTemplatesQuery,
  getLatestVersionQuery,
  getVersionByIdQuery,
} from "../reportTemplate.utils";
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Servers && npx jest utils/__tests__/reportTemplate.utils.test.ts
```

Expected: FAIL. `getVersionByIdQuery` is called with two arguments but declared with one, so `opts.replacements.organization_id` is `undefined`.

Note: ts-jest runs with `diagnostics: false`, so the arity mismatch will **not** produce a type error — it fails on the assertion. Do not expect a compile failure.

- [ ] **Step 3: Implement**

Replace `Servers/utils/reportTemplate.utils.ts:24-39` with:

```ts
// Both version queries join their parent template to apply the org filter:
// report_template_versions carries no organization_id of its own. System
// templates (organization_id IS NULL) stay readable by every org.
export async function getLatestVersionQuery(
  template_id: number,
  organization_id: number,
): Promise<any> {
  const rows: any[] = await sequelize.query(
    `SELECT v.* FROM report_template_versions v
       JOIN report_templates t ON t.id = v.template_id
      WHERE v.template_id = :template_id
        AND (t.organization_id IS NULL OR t.organization_id = :organization_id)
      ORDER BY v.version DESC LIMIT 1`,
    { replacements: { template_id, organization_id }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

export async function getVersionByIdQuery(
  id: number,
  organization_id: number,
): Promise<any> {
  const rows: any[] = await sequelize.query(
    `SELECT v.* FROM report_template_versions v
       JOIN report_templates t ON t.id = v.template_id
      WHERE v.id = :id
        AND (t.organization_id IS NULL OR t.organization_id = :organization_id)`,
    { replacements: { id, organization_id }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}
```

Update the sole caller, `Servers/controllers/reportTemplate.ctrl.ts:33`:

```ts
    const version = await getLatestVersionQuery(tpl.id, req.organizationId!);
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd Servers && npx jest utils/__tests__/reportTemplate.utils.test.ts
```

Expected: PASS, all tests in the file.

- [ ] **Step 5: Verify no other caller broke**

```bash
cd Servers && grep -rn "getLatestVersionQuery\|getVersionByIdQuery" --include=*.ts . | grep -v node_modules | grep -v /dist/
```

Expected: definitions in `utils/reportTemplate.utils.ts`, the one call in `controllers/reportTemplate.ctrl.ts:33`, and the test file. Nothing else. If any other call site appears, it must be updated to pass `organization_id`.

- [ ] **Step 6: Build**

```bash
cd Servers && npm run build
```

Expected: exit 0, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add Servers/utils/reportTemplate.utils.ts Servers/controllers/reportTemplate.ctrl.ts Servers/utils/__tests__/reportTemplate.utils.test.ts
git commit -m "fix(reporting): org-scope the template version queries

report_template_versions has no organization_id of its own, so both
version queries now join report_templates to apply the tenant filter.
getVersionByIdQuery had no callers; Phase 3's scheduled-report ownership
check is about to become its first, so it is scoped before it is used.
System templates (organization_id IS NULL) remain readable by every org."
```

---

## Task 2: Section catalog + `GET /api/reporting/sections`

**Files:**
- Create: `Servers/services/reporting/sectionCatalog.ts`
- Create: `Servers/services/reporting/__tests__/sectionCatalog.test.ts`
- Modify: `Servers/services/reporting/index.ts:30-44`
- Modify: `Servers/controllers/reportTemplate.ctrl.ts`
- Modify: `Servers/routes/reporting.route.ts`

- [ ] **Step 1: Write the failing test**

Create `Servers/services/reporting/__tests__/sectionCatalog.test.ts`:

```ts
import {
  REPORT_SECTION_CATALOG,
  SECTION_KEYS,
} from "../sectionCatalog";

// The 13 literals VALID_SECTION_KEYS held before the catalog refactor.
// This is a behaviour pin: the refactor must not add or drop a key.
const LEGACY_VALID_SECTION_KEYS = [
  "projectRisks",
  "vendorRisks",
  "modelRisks",
  "compliance",
  "assessment",
  "clausesAndAnnexes",
  "nistSubcategories",
  "vendors",
  "models",
  "trainingRegistry",
  "policyManager",
  "incidentManagement",
  "all",
];

describe("sectionCatalog", () => {
  it("holds exactly the 12 real sections (the 'all' wildcard is not a section)", () => {
    expect(SECTION_KEYS).toHaveLength(12);
    expect(SECTION_KEYS).not.toContain("all");
  });

  it("plus the wildcard reproduces the legacy VALID_SECTION_KEYS set exactly", () => {
    expect(new Set([...SECTION_KEYS, "all"])).toEqual(
      new Set(LEGACY_VALID_SECTION_KEYS),
    );
  });

  it("gives every section a non-empty label and group", () => {
    for (const entry of REPORT_SECTION_CATALOG) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.group.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate keys", () => {
    expect(new Set(SECTION_KEYS).size).toBe(SECTION_KEYS.length);
  });

  // Guards the drift the spec calls out: the frontend's hardcoded list and the
  // backend catalog currently agree by luck. Keys are the contract; labels are
  // presentation and deliberately differ (design rules mandate sentence case).
  it("matches the frontend REPORT_SECTION_GROUPS backendKey set", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../../Clients/src/presentation/components/Reporting/GenerateReport/constants.ts",
      ),
      "utf8",
    );
    const backendKeys = [...src.matchAll(/backendKey:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(backendKeys.length).toBeGreaterThan(0);
    expect(new Set(backendKeys)).toEqual(new Set(SECTION_KEYS));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd Servers && npx jest services/reporting/__tests__/sectionCatalog.test.ts
```

Expected: FAIL with `Cannot find module '../sectionCatalog'`.

- [ ] **Step 3: Create the catalog**

Create `Servers/services/reporting/sectionCatalog.ts`:

```ts
/**
 * @fileoverview Report section catalog — the single owner of the report
 * section taxonomy.
 *
 * Before Phase 3 this list existed twice: as VALID_SECTION_KEYS here in the
 * backend and as REPORT_SECTION_GROUPS hardcoded in the frontend. The two
 * agreed by coincidence, nothing enforced it, and a frontend-hardcoded list
 * cannot describe org-authored templates. This module is now the source of
 * truth; VALID_SECTION_KEYS derives from it and GET /api/reporting/sections
 * serves it.
 *
 * Labels are sentence case per the VerifyWise design rules, which is why they
 * differ from the legacy frontend constants' title case. Keys are the
 * contract; labels are presentation.
 *
 * @module services/reporting/sectionCatalog
 */

export interface ReportSectionCatalogEntry {
  /** Canonical section key. Matches sections_config[].reportSectionKey. */
  key: string;
  /** Human-readable label, sentence case. */
  label: string;
  /** Grouping label for UI presentation. */
  group: string;
}

export const REPORT_SECTION_CATALOG: ReportSectionCatalogEntry[] = [
  { key: "projectRisks", label: "Use case risks", group: "Risk analysis" },
  { key: "vendorRisks", label: "Vendor risks", group: "Risk analysis" },
  { key: "modelRisks", label: "Model risks", group: "Risk analysis" },
  { key: "compliance", label: "Requirements", group: "Compliance and governance" },
  { key: "assessment", label: "Assessment tracker", group: "Compliance and governance" },
  { key: "clausesAndAnnexes", label: "Clauses and annexes", group: "Compliance and governance" },
  { key: "nistSubcategories", label: "NIST subcategories", group: "Compliance and governance" },
  { key: "models", label: "AI models", group: "Organization" },
  { key: "vendors", label: "Vendors", group: "Organization" },
  { key: "trainingRegistry", label: "Training registry", group: "Organization" },
  { key: "policyManager", label: "Policy manager", group: "Organization" },
  { key: "incidentManagement", label: "Incident management", group: "Organization" },
];

export const SECTION_KEYS: string[] = REPORT_SECTION_CATALOG.map((s) => s.key);
```

- [ ] **Step 4: Derive `VALID_SECTION_KEYS` from the catalog**

In `Servers/services/reporting/index.ts`, replace the literal set at lines 30-44 with:

```ts
/**
 * Valid section keys that can be passed directly from the frontend.
 * Derived from the section catalog plus the "all" wildcard sentinel, which is
 * not a section. See services/reporting/sectionCatalog.ts.
 */
const VALID_SECTION_KEYS = new Set([...SECTION_KEYS, "all"]);
```

Add the import alongside the existing imports at the top of the file:

```ts
import { SECTION_KEYS } from "./sectionCatalog";
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd Servers && npx jest services/reporting/__tests__/sectionCatalog.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Add the controller handler**

Append to `Servers/controllers/reportTemplate.ctrl.ts`:

```ts
export async function listSections(_req: Request, res: Response): Promise<any> {
  // Static catalog, no tenant data — no org scoping needed, but the route
  // still requires a valid JWT like every other reporting read.
  return res.status(200).json(STATUS_CODE[200](REPORT_SECTION_CATALOG));
}
```

Add to that file's imports:

```ts
import { REPORT_SECTION_CATALOG } from "../services/reporting/sectionCatalog";
```

- [ ] **Step 7: Add the route**

In `Servers/routes/reporting.route.ts`, add the section route. It must be registered **before** any `/:id` route in the same file so the literal path is not captured as an id parameter:

```ts
router.get("/sections", authenticateJWT, listSections);
```

Add to that file's imports:

```ts
import { listSections } from "../controllers/reportTemplate.ctrl";
```

- [ ] **Step 8: Verify the mount path resolves**

`app.ts:251-254` mounts in this order:

```
/api/reporting/templates        → reportTemplateRoutes
/api/reporting/scheduled-reports → scheduledReportRoutes
/api/reporting/runs             → reportRunRoutes
/api/reporting                  → reportRoutes
```

`/api/reporting/sections` matches none of the three specific prefixes, so it falls through to `reportRoutes`. Confirm no conflicting route shadows it:

```bash
cd Servers && grep -n "router\." routes/reporting.route.ts
```

Expected: the only `GET` routes are `/sections`, `/generate-report`, and nothing matching `GET /:id`. If a `GET /:id` exists, `/sections` must be declared above it.

- [ ] **Step 9: Full reporting suite**

```bash
cd Servers && npx jest services/reporting utils/__tests__/reportTemplate.utils.test.ts
```

Expected: all pass. The catalog refactor must not change any existing `generateReport` behaviour.

- [ ] **Step 10: Build and commit**

```bash
cd Servers && npm run build
```

```bash
git add Servers/services/reporting/sectionCatalog.ts Servers/services/reporting/__tests__/sectionCatalog.test.ts Servers/services/reporting/index.ts Servers/controllers/reportTemplate.ctrl.ts Servers/routes/reporting.route.ts
git commit -m "feat(reporting): serve the section catalog from one owner

The section taxonomy lived twice — VALID_SECTION_KEYS in the backend and
REPORT_SECTION_GROUPS hardcoded in the frontend — agreeing by coincidence
with nothing enforcing it. sectionCatalog.ts is now the source of truth,
VALID_SECTION_KEYS derives from it, and GET /api/reporting/sections
serves it. A test pins the derived set against the previous 13 literals
so the refactor is provably behaviour-preserving, and a second pins the
frontend's backendKey set so future drift fails rather than ships."
```

---

## Task 3: Template CRUD queries + slug unique index

**Files:**
- Create: `Servers/database/migrations/<stamp>-report-template-slug-unique.js`
- Modify: `Servers/utils/reportTemplate.utils.ts`
- Test: `Servers/utils/__tests__/reportTemplate.utils.test.ts`

- [ ] **Step 1: Generate the migration timestamp**

```bash
date +%Y%m%d%H%M%S
```

Use that value as `<stamp>`. It **must** sort after `20260719234948` (the Phase 2 migration, currently the newest). Verify:

```bash
cd Servers && ls database/migrations/ | sort | tail -3
```

- [ ] **Step 2: Write the migration**

Create `Servers/database/migrations/<stamp>-report-template-slug-unique.js`:

```javascript
"use strict";

/**
 * report_templates.slug has no uniqueness guard. Harmless while every
 * template is a system template inserted by an idempotent seed; a real
 * problem the moment orgs can create their own, because two custom
 * templates in one org could collide silently.
 *
 * COALESCE(organization_id, 0) rather than a plain (organization_id, slug)
 * index: system templates carry organization_id IS NULL, and NULLs never
 * compare equal in a unique index, so a plain index would leave them
 * unconstrained.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_report_templates_org_slug
        ON verifywise.report_templates (COALESCE(organization_id, 0), slug);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.uq_report_templates_org_slug;
    `);
  },
};
```

- [ ] **Step 3: Run the migration round-trip**

```bash
cd Servers && npm run build && npx sequelize db:migrate
```

Expected: the new migration runs, exit 0. If it fails with a duplicate-key error, the database has pre-existing colliding slugs — stop and report; do not add `ON CONFLICT`-style workarounds to a uniqueness migration.

```bash
cd Servers && npx sequelize db:migrate:undo && npx sequelize db:migrate
```

Expected: both succeed. The index drops and recreates cleanly.

- [ ] **Step 4: Write the failing tests**

Append to `Servers/utils/__tests__/reportTemplate.utils.test.ts`:

```ts
  it("createTemplateQuery inserts org-scoped, non-system, with a derived slug", async () => {
    q.mockResolvedValueOnce([{ id: 7, slug: "quarterly-board-pack" }]);
    const row = await createTemplateQuery(
      { name: "Quarterly board pack", category: "governance", default_scope: "organization" },
      42,
      9,
    );
    expect(row.id).toBe(7);
    const [sql, opts] = q.mock.calls[0];
    expect(opts.replacements.organization_id).toBe(42);
    expect(opts.replacements.created_by).toBe(9);
    expect(opts.replacements.slug).toBe("quarterly-board-pack");
    // is_system_template is a SQL literal, never a replacement — so a caller
    // cannot set it. Assert the literal, not a bare "false", which would also
    // match half a dozen unrelated substrings.
    expect(sql).toMatch(/is_system_template[\s\S]*VALUES[\s\S]*false/);
    expect(opts.replacements).not.toHaveProperty("is_system_template");
  });

  it("createTemplateQuery ignores a caller-supplied is_system_template", async () => {
    q.mockResolvedValueOnce([{ id: 8 }]);
    await createTemplateQuery(
      { name: "Sneaky", category: "governance", default_scope: "project", is_system_template: true },
      42,
      9,
    );
    const [, opts] = q.mock.calls[0];
    expect(opts.replacements.is_system_template).toBeUndefined();
  });

  it("updateTemplateQuery refuses system templates in the WHERE clause", async () => {
    q.mockResolvedValueOnce([[{ id: 7 }], 1]);
    await updateTemplateQuery(7, 42, { name: "Renamed" });
    const [sql, opts] = q.mock.calls[0];
    expect(opts.replacements.organization_id).toBe(42);
    expect(sql).toContain("is_system_template = false");
    // Not "organization_id IS NULL OR ..." — writes never match a system row.
    expect(sql).not.toContain("organization_id IS NULL");
  });

  it("archiveTemplateQuery soft-deletes via is_active", async () => {
    q.mockResolvedValueOnce([[{ id: 7 }], 1]);
    await archiveTemplateQuery(7, 42);
    const [sql, opts] = q.mock.calls[0];
    expect(sql).toContain("is_active = false");
    expect(sql).not.toContain("DELETE");
    expect(sql).toContain("is_system_template = false");
    expect(opts.replacements.organization_id).toBe(42);
  });

  it("createTemplateVersionQuery appends at MAX(version) + 1", async () => {
    q.mockResolvedValueOnce([{ id: 30, version: 4 }]);
    const v = await createTemplateVersionQuery(7, 42, { sections_config: { sections: [] } }, 9);
    expect(v.version).toBe(4);
    const [sql, opts] = q.mock.calls[0];
    expect(sql).toContain("COALESCE(MAX(version), 0) + 1");
    expect(opts.replacements.template_id).toBe(7);
    expect(opts.replacements.organization_id).toBe(42);
  });

  it("slugify collapses punctuation and trims separators", () => {
    expect(slugify("Quarterly Board Pack!")).toBe("quarterly-board-pack");
    expect(slugify("  --Weird__Name--  ")).toBe("weird-name");
    expect(slugify("!!!")).toBe("template");
  });
```

Extend the import list at the top of the file:

```ts
import {
  getTemplatesQuery,
  getLatestVersionQuery,
  getVersionByIdQuery,
  createTemplateQuery,
  updateTemplateQuery,
  archiveTemplateQuery,
  createTemplateVersionQuery,
  slugify,
} from "../reportTemplate.utils";
```

- [ ] **Step 5: Run the tests to verify they fail**

```bash
cd Servers && npx jest utils/__tests__/reportTemplate.utils.test.ts
```

Expected: FAIL — `createTemplateQuery is not a function`.

- [ ] **Step 6: Implement the queries**

Append to `Servers/utils/reportTemplate.utils.ts`:

```ts
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

/** Derive a URL-safe slug from a template name. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 200) || "template"
  );
}

// Custom templates are always org-owned and never system templates: the
// literal false is in the SQL rather than the replacements so a caller cannot
// promote its own template by sending is_system_template: true.
export async function createTemplateQuery(
  input: any,
  organization_id: number,
  userId: number,
): Promise<any> {
  if (!input?.name) throw new ValidationException("name is required", "name", input?.name);
  if (!input?.category) throw new ValidationException("category is required", "category", input?.category);
  if (input.default_scope !== "project" && input.default_scope !== "organization") {
    throw new ValidationException(
      "default_scope must be 'project' or 'organization'",
      "default_scope",
      input.default_scope,
    );
  }
  const rows: any = await sequelize.query(
    `INSERT INTO report_templates
       (organization_id, name, slug, description, category, default_scope,
        supported_scopes, recommended_frequency, is_system_template, is_active, created_by)
     VALUES (:organization_id, :name, :slug, :description, :category, :default_scope,
        :supported_scopes, :recommended_frequency, false, true, :created_by)
     RETURNING *`,
    {
      replacements: {
        organization_id,
        name: input.name,
        slug: slugify(input.name),
        description: input.description ?? null,
        category: input.category,
        default_scope: input.default_scope,
        supported_scopes: JSON.stringify(
          input.supported_scopes ?? ["project", "organization"],
        ),
        recommended_frequency: input.recommended_frequency ?? null,
        created_by: userId,
      },
      type: QueryTypes.SELECT,
    },
  );
  return rows[0];
}

// Metadata only. Config changes go through createTemplateVersionQuery because
// report_template_versions is append-only (unique on template_id, version).
//
// The WHERE clause is the whole access control: organization_id = :org (not
// "IS NULL OR", which would match system templates) plus
// is_system_template = false. A system template matches zero rows.
export async function updateTemplateQuery(
  id: number,
  organization_id: number,
  input: any,
): Promise<any> {
  const allowed = [
    "name",
    "description",
    "category",
    "recommended_frequency",
    "is_active",
  ];
  const sets: string[] = [];
  const replacements: any = { id, organization_id };
  for (const field of allowed) {
    if (input[field] !== undefined) {
      sets.push(`${field} = :${field}`);
      replacements[field] = input[field];
    }
  }
  if (input.name !== undefined) {
    sets.push("slug = :slug");
    replacements.slug = slugify(input.name);
  }
  if (!sets.length) {
    throw new ValidationException("no updatable fields supplied", "body", input);
  }
  sets.push("updated_at = NOW()");
  const result: any = await sequelize.query(
    `UPDATE report_templates SET ${sets.join(", ")}
      WHERE id = :id
        AND organization_id = :organization_id
        AND is_system_template = false
      RETURNING *`,
    { replacements, type: QueryTypes.UPDATE },
  );
  return result[0]?.[0] ?? null;
}

// Soft delete. scheduled_reports.template_id is a NOT NULL FK with no
// ON DELETE clause, so a hard DELETE of a referenced template fails at the
// database. is_active = false already hides it from getTemplatesQuery.
export async function archiveTemplateQuery(
  id: number,
  organization_id: number,
): Promise<any> {
  const result: any = await sequelize.query(
    `UPDATE report_templates SET is_active = false, updated_at = NOW()
      WHERE id = :id
        AND organization_id = :organization_id
        AND is_system_template = false
      RETURNING *`,
    { replacements: { id, organization_id }, type: QueryTypes.UPDATE },
  );
  return result[0]?.[0] ?? null;
}

// Append-only: the version number is computed inside the INSERT so two
// concurrent writers cannot both read the same MAX and collide. The unique
// index on (template_id, version) is the backstop if they race anyway.
//
// The SELECT ... WHERE EXISTS is the tenant guard: a template id belonging to
// another org inserts zero rows and returns undefined.
export async function createTemplateVersionQuery(
  template_id: number,
  organization_id: number,
  config: any,
  userId: number,
): Promise<any> {
  const rows: any = await sequelize.query(
    `INSERT INTO report_template_versions
       (template_id, version, sections_config, ai_blocks_config, format_config,
        branding_config, schedule_defaults, delivery_defaults, created_by)
     SELECT :template_id,
            (SELECT COALESCE(MAX(version), 0) + 1
               FROM report_template_versions WHERE template_id = :template_id),
            :sections_config, :ai_blocks_config, :format_config,
            :branding_config, :schedule_defaults, :delivery_defaults, :created_by
      WHERE EXISTS (
        SELECT 1 FROM report_templates
         WHERE id = :template_id
           AND organization_id = :organization_id
           AND is_system_template = false
      )
     RETURNING *`,
    {
      replacements: {
        template_id,
        organization_id,
        sections_config: JSON.stringify(config.sections_config ?? { sections: [] }),
        ai_blocks_config: JSON.stringify(config.ai_blocks_config ?? {}),
        format_config: JSON.stringify(config.format_config ?? {}),
        branding_config: JSON.stringify(config.branding_config ?? {}),
        schedule_defaults: JSON.stringify(config.schedule_defaults ?? {}),
        delivery_defaults: JSON.stringify(config.delivery_defaults ?? {}),
        created_by: userId,
      },
      type: QueryTypes.SELECT,
    },
  );
  return rows[0];
}
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd Servers && npx jest utils/__tests__/reportTemplate.utils.test.ts
```

Expected: PASS, all tests.

- [ ] **Step 8: Build and commit**

```bash
cd Servers && npm run build
```

```bash
git add Servers/utils/reportTemplate.utils.ts Servers/utils/__tests__/reportTemplate.utils.test.ts "Servers/database/migrations/<stamp>-report-template-slug-unique.js"
git commit -m "feat(reporting): template create/update/archive queries

Custom templates are org-owned and never system templates: the literal
false sits in the SQL, not the replacements, so a caller cannot promote
its own template. Writes match on organization_id = :org AND
is_system_template = false rather than the reads' 'IS NULL OR' form, so
a system template matches zero rows without an if-statement to forget.

DELETE is a soft delete because scheduled_reports.template_id is a NOT
NULL FK with no ON DELETE clause — a hard delete of a referenced
template fails at the database. Versions are append-only with the
version number computed inside the INSERT.

Adds the missing slug uniqueness guard, keyed on COALESCE(org_id, 0)
because NULLs never compare equal and system templates have none."
```

---

## Task 4: Template CRUD controller + routes

**Files:**
- Modify: `Servers/controllers/reportTemplate.ctrl.ts`
- Modify: `Servers/routes/reportTemplate.route.ts`
- Create: `Servers/controllers/__tests__/reportTemplate.ctrl.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `Servers/controllers/__tests__/reportTemplate.ctrl.test.ts`:

```ts
jest.mock("../../utils/reportTemplate.utils", () => ({
  getTemplatesQuery: jest.fn(),
  getTemplateByIdQuery: jest.fn(),
  getLatestVersionQuery: jest.fn(),
  createTemplateQuery: jest.fn(),
  updateTemplateQuery: jest.fn(),
  archiveTemplateQuery: jest.fn(),
  createTemplateVersionQuery: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));

import {
  createTemplate,
  updateTemplate,
  archiveTemplate,
  listSections,
} from "../reportTemplate.ctrl";
import {
  createTemplateQuery,
  updateTemplateQuery,
  archiveTemplateQuery,
  createTemplateVersionQuery,
} from "../../utils/reportTemplate.utils";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

function mockRes() {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
}
const mockReq = (over: any = {}) => ({
  organizationId: 42,
  userId: 9,
  params: {},
  body: {},
  t: (s: string) => s,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe("createTemplate", () => {
  it("201s and persists an initial version when config is supplied", async () => {
    (createTemplateQuery as jest.Mock).mockResolvedValue({ id: 7, name: "Board pack" });
    (createTemplateVersionQuery as jest.Mock).mockResolvedValue({ id: 30, version: 1 });
    const res = mockRes();
    await createTemplate(
      mockReq({ body: { name: "Board pack", category: "governance", default_scope: "organization", sections_config: { sections: [] } } }) as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(createTemplateQuery).toHaveBeenCalledWith(expect.any(Object), 42, 9);
    expect(createTemplateVersionQuery).toHaveBeenCalledWith(7, 42, expect.any(Object), 9);
  });

  it("maps a ValidationException to 400, not 500", async () => {
    (createTemplateQuery as jest.Mock).mockRejectedValue(
      new ValidationException("name is required", "name", undefined),
    );
    const res = mockRes();
    await createTemplate(mockReq({ body: {} }) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("maps a unique-violation to 409", async () => {
    const dup: any = new Error("duplicate key value violates unique constraint");
    dup.parent = { code: "23505" };
    (createTemplateQuery as jest.Mock).mockRejectedValue(dup);
    const res = mockRes();
    await createTemplate(
      mockReq({ body: { name: "Board pack", category: "governance", default_scope: "project" } }) as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe("updateTemplate", () => {
  it("404s when the row does not match the org (or is a system template)", async () => {
    (updateTemplateQuery as jest.Mock).mockResolvedValue(null);
    const res = mockRes();
    await updateTemplate(mockReq({ params: { id: "1" }, body: { name: "x" } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("appends a new version when config fields change", async () => {
    (updateTemplateQuery as jest.Mock).mockResolvedValue({ id: 7 });
    (createTemplateVersionQuery as jest.Mock).mockResolvedValue({ id: 31, version: 2 });
    const res = mockRes();
    await updateTemplate(
      mockReq({ params: { id: "7" }, body: { ai_blocks_config: { executiveSummary: true } } }) as any,
      res,
    );
    expect(createTemplateVersionQuery).toHaveBeenCalledWith(7, 42, expect.any(Object), 9);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("does not append a version for a metadata-only change", async () => {
    (updateTemplateQuery as jest.Mock).mockResolvedValue({ id: 7 });
    const res = mockRes();
    await updateTemplate(mockReq({ params: { id: "7" }, body: { name: "Renamed" } }) as any, res);
    expect(createTemplateVersionQuery).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("archiveTemplate", () => {
  it("404s when nothing matched", async () => {
    (archiveTemplateQuery as jest.Mock).mockResolvedValue(null);
    const res = mockRes();
    await archiveTemplate(mockReq({ params: { id: "1" } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("200s on success", async () => {
    (archiveTemplateQuery as jest.Mock).mockResolvedValue({ id: 7, is_active: false });
    const res = mockRes();
    await archiveTemplate(mockReq({ params: { id: "7" } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("listSections", () => {
  it("returns the 12-entry catalog", async () => {
    const res = mockRes();
    await listSections(mockReq() as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.data).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Servers && npx jest controllers/__tests__/reportTemplate.ctrl.test.ts
```

Expected: FAIL — `createTemplate is not a function`.

- [ ] **Step 3: Implement the handlers**

Append to `Servers/controllers/reportTemplate.ctrl.ts`:

```ts
const FILE_NAME = "reportTemplate.ctrl.ts";

// Config fields live on the version row, not the template row. Any of these in
// a PATCH body means "append a new version"; see the append-only note in
// reportTemplate.utils.ts.
const VERSION_CONFIG_FIELDS = [
  "sections_config",
  "ai_blocks_config",
  "format_config",
  "branding_config",
  "schedule_defaults",
  "delivery_defaults",
];

const hasVersionConfig = (body: any): boolean =>
  VERSION_CONFIG_FIELDS.some((f) => body?.[f] !== undefined);

// Maps CustomException subclasses to their status, mirroring
// customField.ctrl.ts. A Postgres unique violation (23505) becomes 409 —
// the slug index is the only unique constraint a caller can trip.
const respondWithError = (req: Request, res: Response, error: unknown): Response => {
  const pgCode = (error as any)?.parent?.code ?? (error as any)?.original?.code;
  if (pgCode === "23505") {
    return res
      .status(409)
      .json(STATUS_CODE[409]("a template with this name already exists"));
  }
  const statusCode =
    error instanceof Error && "statusCode" in error
      ? (error as Error & { statusCode: number }).statusCode
      : 500;
  const statusFn = (STATUS_CODE as any)[statusCode];
  if (typeof statusFn === "function") {
    return res.status(statusCode).json(statusFn((error as Error).message));
  }
  return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
};

export async function createTemplate(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "createTemplate",
    functionName: "createTemplate",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const tpl = await createTemplateQuery(req.body, req.organizationId!, req.userId!);
    // A template with no version is unusable — the wizard reads
    // latestVersion.sections_config. Always seed version 1.
    const version = await createTemplateVersionQuery(
      tpl.id,
      req.organizationId!,
      req.body,
      req.userId!,
    );
    await logSuccess({
      eventType: "Create",
      description: `Created report template ${tpl.id}`,
      functionName: "createTemplate",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201]({ ...tpl, latestVersion: version }));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "createTemplate failed",
      functionName: "createTemplate",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function updateTemplate(req: Request, res: Response): Promise<any> {
  const id = Number(req.params.id);
  logProcessing({
    description: `updateTemplate ${id}`,
    functionName: "updateTemplate",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const metadataChanged = ["name", "description", "category", "recommended_frequency", "is_active"]
      .some((f) => req.body?.[f] !== undefined);

    let tpl: any = null;
    if (metadataChanged) {
      tpl = await updateTemplateQuery(id, req.organizationId!, req.body);
      if (!tpl) return res.status(404).json(STATUS_CODE[404]("not found"));
    }

    let version: any = null;
    if (hasVersionConfig(req.body)) {
      version = await createTemplateVersionQuery(id, req.organizationId!, req.body, req.userId!);
      // createTemplateVersionQuery returns undefined when its WHERE EXISTS
      // tenant guard matched nothing — treat that as a failed write, never
      // as a success with a null body.
      if (!version) return res.status(404).json(STATUS_CODE[404]("not found"));
    }

    if (!metadataChanged && !version) {
      return res.status(400).json(STATUS_CODE[400]("no updatable fields supplied"));
    }

    await logSuccess({
      eventType: "Update",
      description: `Updated report template ${id}`,
      functionName: "updateTemplate",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ ...(tpl ?? { id }), latestVersion: version }));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "updateTemplate failed",
      functionName: "updateTemplate",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function archiveTemplate(req: Request, res: Response): Promise<any> {
  const id = Number(req.params.id);
  logProcessing({
    description: `archiveTemplate ${id}`,
    functionName: "archiveTemplate",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const row = await archiveTemplateQuery(id, req.organizationId!);
    if (!row) return res.status(404).json(STATUS_CODE[404]("not found"));
    await logSuccess({
      eventType: "Delete",
      description: `Archived report template ${id}`,
      functionName: "archiveTemplate",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ ok: true }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "archiveTemplate failed",
      functionName: "archiveTemplate",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}
```

Extend the file's imports:

```ts
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import { translateError } from "../utils/i18n.utils";
import {
  getTemplatesQuery,
  getTemplateByIdQuery,
  getLatestVersionQuery,
  createTemplateQuery,
  updateTemplateQuery,
  archiveTemplateQuery,
  createTemplateVersionQuery,
} from "../utils/reportTemplate.utils";
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd Servers && npx jest controllers/__tests__/reportTemplate.ctrl.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Add the routes**

Replace `Servers/routes/reportTemplate.route.ts` with:

```ts
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
// accessControl.middleware exports authorize as its DEFAULT export
// (accessControl.middleware.ts:79), matching scheduledReport.route.ts:3.
// A named import here compiles under ts-jest (diagnostics: false) and then
// fails at runtime with "authorize is not a function".
import authorize from "../middleware/accessControl.middleware";
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  archiveTemplate,
} from "../controllers/reportTemplate.ctrl";

const router = express.Router();

router.get("/", authenticateJWT, listTemplates);
router.get("/:id", authenticateJWT, getTemplate);

// Write RBAC matches the scheduled_reports write routes rather than the
// stricter Admin-only generate route: custom templates are org-shared content,
// not a privileged operation. System templates are read-only for everyone,
// enforced in the query WHERE clause rather than here.
router.post("/", authenticateJWT, authorize(["Admin", "Editor"]), createTemplate);
router.patch("/:id", authenticateJWT, authorize(["Admin", "Editor"]), updateTemplate);
router.delete("/:id", authenticateJWT, authorize(["Admin", "Editor"]), archiveTemplate);

export default router;
```

- [ ] **Step 6: Confirm the `authorize` import resolves at runtime**

```bash
cd Servers && grep -n "import.*authorize" routes/scheduledReport.route.ts && grep -n "export default authorize" middleware/accessControl.middleware.ts
```

Expected: `import authorize from "../middleware/accessControl.middleware";` and `export default authorize;`. It is a **default** export. ts-jest runs with `diagnostics: false`, so a named import would compile silently and only fail when a request hits the route — verify by hand, do not assume the type checker will catch it.

- [ ] **Step 7: Full backend unit suite**

```bash
cd Servers && npx jest controllers/__tests__ utils/__tests__ services/reporting
```

Expected: all pass.

- [ ] **Step 8: Build and commit**

```bash
cd Servers && npm run build
```

```bash
git add Servers/controllers/reportTemplate.ctrl.ts Servers/routes/reportTemplate.route.ts Servers/controllers/__tests__/reportTemplate.ctrl.test.ts
git commit -m "feat(reporting): template CRUD endpoints

POST/PATCH/DELETE gated by authorize(['Admin','Editor']), matching the
scheduled_reports write RBAC. PATCH splits by field: metadata updates in
place, config appends a new version, because report_template_versions is
unique on (template_id, version) and meant to be immutable.

DELETE archives via is_active. A unique-violation on the slug index maps
to 409 rather than a generic 500."
```

---

## Task 5: Validate `templateVersionId` ownership on scheduled-report create

**Files:**
- Modify: `Servers/services/reporting/scheduledReportService.ts`
- Modify: `Servers/controllers/scheduledReport.ctrl.ts:35`
- Create: `Servers/services/reporting/__tests__/templateVersionOwnership.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `Servers/services/reporting/__tests__/templateVersionOwnership.test.ts`:

```ts
jest.mock("../../../utils/reportTemplate.utils", () => ({
  getTemplateByIdQuery: jest.fn(),
  getVersionByIdQuery: jest.fn(),
}));

import { validateTemplateVersionOwnership } from "../scheduledReportService";
import {
  getTemplateByIdQuery,
  getVersionByIdQuery,
} from "../../../utils/reportTemplate.utils";

beforeEach(() => jest.clearAllMocks());

describe("validateTemplateVersionOwnership", () => {
  it("accepts a version that belongs to the template and the org", async () => {
    (getTemplateByIdQuery as jest.Mock).mockResolvedValue({ id: 7 });
    (getVersionByIdQuery as jest.Mock).mockResolvedValue({ id: 30, template_id: 7 });
    await expect(validateTemplateVersionOwnership(7, 30, 42)).resolves.toEqual([]);
    expect(getTemplateByIdQuery).toHaveBeenCalledWith(7, 42);
    expect(getVersionByIdQuery).toHaveBeenCalledWith(30, 42);
  });

  it("rejects a template belonging to another org", async () => {
    (getTemplateByIdQuery as jest.Mock).mockResolvedValue(null);
    const errs = await validateTemplateVersionOwnership(7, 30, 42);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/templateId/);
  });

  it("rejects a version belonging to another org", async () => {
    (getTemplateByIdQuery as jest.Mock).mockResolvedValue({ id: 7 });
    (getVersionByIdQuery as jest.Mock).mockResolvedValue(null);
    const errs = await validateTemplateVersionOwnership(7, 30, 42);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/templateVersionId/);
  });

  it("rejects a version that exists but belongs to a different template", async () => {
    (getTemplateByIdQuery as jest.Mock).mockResolvedValue({ id: 7 });
    (getVersionByIdQuery as jest.Mock).mockResolvedValue({ id: 30, template_id: 99 });
    const errs = await validateTemplateVersionOwnership(7, 30, 42);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/does not belong/);
  });

  it("rejects missing ids rather than querying with NaN", async () => {
    const errs = await validateTemplateVersionOwnership(
      undefined as any,
      undefined as any,
      42,
    );
    expect(errs).toHaveLength(1);
    expect(getTemplateByIdQuery).not.toHaveBeenCalled();
  });
});
```

Now extend `Servers/controllers/__tests__/scheduledReport.ctrl.test.ts`.

**First**, update its existing `scheduledReportService` mock (line 1) to include the new export. Without this the file's current "201 on success" test breaks with `validateTemplateVersionOwnership is not a function` the moment Step 4 wires it in:

```ts
jest.mock("../../services/reporting/scheduledReportService", () => ({
  validateScheduledReportInput: jest.fn(() => []),
  validateTemplateVersionOwnership: jest.fn(async () => []),
}));
```

**Then** append this test inside the existing `describe("createScheduledReport", ...)` block. It uses the file's own `require`-inside-the-test style, because the mocked query is never imported as a binding at the top of that file:

```ts
  it("400s when the template version is not owned by the caller's org", async () => {
    const svc = require("../../services/reporting/scheduledReportService");
    const utils = require("../../utils/scheduledReport.utils");
    svc.validateScheduledReportInput.mockReturnValueOnce([]);
    svc.validateTemplateVersionOwnership.mockResolvedValueOnce([
      "templateVersionId does not exist or is not accessible to this organization",
    ]);
    utils.createScheduledReportQuery.mockClear();

    const res = mockRes();
    await createScheduledReport(
      { organizationId: 42, userId: 9, body: { templateId: 7, templateVersionId: 30 } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    // The guard must be awaited: an un-awaited Promise reports .length as
    // undefined, which is falsy, so a dropped await would insert the row
    // anyway. Asserting the insert did NOT happen is what catches that.
    expect(utils.createScheduledReportQuery).not.toHaveBeenCalled();
  });

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Servers && npx jest services/reporting/__tests__/templateVersionOwnership.test.ts controllers/__tests__/scheduledReport.ctrl.test.ts
```

Expected: FAIL — `validateTemplateVersionOwnership is not a function`.

- [ ] **Step 3: Implement the validator**

Append to `Servers/services/reporting/scheduledReportService.ts`:

```ts
import {
  getTemplateByIdQuery,
  getVersionByIdQuery,
} from "../../utils/reportTemplate.utils";

/**
 * Confirm templateVersionId belongs to templateId and both are reachable from
 * this organization.
 *
 * createScheduledReportQuery takes both ids straight from the request body and
 * only a plain FK constraint stands behind them, which proves the row exists —
 * not that the caller may reference it. template_version_id is audit-only
 * today (reportRunOrchestrator passes it to createRunQuery and never reads
 * template content from it), so this closes a cross-org attribution gap rather
 * than a content-injection one.
 *
 * Async because it hits the database. It MUST be awaited: an un-awaited
 * Promise reports `.length` as undefined, which is falsy, so a dropped await
 * silently disables the check.
 */
export async function validateTemplateVersionOwnership(
  templateId: number,
  templateVersionId: number,
  organizationId: number,
): Promise<string[]> {
  if (!templateId || !templateVersionId) {
    return ["templateId and templateVersionId are required"];
  }
  const template = await getTemplateByIdQuery(templateId, organizationId);
  if (!template) {
    return ["templateId does not exist or is not accessible to this organization"];
  }
  const version = await getVersionByIdQuery(templateVersionId, organizationId);
  if (!version) {
    return ["templateVersionId does not exist or is not accessible to this organization"];
  }
  if (Number(version.template_id) !== Number(templateId)) {
    return ["templateVersionId does not belong to templateId"];
  }
  return [];
}
```

- [ ] **Step 4: Wire it into the controller**

In `Servers/controllers/scheduledReport.ctrl.ts`, replace line 35-36 with:

```ts
    const errors = [
      ...validateScheduledReportInput(req.body),
      // await is load-bearing: see validateTemplateVersionOwnership's note.
      ...(await validateTemplateVersionOwnership(
        req.body?.templateId,
        req.body?.templateVersionId,
        req.organizationId!,
      )),
    ];
    if (errors.length) return res.status(400).json(STATUS_CODE[400]({ errors }));
```

Extend that file's import:

```ts
import {
  validateScheduledReportInput,
  validateTemplateVersionOwnership,
} from "../services/reporting/scheduledReportService";
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd Servers && npx jest services/reporting/__tests__/templateVersionOwnership.test.ts controllers/__tests__/scheduledReport.ctrl.test.ts
```

Expected: PASS.

- [ ] **Step 6: Confirm the spread would throw on a dropped `await`**

The `...(await ...)` form is deliberately chosen over assigning to a variable: spreading a bare Promise throws `TypeError: Promise is not iterable`, so a dropped `await` fails loudly here rather than silently. Verify by temporarily removing the `await`, running the suite, confirming it errors, then restoring it.

```bash
cd Servers && npx jest controllers/__tests__/scheduledReport.ctrl.test.ts
```

- [ ] **Step 7: Build and commit**

```bash
cd Servers && npm run build
```

```bash
git add Servers/services/reporting/scheduledReportService.ts Servers/controllers/scheduledReport.ctrl.ts Servers/services/reporting/__tests__/templateVersionOwnership.test.ts Servers/controllers/__tests__/scheduledReport.ctrl.test.ts
git commit -m "fix(reporting): validate templateVersionId ownership on create

createScheduledReportQuery took templateId and templateVersionId straight
from the request body with only a plain FK behind them, which proves a
row exists but not that the caller may reference it. Any org could tag a
schedule with another org's template version.

The field is audit-only today — reportRunOrchestrator passes it to
createRunQuery and never reads template content from it — so this closes
a cross-org attribution gap, not a content-injection one.

The check is spread with ...(await ...) so a future dropped await throws
'Promise is not iterable' rather than silently reporting zero errors."
```

---

## Task 6: `GET /api/reporting/runs/:id/analyses`

Wires the read query Phase 2 wrote and never exposed.

**Files:**
- Modify: `Servers/controllers/reportRun.ctrl.ts`
- Modify: `Servers/routes/reportRun.route.ts`
- Test: `Servers/controllers/__tests__/reportRun.ctrl.test.ts`

- [ ] **Step 1: Extend the existing test file**

`Servers/controllers/__tests__/reportRun.ctrl.test.ts` **already exists** with its own `jest.mock` block, its own `STATUS_CODE` mock, and `createMockReq` / `createMockRes` helpers. Do **not** paste a second set of `jest.mock` calls for the same modules — extend what is there.

Add one new mock beside the existing ones (after the `fileUpload.utils` mock):

```ts
jest.mock("../../utils/reportRunAnalysis.utils", () => ({
  getRunAnalysesQuery: jest.fn(),
}));
```

Extend the existing import line and add the new binding:

```ts
import { getRun, downloadRun, getRunAnalyses } from "../reportRun.ctrl";
import { getRunAnalysesQuery } from "../../utils/reportRunAnalysis.utils";

const mockGetAnalyses = getRunAnalysesQuery as jest.MockedFunction<typeof getRunAnalysesQuery>;
```

Then append these tests **inside** the existing `describe("reportRun.ctrl tenant isolation", ...)` block, reusing its helpers. Note `createMockReq` sets `organizationId: 5`, not 42 — match the file:

```ts
  it("getRunAnalyses returns 404 and never queries analyses when the run is not in the caller's org", async () => {
    mockGetRun.mockResolvedValue(null as any);

    const req = createMockReq({ id: "77" });
    const res = createMockRes();

    await getRunAnalyses(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockGetAnalyses).not.toHaveBeenCalled();
  });

  it("getRunAnalyses scopes both the run and the analyses by the authed organizationId", async () => {
    mockGetRun.mockResolvedValue({ id: 77, organization_id: 5 } as any);
    mockGetAnalyses.mockResolvedValue([
      { section_key: "executiveSummary", payload: { summary: "x" } },
    ] as any);

    const req = createMockReq({ id: "77" });
    const res = createMockRes();

    await getRunAnalyses(req as Request, res as Response);

    expect(mockGetRun).toHaveBeenCalledWith(77, 5);
    expect(mockGetAnalyses).toHaveBeenCalledWith(77, 5);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("getRunAnalyses returns an empty array for a run with no analyses", async () => {
    mockGetRun.mockResolvedValue({ id: 77, organization_id: 5 } as any);
    mockGetAnalyses.mockResolvedValue([] as any);

    const req = createMockReq({ id: "77" });
    const res = createMockRes();

    await getRunAnalyses(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd Servers && npx jest controllers/__tests__/reportRun.ctrl.test.ts
```

Expected: FAIL — `getRunAnalyses is not a function`.

- [ ] **Step 3: Implement**

Append to `Servers/controllers/reportRun.ctrl.ts`:

```ts
// Doubly org-scoped, matching downloadRun: the run row is fetched org-scoped
// first (404 on miss), and getRunAnalysesQuery filters on organization_id
// again. A run id from another org can never yield analysis rows.
export async function getRunAnalyses(req: Request, res: Response): Promise<any> {
  try {
    const id = Number(req.params.id);
    const run = await getRunQuery(id, req.organizationId!);
    if (!run) return res.status(404).json(STATUS_CODE[404]("not found"));
    const analyses = await getRunAnalysesQuery(id, req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](analyses));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}
```

Add the import:

```ts
import { getRunAnalysesQuery } from "../utils/reportRunAnalysis.utils";
```

- [ ] **Step 4: Add the route**

In `Servers/routes/reportRun.route.ts`, add after the download route:

```ts
router.get("/:id/analyses", authenticateJWT, getRunAnalyses);
```

and extend the import:

```ts
import { listRuns, getRun, downloadRun, getRunAnalyses } from "../controllers/reportRun.ctrl";
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd Servers && npx jest controllers/__tests__/reportRun.ctrl.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Build and commit**

```bash
cd Servers && npm run build
```

```bash
git add Servers/controllers/reportRun.ctrl.ts Servers/routes/reportRun.route.ts Servers/controllers/__tests__/reportRun.ctrl.test.ts
git commit -m "feat(reporting): expose per-run AI analyses

getRunAnalysesQuery was written in Phase 2 and never wired to a route.
The endpoint is doubly org-scoped like downloadRun: the run is fetched
org-scoped first, then the analyses query filters on organization_id
again, so a run id from another org yields nothing at either step."
```

---

## Task 7: Pin the analyzer payload shapes

The frontend must hand-mirror the analyzer output types — there is no shared-types package between `Servers/` and `Clients/`. `EvidenceAnalysisPanel` is the cautionary case: it declares `rationales` and `document_signals`, **neither of which any backend code has ever produced**, so one renders permanently empty and the other gates ~85 lines of unreachable UI. This task makes the same drift fail a test.

**Files:**
- Create: `Servers/services/reporting/analyzers/__tests__/payloadShape.test.ts`

- [ ] **Step 1: Write the test**

Create `Servers/services/reporting/analyzers/__tests__/payloadShape.test.ts`:

```ts
import {
  executiveSummarySchema,
  keyFindingsSchema,
  recommendedActionsSchema,
  riskAnalysisSchema,
  complianceGapSchema,
  vendorRiskSchema,
} from "../schemas";

/**
 * The frontend hand-mirrors these shapes in
 * Clients/src/domain/interfaces/i.reporting.ts because there is no shared
 * types package across the Servers/Clients boundary.
 *
 * If this test fails, the analyzer payload changed and that file must change
 * with it. EvidenceAnalysisPanel is what happens when it does not: it declares
 * `rationales` and `document_signals`, neither of which the backend has ever
 * produced, so one renders empty forever and the other gates dead UI.
 */
const EXPECTED_TOP_LEVEL_KEYS: Record<string, string[]> = {
  executiveSummary: ["summary", "abstain_reason"],
  keyFindings: ["findings", "abstain_reason"],
  recommendedActions: ["actions", "abstain_reason"],
  riskAnalysis: ["narrative", "top_risks", "abstain_reason"],
  complianceGap: ["narrative", "gaps", "scores_caveat", "abstain_reason"],
  vendorRisk: ["narrative", "concerns", "abstain_reason"],
};

const SCHEMAS: Record<string, any> = {
  executiveSummary: executiveSummarySchema,
  keyFindings: keyFindingsSchema,
  recommendedActions: recommendedActionsSchema,
  riskAnalysis: riskAnalysisSchema,
  complianceGap: complianceGapSchema,
  vendorRisk: vendorRiskSchema,
};

describe("analyzer payload shapes (frontend type contract)", () => {
  for (const [name, expected] of Object.entries(EXPECTED_TOP_LEVEL_KEYS)) {
    it(`${name} exposes exactly ${expected.join(", ")}`, () => {
      expect(Object.keys(SCHEMAS[name].shape).sort()).toEqual([...expected].sort());
    });
  }
});
```

- [ ] **Step 2: Run the test**

```bash
cd Servers && npx jest services/reporting/analyzers/__tests__/payloadShape.test.ts
```

Expected: PASS, 6 tests. This test passes on first write — it pins existing behaviour rather than driving new code, which is the point.

If any assertion fails, the recorded shape in this plan is wrong: **fix the test to match the real schema**, and carry the correction into Task 9's frontend types.

- [ ] **Step 3: Commit**

```bash
git add Servers/services/reporting/analyzers/__tests__/payloadShape.test.ts
git commit -m "test(reporting): pin analyzer payload shapes for the frontend contract

The frontend hand-mirrors these types because there is no shared package
across the Servers/Clients boundary. EvidenceAnalysisPanel shows the cost
of unpinned drift: it declares two fields the backend has never produced,
so one renders empty forever and the other gates unreachable UI."
```

---

## Task 8: Regenerate API docs and correct the false CI claim

**Files:**
- Modify: `Servers/swagger.yaml` (generated)
- Modify: `docs/api-docs/src/config/endpoints.ts` (generated)
- Modify: `Servers/CLAUDE.md:180-190`

- [ ] **Step 1: Record the pre-change endpoint count**

```bash
cd Servers && grep -c "path:" ../docs/api-docs/src/config/endpoints.ts
```

Note the number. Phase 3 adds exactly **five** routes: `GET /sections`, `POST /templates`, `PATCH /templates/:id`, `DELETE /templates/:id`, `GET /runs/:id/analyses`.

- [ ] **Step 2: Regenerate**

```bash
cd Servers && npm run generate:swagger && npm run generate:endpoints
```

- [ ] **Step 3: Check for drift**

```bash
cd Servers && npm run check:api-drift
```

Expected: exit 0, no drift reported.

- [ ] **Step 4: Verify the count moved by exactly five**

```bash
cd Servers && grep -c "path:" ../docs/api-docs/src/config/endpoints.ts
```

Expected: the Step 1 number **+ 5**. A different delta means a route was added or lost unintentionally — investigate before committing.

- [ ] **Step 5: Correct the false CI claim**

`Servers/CLAUDE.md` currently ends its API documentation section with:

```markdown
### CI enforcement

The `api-docs-drift` CI job regenerates the spec and registry, runs
`npm run check:api-drift`, and fails if the committed generated files are out of
sync with the route layer.
```

No such job exists. Verify:

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler && grep -rn "api-drift\|generate:swagger\|generate:endpoints" .github/workflows/ || echo "CONFIRMED: no CI job runs API drift"
```

Expected: `CONFIRMED: no CI job runs API drift`.

Replace that section with:

```markdown
### CI enforcement

**There is no `api-docs-drift` CI job today.** `npm run check:api-drift` exists
and works, but no workflow in `.github/workflows/` runs it, so a missed
regeneration will not be caught automatically. Run steps 3 and 4 above by hand
before opening a PR that changes the route layer.
```

- [ ] **Step 6: Update the Last Updated date**

Change the `> **Last Updated:**` line at the top of `Servers/CLAUDE.md` to today's date.

- [ ] **Step 7: Commit**

```bash
git add Servers/swagger.yaml docs/api-docs/src/config/endpoints.ts Servers/CLAUDE.md
git commit -m "docs(api): regenerate for the Phase 3 routes and correct the CI claim

Adds the five Phase 3 routes to the generated spec and registry.

Servers/CLAUDE.md claimed an api-docs-drift CI job regenerates and
verifies these files. No workflow in .github/workflows/ runs
check:api-drift, generate:swagger, or generate:endpoints — the job does
not exist. Documented as the manual pre-PR step it actually is, so the
next person does not trust a gate that was never wired up."
```

---

## Task 9: Frontend types

**Files:**
- Modify: `Clients/src/domain/interfaces/i.reporting.ts`

- [ ] **Step 1: Append the types**

Append to `Clients/src/domain/interfaces/i.reporting.ts`:

```ts
// ---------------------------------------------------------------------------
// Section catalog (GET /api/reporting/sections)
// ---------------------------------------------------------------------------

export interface ReportSectionCatalogEntry {
  key: string;
  label: string;
  group: string;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type ReportScope = "project" | "organization";

/**
 * The seven AI blocks Phase 2 shipped on the backend. Mirrors
 * Servers/domain.layer/interfaces/i.reportTemplate.ts AiBlocksConfig.
 */
export interface AiBlocksConfig {
  sectionSummaries?: boolean;
  executiveSummary?: boolean;
  keyFindings?: boolean;
  recommendedActions?: boolean;
  riskAnalysis?: boolean;
  complianceGap?: boolean;
  vendorRisk?: boolean;
}

export interface TemplateSectionConfig {
  key: string;
  reportSectionKey: string;
  label: string;
  core: boolean;
  defaultEnabled: boolean;
  supportedScopes: ReportScope[];
}

export interface SectionsConfig {
  sections: TemplateSectionConfig[];
}

export interface ReportTemplateVersion {
  id: number;
  template_id: number;
  version: number;
  sections_config: SectionsConfig;
  ai_blocks_config: AiBlocksConfig;
  format_config: Record<string, unknown>;
  branding_config: Record<string, unknown>;
  schedule_defaults: Record<string, unknown>;
  delivery_defaults: Record<string, unknown>;
  created_at: string;
}

export interface ReportTemplate {
  id: number;
  organization_id: number | null;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  default_scope: ReportScope;
  supported_scopes: ReportScope[];
  recommended_frequency: string | null;
  is_system_template: boolean;
  is_active: boolean;
  created_at: string;
  latestVersion?: ReportTemplateVersion | null;
}

/** Body for POST /templates and PATCH /templates/:id. */
export interface ReportTemplateWriteBody {
  name?: string;
  description?: string | null;
  category?: string;
  default_scope?: ReportScope;
  supported_scopes?: ReportScope[];
  recommended_frequency?: string | null;
  is_active?: boolean;
  sections_config?: SectionsConfig;
  ai_blocks_config?: AiBlocksConfig;
}

// ---------------------------------------------------------------------------
// Per-run AI analyses (GET /api/reporting/runs/:id/analyses)
//
// These payload shapes are hand-mirrored from the backend zod schemas in
// Servers/services/reporting/analyzers/schemas.ts, pinned by
// Servers/services/reporting/analyzers/__tests__/payloadShape.test.ts.
// If that test fails, this block is what needs updating.
// ---------------------------------------------------------------------------

export type AnalysisSectionKey =
  | "executiveSummary"
  | "keyFindings"
  | "recommendedActions"
  | "riskAnalysis"
  | "complianceGap"
  | "vendorRisk";

export interface ExecutiveSummaryPayload {
  summary: string;
  abstain_reason: string | null;
}

export interface KeyFindingsPayload {
  findings: Array<{ text: string; section: string; severity: string }>;
  abstain_reason: string | null;
}

export interface RecommendedActionsPayload {
  actions: Array<{
    action: string;
    suggestedOwner: string | null;
    priority: string;
    rationale: string;
  }>;
  abstain_reason: string | null;
}

export interface RiskAnalysisPayload {
  narrative: string;
  top_risks: Array<{ name: string; level: string; why: string }>;
  abstain_reason: string | null;
}

export interface ComplianceGapPayload {
  narrative: string;
  gaps: Array<{ control: string; gap: string; priority: string }>;
  scores_caveat: string | null;
  abstain_reason: string | null;
}

export interface VendorRiskPayload {
  narrative: string;
  concerns: Array<{ vendor: string; concern: string; severity: string }>;
  abstain_reason: string | null;
}

export type AnalysisPayload =
  | ExecutiveSummaryPayload
  | KeyFindingsPayload
  | RecommendedActionsPayload
  | RiskAnalysisPayload
  | ComplianceGapPayload
  | VendorRiskPayload;

export interface ReportRunAnalysis {
  id: number;
  report_run_id: number;
  section_key: string;
  payload: AnalysisPayload;
  analysis_model: string | null;
  analysis_version: number;
  analyzed_at: string;
  analyzed_by: number | null;
  audit_metadata: Record<string, unknown> | null;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd Clients && npx tsc --noEmit -p tsconfig.app.json
```

Expected: **exactly one error**, the pre-existing `TS7030` in `components/Reporting/GenerateReport/index.tsx(152,13)`. Any other error is yours to fix.

- [ ] **Step 3: Commit**

```bash
git add Clients/src/domain/interfaces/i.reporting.ts
git commit -m "feat(reporting): type the templates and analyses stack

Analysis payload shapes are hand-mirrored from the backend zod schemas
because there is no shared types package across the boundary; the
payloadShape test pins them so drift fails rather than ships."
```

---

## Task 10: Repository and hooks

**Files:**
- Modify: `Clients/src/application/repository/reporting.repository.ts`
- Modify: `Clients/src/application/hooks/useReporting.ts`
- Test: `Clients/src/application/hooks/__tests__/useReporting.test.ts`

- [ ] **Step 1: Add the repository functions**

Append to `Clients/src/application/repository/reporting.repository.ts`:

```ts
export async function getSectionCatalog(): Promise<ReportSectionCatalogEntry[]> {
  return extract(await apiServices.get("/reporting/sections"));
}

export async function createTemplate(
  body: ReportTemplateWriteBody,
): Promise<ReportTemplate> {
  return extract(await apiServices.post("/reporting/templates", body));
}

export async function updateTemplate(
  id: number,
  body: ReportTemplateWriteBody,
): Promise<ReportTemplate> {
  return extract(await apiServices.patch(`/reporting/templates/${id}`, body));
}

export async function archiveTemplate(id: number): Promise<{ ok: boolean }> {
  return extract(await apiServices.delete(`/reporting/templates/${id}`));
}

export async function getRunAnalyses(runId: number): Promise<ReportRunAnalysis[]> {
  return extract(await apiServices.get(`/reporting/runs/${runId}/analyses`));
}
```

Extend the type import at the top:

```ts
import type {
  GenerateReportRequestBody,
  GenerateReportResponse,
  ReportRun,
  ReportRunAnalysis,
  ReportSectionCatalogEntry,
  ReportTemplate,
  ReportTemplateWriteBody,
} from "../../domain/interfaces/i.reporting";
```

- [ ] **Step 2: Verify `apiServices` exposes `patch` and `delete`**

```bash
cd Clients && grep -n "patch\|delete\|put" src/infrastructure/api/networkServices.ts
```

Expected: both methods exist with a `(url, body?)` signature. **If `patch` is absent**, use whatever the file provides (`put`, or a generic `request`) and change the backend route in Task 4 to match the verb the client can actually send. Do not add a method to `networkServices.ts` for this.

- [ ] **Step 3: Write the failing hook tests**

Append to `Clients/src/application/hooks/__tests__/useReporting.test.ts` (create the file with the surrounding harness if it does not exist, copying the existing reporting test's setup):

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import React from "react";

vi.mock("../../repository/reporting.repository", () => ({
  getSectionCatalog: vi.fn(async () => [
    { key: "projectRisks", label: "Use case risks", group: "Risk analysis" },
  ]),
  createTemplate: vi.fn(async () => ({ id: 7 })),
  updateTemplate: vi.fn(async () => ({ id: 7 })),
  archiveTemplate: vi.fn(async () => ({ ok: true })),
  getRunAnalyses: vi.fn(async () => []),
  getTemplates: vi.fn(async () => []),
  getScheduledReports: vi.fn(async () => []),
  getRuns: vi.fn(async () => []),
  getReportRun: vi.fn(async () => ({ id: 1, status: "success" })),
  createScheduledReport: vi.fn(async () => ({})),
  runScheduledReportNow: vi.fn(async () => ({})),
  setScheduledReportActive: vi.fn(async () => ({})),
  generateReportV2: vi.fn(async () => ({ runId: 1 })),
}));

import {
  useSectionCatalog,
  useCreateTemplate,
  useUpdateTemplate,
  useArchiveTemplate,
  useRunAnalyses,
} from "../useReporting";
import * as repo from "../../repository/reporting.repository";

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
};

describe("useReporting template hooks", () => {
  it("useSectionCatalog fetches the catalog", async () => {
    const { result } = renderHook(() => useSectionCatalog(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  it("useCreateTemplate calls the repository", async () => {
    const { result } = renderHook(() => useCreateTemplate(), { wrapper });
    result.current.mutate({ name: "Board pack", category: "governance" });
    await waitFor(() => expect(repo.createTemplate).toHaveBeenCalled());
  });

  it("useArchiveTemplate passes the id through", async () => {
    const { result } = renderHook(() => useArchiveTemplate(), { wrapper });
    result.current.mutate(7);
    await waitFor(() => expect(repo.archiveTemplate).toHaveBeenCalledWith(7));
  });

  // useUpdateTemplate has no caller until the deferred TemplatesTab edit
  // affordance lands. It ships now so the client surface matches the PATCH
  // endpoint, and it is tested now so it is not untested dead code.
  it("useUpdateTemplate splits id and body", async () => {
    const { result } = renderHook(() => useUpdateTemplate(), { wrapper });
    result.current.mutate({ id: 7, body: { name: "Renamed" } });
    await waitFor(() =>
      expect(repo.updateTemplate).toHaveBeenCalledWith(7, { name: "Renamed" }),
    );
  });

  it("useRunAnalyses stays disabled without a run id", () => {
    const { result } = renderHook(() => useRunAnalyses(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(repo.getRunAnalyses).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd Clients && npx vitest run src/application/hooks/__tests__/useReporting.test.ts
```

Expected: FAIL — `useSectionCatalog is not a function`.

- [ ] **Step 5: Add the hooks**

Append to `Clients/src/application/hooks/useReporting.ts`:

```ts
// The catalog is static server-side data; cache it hard.
export const useSectionCatalog = () =>
  useQuery({
    queryKey: ["reporting", "sections"],
    queryFn: repo.getSectionCatalog,
    staleTime: 60 * 60 * 1000,
  });

export const useCreateTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: repo.createTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "templates"] }),
  });
};

export const useUpdateTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ReportTemplateWriteBody }) =>
      repo.updateTemplate(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "templates"] }),
  });
};

export const useArchiveTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => repo.archiveTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "templates"] }),
  });
};

// Analyses are written once when the run completes and never change after,
// so there is nothing to poll for.
export const useRunAnalyses = (runId: number | undefined) =>
  useQuery({
    queryKey: ["reporting", "run-analyses", runId],
    queryFn: () => repo.getRunAnalyses(runId as number),
    enabled: runId != null,
  });
```

Add the type import:

```ts
import type { ReportTemplateWriteBody } from "../../domain/interfaces/i.reporting";
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd Clients && npx vitest run src/application/hooks/__tests__/useReporting.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 7: Typecheck and commit**

```bash
cd Clients && npx tsc --noEmit -p tsconfig.app.json
```

Expected: exactly the one baseline `TS7030` error.

```bash
git add Clients/src/application/repository/reporting.repository.ts Clients/src/application/hooks/useReporting.ts Clients/src/application/hooks/__tests__/useReporting.test.ts
git commit -m "feat(reporting): template CRUD and analyses hooks"
```

---

## Task 11: TemplateBuilder + its mount

`TemplatesTab.tsx` is another developer's uncommitted work and off-limits, so the entry point goes in `pages/Reporting/index.tsx`, which is clean and already owns the drawer hosting `ConfigureReportWizard`.

**Files:**
- Create: `Clients/src/presentation/pages/Reporting/TemplateBuilder.tsx`
- Create: `Clients/src/presentation/pages/Reporting/__tests__/TemplateBuilder.test.tsx`
- Modify: `Clients/src/presentation/pages/Reporting/index.tsx`

- [ ] **Step 1: Write the failing test**

Create `Clients/src/presentation/pages/Reporting/__tests__/TemplateBuilder.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";

const mutate = vi.fn();

vi.mock("../../../../application/hooks/useReporting", () => ({
  useSectionCatalog: () => ({
    data: [
      { key: "projectRisks", label: "Use case risks", group: "Risk analysis" },
      { key: "vendors", label: "Vendors", group: "Organization" },
    ],
    isLoading: false,
  }),
  useCreateTemplate: () => ({ mutate, isPending: false }),
}));

import TemplateBuilder from "../TemplateBuilder";

beforeEach(() => mutate.mockReset());

describe("TemplateBuilder", () => {
  it("renders catalog sections grouped", () => {
    render(<TemplateBuilder onClose={() => {}} />);
    // Next is disabled until the template is named — fill it first or this
    // click is a no-op and the assertions below fail on step 0.
    fireEvent.change(screen.getByLabelText(/template name/i), {
      target: { value: "Board pack" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("Use case risks")).toBeInTheDocument();
    expect(screen.getByText("Risk analysis")).toBeInTheDocument();
  });

  it("blocks Next until the template has a name", () => {
    render(<TemplateBuilder onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/template name/i), {
      target: { value: "Board pack" },
    });
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
  });

  it("submits name, sections and the seven AI blocks", () => {
    render(<TemplateBuilder onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/template name/i), {
      target: { value: "Board pack" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // sections
    fireEvent.click(screen.getByLabelText("Use case risks"));
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // AI
    fireEvent.click(screen.getByRole("button", { name: /create template/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const body = mutate.mock.calls[0][0];
    expect(body.name).toBe("Board pack");
    expect(body.sections_config.sections).toHaveLength(1);
    expect(body.sections_config.sections[0].reportSectionKey).toBe("projectRisks");
    // All seven blocks must be present as explicit booleans; a missing key
    // reads as "off" on the backend, which is a different meaning from false.
    expect(Object.keys(body.ai_blocks_config)).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd Clients && npx vitest run src/presentation/pages/Reporting/__tests__/TemplateBuilder.test.tsx
```

Expected: FAIL — cannot resolve `../TemplateBuilder`.

- [ ] **Step 3: Implement the builder**

Create `Clients/src/presentation/pages/Reporting/TemplateBuilder.tsx`:

```tsx
import { useState } from "react";
import {
  Stepper,
  Step,
  StepLabel,
  Box,
  Button,
  MenuItem,
  TextField,
  FormControlLabel,
  Checkbox,
  Typography,
  Stack,
} from "@mui/material";
import { useSectionCatalog, useCreateTemplate } from "../../../application/hooks/useReporting";
import { showAlert } from "../../../infrastructure/api/customAxios";
import type {
  AiBlocksConfig,
  ReportScope,
  ReportSectionCatalogEntry,
} from "../../../domain/interfaces/i.reporting";

const STEPS = ["Details", "Sections", "AI insights"];

// All seven Phase 2 blocks, listed explicitly. The defaults mirror the
// behaviour-preserving manual-run set: the two project-scoped analyzers
// (complianceGap, vendorRisk) stay off because they add LLM spend to every
// run of the template.
const AI_BLOCKS: Array<{ key: keyof AiBlocksConfig; label: string }> = [
  { key: "sectionSummaries", label: "Per-section summaries" },
  { key: "executiveSummary", label: "Executive summary" },
  { key: "keyFindings", label: "Key findings" },
  { key: "recommendedActions", label: "Recommended actions" },
  { key: "riskAnalysis", label: "Risk analysis" },
  { key: "complianceGap", label: "Compliance gap analysis" },
  { key: "vendorRisk", label: "Third-party risk analysis" },
];

const DEFAULT_AI_BLOCKS: AiBlocksConfig = {
  sectionSummaries: true,
  executiveSummary: true,
  keyFindings: true,
  recommendedActions: true,
  riskAnalysis: true,
  complianceGap: false,
  vendorRisk: false,
};

export default function TemplateBuilder({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("governance");
  const [scope, setScope] = useState<ReportScope>("project");
  const [selected, setSelected] = useState<string[]>([]);
  const [ai, setAi] = useState<AiBlocksConfig>(DEFAULT_AI_BLOCKS);

  const { data: catalog = [], isLoading } = useSectionCatalog();
  const create = useCreateTemplate();

  const groups = catalog.reduce<Record<string, ReportSectionCatalogEntry[]>>((acc, entry) => {
    (acc[entry.group] ??= []).push(entry);
    return acc;
  }, {});

  const canNext = () => {
    if (active === 0) return name.trim().length > 0;
    if (active === 1) return selected.length > 0;
    return true;
  };

  const toggleSection = (key: string) =>
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const submit = () => {
    create.mutate(
      {
        name: name.trim(),
        description: description.trim() || null,
        category,
        default_scope: scope,
        supported_scopes: ["project", "organization"],
        sections_config: {
          sections: selected.map((key) => {
            const entry = catalog.find((c) => c.key === key);
            return {
              key,
              reportSectionKey: key,
              label: entry?.label ?? key,
              core: false,
              defaultEnabled: true,
              supportedScopes: ["project", "organization"] as ReportScope[],
            };
          }),
        },
        ai_blocks_config: ai,
      },
      {
        onSuccess: onClose,
        onError: () =>
          showAlert({
            variant: "error",
            body: "Failed to create template",
            isToast: true,
          }),
      },
    );
  };

  return (
    <Box sx={{ p: 3, minWidth: 600 }}>
      <Stepper activeStep={active} sx={{ mb: 3 }}>
        {STEPS.map((s) => (
          <Step key={s}>
            <StepLabel>{s}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {active === 0 && (
        <Stack spacing={2}>
          <TextField
            label="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
          <TextField
            select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <MenuItem value="governance">Governance</MenuItem>
            <MenuItem value="compliance">Compliance</MenuItem>
            <MenuItem value="risk">Risk</MenuItem>
          </TextField>
          <TextField
            select
            label="Default report level"
            value={scope}
            onChange={(e) => setScope(e.target.value as ReportScope)}
          >
            <MenuItem value="project">Project</MenuItem>
            <MenuItem value="organization">Organization</MenuItem>
          </TextField>
        </Stack>
      )}

      {active === 1 && (
        <Stack spacing={1}>
          <Typography variant="h6">Sections</Typography>
          {isLoading && (
            <Typography variant="body2" color="text.secondary">
              Loading sections…
            </Typography>
          )}
          {Object.entries(groups).map(([group, entries]) => (
            <Box key={group} sx={{ mb: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {group}
              </Typography>
              {entries.map((entry) => (
                <FormControlLabel
                  key={entry.key}
                  control={
                    <Checkbox
                      checked={selected.includes(entry.key)}
                      onChange={() => toggleSection(entry.key)}
                    />
                  }
                  label={entry.label}
                />
              ))}
            </Box>
          ))}
        </Stack>
      )}

      {active === 2 && (
        <Stack spacing={1}>
          <Typography variant="h6">AI insights</Typography>
          <Typography variant="body2" color="text.secondary">
            Each enabled block is one language-model call per report run.
          </Typography>
          {AI_BLOCKS.map(({ key, label }) => (
            <FormControlLabel
              key={key}
              control={
                <Checkbox
                  checked={!!ai[key]}
                  onChange={(e) => setAi((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
              }
              label={label}
            />
          ))}
        </Stack>
      )}

      <Box sx={{ mt: 3, display: "flex", justifyContent: "space-between" }}>
        <Button disabled={active === 0} onClick={() => setActive(active - 1)}>
          Back
        </Button>
        {active < STEPS.length - 1 ? (
          <Button variant="contained" disabled={!canNext()} onClick={() => setActive(active + 1)}>
            Next
          </Button>
        ) : (
          <Button variant="contained" disabled={create.isPending} onClick={submit}>
            Create template
          </Button>
        )}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd Clients && npx vitest run src/presentation/pages/Reporting/__tests__/TemplateBuilder.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Mount it**

In `Clients/src/presentation/pages/Reporting/index.tsx`:

Add the import:

```tsx
import TemplateBuilder from "./TemplateBuilder";
import { Button } from "@mui/material";
```

Add state beside `wizardTemplate` (after line 19):

```tsx
  const [builderOpen, setBuilderOpen] = useState(false);
```

Replace the Templates tab block (lines 81-85) with:

```tsx
      {activeTab === 1 && (
        <Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
            <Button variant="contained" onClick={() => setBuilderOpen(true)}>
              New template
            </Button>
          </Box>
          <TemplatesTab onUse={handleUseTemplate} />
        </Box>
      )}
```

Add a second drawer beside the existing one (after line 103):

```tsx
      <Drawer anchor="right" open={builderOpen} onClose={() => setBuilderOpen(false)}>
        {builderOpen && <TemplateBuilder onClose={() => setBuilderOpen(false)} />}
      </Drawer>
```

- [ ] **Step 6: Confirm you did not touch the deferred files**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler && git diff --stat Clients/src/presentation/pages/Reporting/TemplatesTab.tsx Clients/src/presentation/pages/Reporting/ScheduledReportsTab.tsx Clients/src/presentation/pages/Reporting/ArchiveTab.tsx
```

Expected: the same `+202/−126` that was there before this phase started — **another developer's changes, unchanged by you**. If the numbers moved, you edited a deferred file; revert that file with `git checkout --` only if you are certain the delta is yours.

- [ ] **Step 7: Run the reporting frontend tests**

```bash
cd Clients && npx vitest run src/presentation/pages/Reporting
```

Expected: all pass, including the pre-existing `Reporting.test.tsx` and `TemplatesTab.test.tsx`.

- [ ] **Step 8: Typecheck and commit**

```bash
cd Clients && npx tsc --noEmit -p tsconfig.app.json
```

Expected: exactly the one baseline `TS7030` error.

```bash
git add Clients/src/presentation/pages/Reporting/TemplateBuilder.tsx Clients/src/presentation/pages/Reporting/__tests__/TemplateBuilder.test.tsx Clients/src/presentation/pages/Reporting/index.tsx
git commit -m "feat(reporting): template builder drawer

Sections come from the server catalog rather than a hardcoded list, so an
org-authored template can describe sections the frontend never knew about.
All seven AI blocks are explicit booleans; complianceGap and vendorRisk
default off because each enabled block is a language-model call per run.

The entry point lives on the Reporting page beside the existing wizard
drawer rather than in TemplatesTab, which is another developer's
uncommitted work this phase deliberately leaves alone."
```

---

## Task 12: Widen the wizard's AI blocks from three to seven

**Files:**
- Modify: `Clients/src/presentation/pages/Reporting/ConfigureReportWizard.tsx:39-45, 186-202`
- Test: `Clients/src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `Clients/src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx`:

```tsx
// canNext() blocks step 1 unless at least one section has
// defaultEnabled !== false, and sections come from
// latestVersion.sections_config.sections. A fixture without one can never
// reach step 2, so the AI assertions would fail on an empty Sections step
// rather than on anything this test is about.
const TEMPLATE_FIXTURE = {
  id: 1,
  name: "T",
  default_scope: "organization",
  latestVersion: {
    id: 5,
    sections_config: {
      sections: [
        {
          key: "projectRisks",
          reportSectionKey: "projectRisks",
          label: "Use case risks",
          defaultEnabled: true,
        },
      ],
    },
  },
};

  it("offers all seven AI blocks, not the legacy three", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} onClose={() => {}} />);
    // Step 0 (Scope, org scope so no project needed) -> 1 (Sections) -> 2 (AI)
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    for (const label of [
      "Per-section summaries",
      "Executive summary",
      "Key findings",
      "Recommended actions",
      "Risk analysis",
      "Compliance gap analysis",
      "Third-party risk analysis",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("no longer renders raw camelCase keys as labels", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.queryByText("executiveSummary")).not.toBeInTheDocument();
  });
```

Ensure the file imports `fireEvent` and `screen` from `@testing-library/react`. `ConfigureReportWizard` calls `useProjects()` and `useCreateScheduledReport()` — check whether the existing test file already mocks them; if not, add mocks for both before rendering, or step 0 will throw.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd Clients && npx vitest run src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx
```

Expected: FAIL — `Per-section summaries` is not in the document; the step renders only three checkboxes labelled with raw keys.

- [ ] **Step 3: Implement**

In `ConfigureReportWizard.tsx`, add the import:

```tsx
import type { AiBlocksConfig } from "../../../domain/interfaces/i.reporting";
```

Add the block list above the component (below the `FREQUENCIES` constant on line 22):

```tsx
// The seven blocks Phase 2 shipped on the backend. Previously three of these
// were hardcoded here and the other four were unreachable from the UI.
const AI_BLOCKS: Array<{ key: keyof AiBlocksConfig; label: string }> = [
  { key: "sectionSummaries", label: "Per-section summaries" },
  { key: "executiveSummary", label: "Executive summary" },
  { key: "keyFindings", label: "Key findings" },
  { key: "recommendedActions", label: "Recommended actions" },
  { key: "riskAnalysis", label: "Risk analysis" },
  { key: "complianceGap", label: "Compliance gap analysis" },
  { key: "vendorRisk", label: "Third-party risk analysis" },
];

// complianceGap and vendorRisk default off: each enabled block is one
// language-model call on every scheduled run.
const DEFAULT_AI_BLOCKS: AiBlocksConfig = {
  sectionSummaries: true,
  executiveSummary: true,
  keyFindings: true,
  recommendedActions: true,
  riskAnalysis: true,
  complianceGap: false,
  vendorRisk: false,
};
```

Replace the `ai` state declaration at lines 39-45 with:

```tsx
  const [ai, setAi] = useState<AiBlocksConfig>(
    template.latestVersion?.ai_blocks_config ?? DEFAULT_AI_BLOCKS,
  );
```

Replace the AI Insights step body at lines 186-202 with:

```tsx
      {active === 2 && (
        <Stack spacing={1}>
          <Typography variant="h6">AI insights</Typography>
          <Typography variant="body2" color="text.secondary">
            Each enabled block is one language-model call per report run.
          </Typography>
          {AI_BLOCKS.map(({ key, label }) => (
            <FormControlLabel
              key={key}
              control={
                <Checkbox
                  checked={!!ai[key]}
                  onChange={(e) =>
                    setAi((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                />
              }
              label={label}
            />
          ))}
        </Stack>
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd Clients && npx vitest run src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx
```

Expected: PASS, including the file's pre-existing tests.

- [ ] **Step 5: Confirm the manual flow is untouched**

The legacy immediate-generate popup uses a separate `aiEnhanced: boolean` and must not change in this phase:

```bash
cd Clients && grep -rn "aiEnhanced" src/ | grep -v node_modules
```

Expected: hits only in `src/domain/interfaces/i.reporting.ts`, `src/domain/interfaces/i.status.ts`, and files under `src/presentation/components/Reporting/GenerateReport/`. **No hit inside `src/presentation/pages/Reporting/`.**

- [ ] **Step 6: Typecheck and commit**

```bash
cd Clients && npx tsc --noEmit -p tsconfig.app.json
```

Expected: exactly the one baseline `TS7030` error.

```bash
git add Clients/src/presentation/pages/Reporting/ConfigureReportWizard.tsx Clients/src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx
git commit -m "feat(reporting): expose all seven AI blocks in the wizard

The wizard hardcoded three block keys and rendered them as raw camelCase
labels, leaving the four blocks Phase 2 shipped on the backend
unreachable from any UI. The state is now typed as AiBlocksConfig rather
than any, and the two project-scoped analyzers default off because each
enabled block is a model call on every scheduled run.

The legacy immediate-generate popup's separate aiEnhanced boolean is
deliberately unchanged."
```

---

## Task 13: Documentation

**Files:**
- Modify: `docs/technical/domains/reporting.md`

- [ ] **Step 1: Read the current document**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler && grep -n "^#\{1,3\} " docs/technical/domains/reporting.md
```

Find the section describing the template stack — Phase 2 updated this file and left a note that the wizard would expose template writes in Phase 3 (around line 219).

- [ ] **Step 2: Document the write path**

Add a section covering:

- The five new endpoints, their verbs, paths, and RBAC (`GET /api/reporting/sections` — any authenticated role; `POST` / `PATCH` / `DELETE /api/reporting/templates` — `Admin` or `Editor`; `GET /api/reporting/runs/:id/analyses` — any authenticated role, doubly org-scoped).
- That system templates (`organization_id IS NULL`) are read-only for every org, enforced in the query WHERE clause rather than a controller branch.
- That `DELETE` archives via `is_active = false` because `scheduled_reports.template_id` is a NOT NULL FK with no `ON DELETE` clause, so a hard delete of a referenced template fails at the database.
- That template versions are append-only: a `PATCH` carrying any config field writes a new `report_template_versions` row at `MAX(version) + 1`, while metadata fields update the template row in place.
- That `sectionCatalog.ts` is now the single owner of the section taxonomy and `VALID_SECTION_KEYS` derives from it.
- That the wizard now offers all seven AI blocks, with `complianceGap` and `vendorRisk` defaulting off for spend reasons.

Remove or update the stale "Phase 3 will…" note now that it has happened.

- [ ] **Step 3: Bump the Last Updated date**

Set the `> **Last Updated:**` line to today's date, as the root `CLAUDE.md` mandates.

- [ ] **Step 4: Commit**

```bash
git add docs/technical/domains/reporting.md
git commit -m "docs(reporting): document the template write path"
```

---

## Final verification

Run every gate. Record actual output — do not claim a gate passed without having watched it.

- [ ] **Backend build**

```bash
cd Servers && npm run build
```

Expected: exit 0, zero TypeScript errors.

- [ ] **Backend unit suites**

```bash
cd Servers && npx jest --testPathIgnorePatterns "routes/__tests__/integration"
```

Expected: zero failures. **Baseline note:** 31 integration suites and one empty helper file fail at Phase 2 HEAD for reasons unrelated to this work. If you run the full suite, compare against that baseline rather than expecting green:

```bash
cd Servers && git stash && npx jest 2>&1 | tail -5 && git stash pop
```

- [ ] **Frontend typecheck**

```bash
cd Clients && npx tsc --noEmit -p tsconfig.app.json
```

Expected: **exactly one error** — the pre-existing `TS7030` at `components/Reporting/GenerateReport/index.tsx(152,13)`. Anything else is a regression introduced by this phase.

- [ ] **Frontend tests**

```bash
cd Clients && npx vitest run src/presentation/pages/Reporting src/application/hooks/__tests__/useReporting.test.ts
```

Expected: zero failures.

- [ ] **Frontend build**

```bash
cd Clients && npm run build
```

Expected: exit 0. (This runs `vite build` only and does not typecheck — the gate above is what catches type errors.)

- [ ] **Migration round-trip**

```bash
cd Servers && npx sequelize db:migrate && npx sequelize db:migrate:undo && npx sequelize db:migrate
```

Expected: all three succeed.

- [ ] **API drift**

```bash
cd Servers && npm run check:api-drift
```

Expected: exit 0. No CI job runs this — it is on you.

- [ ] **The deferred files are still untouched**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler && git status --porcelain Clients/src/presentation/pages/Reporting/TemplatesTab.tsx Clients/src/presentation/pages/Reporting/ScheduledReportsTab.tsx Clients/src/presentation/pages/Reporting/ArchiveTab.tsx
```

Expected: all three still ` M` (modified, unstaged) and **not** in any commit from this phase:

```bash
git log --name-only hp-apr-16-add-tasks-agent --not e58ca27b3 | grep -c "TemplatesTab\|ScheduledReportsTab\|ArchiveTab"
```

Expected: `0`.

- [ ] **The pre-existing dirty file count is unchanged**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler && git status --porcelain | wc -l
```

Expected: still 74 (plus any untracked `.megasaver/` tool artifacts, which are noise). A different count means work that is not ours was staged or reverted.

- [ ] **Cross-org isolation, exercised against a real database**

Unit tests mock `sequelize.query`, so they prove the SQL *contains* `organization_id` but never that PostgreSQL *honours* it. Phase 2 caught a missing tenant guard exactly this way. Seed two organizations, then confirm from org B:

1. `GET /api/reporting/templates/:id` for org A's custom template → 404.
2. `PATCH /api/reporting/templates/:id` on org A's template → 404, and org A's row is unchanged.
3. `DELETE /api/reporting/templates/:id` on org A's template → 404, and `is_active` is still true.
4. `PATCH` on a **system** template as an Admin → 404, and the system row is unchanged.
5. `POST /api/reporting/scheduled-reports` with org A's `templateVersionId` → 400 with the ownership error, and no row inserted.
6. `GET /api/reporting/runs/:id/analyses` for org A's run → 404, zero analysis rows returned.
7. `POST /api/reporting/templates` as an **Auditor** (role 4) → 403 from `authorize`.

Record the actual status codes. Clean up both organizations afterwards and re-confirm the dirty-file count.

---

## Notes carried forward (do not implement here)

- **The three deferred tabs.** `TemplatesTab` (edit/archive affordances per template card), `ScheduledReportsTab` (wire the existing DELETE endpoint, which has a backend but no frontend caller), and `ArchiveTab` (mount `ReportAnalysisPanel`, add polling and pagination) all wait on another developer's uncommitted styling refactor landing. This is the single largest carried item.
- **`ReportAnalysisPanel` itself.** Deferred with its mount for the reason in locked decision 8. Its endpoint, hook, and types ship in this phase, so the follow-up is presentational only. Build it from the pinned payload types in `i.reporting.ts`, and do **not** copy `EvidenceAnalysisPanel`'s `document_signals` branch — it has never had a producer.
- **`EvidenceAnalysisPanel`'s live rendering bug.** Separate from the above and worth its own fix: `rationales` is read from `auditMetadata?.rationales` (`index.tsx:293`) and is permanently `{}`, so every `DimensionCard` renders `rationale={null}`. The backend does produce per-dimension rationale text — under a different top-level field, `quality_rationale` (`analyzer.service.ts:53-60`) — which the panel's `AnalysisData` type does not declare. Real data exists and is read from the wrong path.
- **Three of the interfaces spec §9 names are deliberately not added.** `ScheduledReport`, `ScheduleConfig`, and `DeliveryConfig` have no consumer in this phase: the only code that would use them is `ScheduledReportsTab` and the wizard's schedule/delivery steps, neither of which Phase 3 touches. They are one small task alongside whichever of those lands first — adding them now would be exported types nothing imports.
- **Migrating the legacy popup onto the section catalog.** `REPORT_SECTION_GROUPS` is pinned by a test but still hardcoded. Retiring it means touching the immediate-generate flow, which is out of scope here.
- **Manual runs still send `aiEnhanced: boolean`.** Giving the ad-hoc popup per-block selection was explicitly declined for this phase. It remains the natural companion to the Phase 4 wizard-gating work.
- **Generic provenance guard.** Carried from Phase 2 and still open: only `suggestedOwner` is validated against the report's own data. A fabricated `complianceGap.gaps[].control` or `vendorRisk.concerns[].vendor` still passes zod cleanly.
- **`updateRunStatusQuery` has no `organization_id` in its WHERE clause** and hardcodes `completed_at = NOW()`. Carried from Phases 1 and 2; defence-in-depth, not a live hole.
- **Phase 4** covers real MJML delivery, recipient validation, the `report_runs.file_id` FK, `scheduled_reports.llm_key_id`, `useReportRuns` polling, `listRunsQuery` pagination, unhardcoding `format: "pdf"` in the wizard, gating AI blocks on `useLLMKeyStatus().hasKeys`, adding a scheduled-report UPDATE endpoint, and retiring the legacy `scheduled_report` automation trigger in `automationWorker.ts:250-492`.
- **There is still no `api-docs-drift` CI job.** Task 8 documents the truth; wiring the job up is a small, separate infrastructure change worth doing.
