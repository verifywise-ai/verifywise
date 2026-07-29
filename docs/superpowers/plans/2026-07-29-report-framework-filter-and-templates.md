# Report Framework Filter and 21 System Templates — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every report template target one or more frameworks, and grow the seeded system template library from 3 to 21 genuinely distinct reports.

**Architecture:** `resolveFrameworkTargets` already derives `(project, framework)` pairings from scope alone. Phase 1 adds an optional, namespaced framework filter that narrows those pairings, narrows the project set for project-scoped sections, and records a visible notice whenever a requested section ends up with nothing to collect. The 21 template definitions move out of the migration into a shared CommonJS seeder module so that two mechanical checks — pairwise distinctness and framework↔section reachability — can run as tests instead of living as prose.

**Tech Stack:** Node 22, TypeScript, Express 4, Sequelize 6 (raw SQL via `sequelize.query`), PostgreSQL, Jest + ts-jest (backend), React 19 + MUI 7 + React Query + Vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-07-29-report-templates-frameworks-design.md`

## Global Constraints

- All tables live in the `verifywise` PostgreSQL schema. **Migration DDL uses the explicit `verifywise.` prefix; application SQL uses unqualified table names** (resolved by `search_path`). This is the opposite convention in each place — see `Servers/CLAUDE.md`.
- Migration timestamps come from `date +%Y%m%d%H%M%S`, never hand-written. **Task 1's migration must sort strictly before Task 8's** — two calls in the same second collide.
- Every tenant-scoped query carries `organization_id` in its `WHERE`.
- `framework_ids` empty or `NULL` means **all frameworks in scope**. This is the backward-compatible default and no existing row is backfilled.
- Framework id entry forms: `native:<frameworks.id>`, `plugin:<custom_framework_definitions.plugin_key>`, `custom:<custom_frameworks.id>`, plus a bare positive integer read as `native:<n>`. Ids must be `> 0`.
- The legacy `scheduled_reports.framework_id` and `project_framework_id` columns are **not touched**.
- The `!isOrganizationalProject` guard at `dataCollector.ts:238` is **not removed**. It is verified-redundant defense; Task 7 pins the invariant with a test.
- Canonical template categories: `executive`, `compliance`, `risk`, `operational`, `governance`.
- `recommended_frequency` accepts only `daily`, `weekly`, `monthly`.
- Sentence case for all user-facing labels (VerifyWise design rule).
- **Never write a bare `= ANY(:ids)` with a Sequelize named replacement.** Sequelize expands an array replacement to a bare comma list, so `ANY(:ids)` renders `ANY(2, 3)` — a Postgres syntax error. Use `= ANY(ARRAY[:ids]::INTEGER[])` (see `dataCollector.ts:704`) or `IN (:ids)` (see `dataCollector.ts:861`). `ARRAY[:ids]::varchar[]` is likewise safe. A test that only asserts on the SQL string cannot catch this — assert the `ARRAY[...]` form explicitly.
- No `console.log` in shipped code. Backend logging goes through `utils/logger/logHelper.ts`.
- `cd Servers && npm run build` and `cd Clients && npm run build` must both pass before the phase is done.
- If any file under `Servers/routes/` changes, run `npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift` and commit the regenerated files.

---

### Task 1: Schema — `framework_config` and `framework_ids` columns

**Files:**
- Create: `Servers/database/migrations/<TIMESTAMP_A>-report-framework-selection.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `report_template_versions.framework_config JSONB NOT NULL DEFAULT '{}'` and `scheduled_reports.framework_ids JSONB NULL`. Task 6 writes to both; Task 8 seeds `framework_config`.

- [ ] **Step 1: Generate the timestamp and record it**

```bash
cd Servers && date +%Y%m%d%H%M%S
```

Write the value down. Call it `TIMESTAMP_A`. Task 8 needs a **strictly larger** one.

- [ ] **Step 2: Create the migration file**

Create `Servers/database/migrations/<TIMESTAMP_A>-report-framework-selection.js`:

```javascript
"use strict";

/**
 * Framework selection for report templates and schedules.
 *
 * framework_config carries a template version's default target frameworks:
 *   {"frameworkIds": ["native:2", "native:3"]}
 * framework_ids carries the same list on a concrete schedule.
 *
 * Both are NULL/empty-tolerant and empty means EVERY framework in scope, so
 * existing rows keep their current behaviour with no backfill.
 *
 * The legacy scalars scheduled_reports.framework_id and project_framework_id
 * are deliberately left alone: resolveReportRequest coerces them with `?? 0`,
 * and a 0 closes all four framework gates in collectAllData.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.report_template_versions
        ADD COLUMN IF NOT EXISTS framework_config JSONB NOT NULL DEFAULT '{}';
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.scheduled_reports
        ADD COLUMN IF NOT EXISTS framework_ids JSONB;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE verifywise.scheduled_reports DROP COLUMN IF EXISTS framework_ids;`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE verifywise.report_template_versions DROP COLUMN IF EXISTS framework_config;`,
    );
  },
};
```

- [ ] **Step 3: Run the migration**

```bash
cd Servers && npm run build && npx sequelize db:migrate
```

Expected: the migration name appears in the output with no error.

- [ ] **Step 4: Verify both columns landed**

```bash
cd Servers && npx sequelize db:migrate:undo && npx sequelize db:migrate
```

Expected: undo drops cleanly, re-migrate re-adds. A migration that cannot round-trip is not done.

- [ ] **Step 5: Commit**

```bash
git add Servers/database/migrations/
git commit -m "feat(reporting): add framework_config and framework_ids columns"
```

---

### Task 2: Framework selection parser

A pure module so every consumer agrees on what `"native:2"` means, and so the validation the controller needs is testable without a database.

**Files:**
- Create: `Servers/services/reporting/frameworkSelection.ts`
- Test: `Servers/services/reporting/tests/frameworkSelection.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ParsedFrameworkSelection { native: number[]; plugin: string[]; custom: number[]; invalid: string[] }`
  - `parseFrameworkSelection(raw: unknown): ParsedFrameworkSelection`
  - `isEmptySelection(p: ParsedFrameworkSelection): boolean`
  - Tasks 3, 4 and 6 all import from here.

- [ ] **Step 1: Write the failing test**

Create `Servers/services/reporting/tests/frameworkSelection.spec.ts`:

```typescript
/**
 * @fileoverview Tests for framework selection parsing.
 *
 * Native and custom framework ids collide numerically — frameworks.id = 2 is
 * ISO 42001 and custom_frameworks.id = 2 is some org's plugin framework — so
 * the namespace prefix is the only thing keeping them apart.
 *
 * @module tests/frameworkSelection
 */

import { parseFrameworkSelection, isEmptySelection } from "../frameworkSelection";

describe("parseFrameworkSelection", () => {
  it("sorts entries into their namespaces", () => {
    expect(parseFrameworkSelection(["native:1", "native:3", "plugin:soc2", "custom:7"])).toEqual({
      native: [1, 3],
      plugin: ["soc2"],
      custom: [7],
      invalid: [],
    });
  });

  it("reads a bare positive integer as native", () => {
    expect(parseFrameworkSelection([2, "4"]).native).toEqual([2, 4]);
  });

  it("treats a missing or non-array selection as empty", () => {
    for (const raw of [undefined, null, "native:1", {}]) {
      const parsed = parseFrameworkSelection(raw);
      expect(isEmptySelection(parsed)).toBe(true);
      expect(parsed.invalid).toEqual([]);
    }
  });

  it("rejects id 0 rather than letting it close every framework gate", () => {
    // A 0 framework id is the shipped bug this whole column exists to avoid:
    // collectAllData gates on === 1/2/3/4, so a 0 matches nothing and the
    // report comes out with no framework content at all.
    const parsed = parseFrameworkSelection(["native:0", "custom:0", 0]);
    expect(parsed.native).toEqual([]);
    expect(parsed.custom).toEqual([]);
    expect(parsed.invalid).toEqual(["native:0", "custom:0", "0"]);
  });

  it("collects unrecognised entries as invalid instead of dropping them", () => {
    const parsed = parseFrameworkSelection(["native:x", "iso42001", "plugin:", "plugin:SOC2"]);
    expect(parsed.invalid).toEqual(["native:x", "iso42001", "plugin:", "plugin:SOC2"]);
    expect(isEmptySelection(parsed)).toBe(true);
  });

  it("de-duplicates within a namespace", () => {
    expect(parseFrameworkSelection(["native:2", "native:2", 2]).native).toEqual([2]);
  });

  it("is empty only when no namespace holds anything", () => {
    expect(isEmptySelection(parseFrameworkSelection([]))).toBe(true);
    expect(isEmptySelection(parseFrameworkSelection(["plugin:gdpr"]))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd Servers && npx jest services/reporting/tests/frameworkSelection.spec.ts
```

Expected: FAIL — `Cannot find module '../frameworkSelection'`.

- [ ] **Step 3: Write the implementation**

Create `Servers/services/reporting/frameworkSelection.ts`:

```typescript
/**
 * @fileoverview Parsing for a report's framework selection.
 *
 * Native frameworks (`frameworks`) and plugin/custom frameworks
 * (`custom_frameworks`) are separate tables with independent SERIAL ids, so a
 * bare `2` is ambiguous. Every stored selection therefore carries a namespace:
 *
 *   native:<frameworks.id>                      the four built-in frameworks
 *   plugin:<custom_framework_definitions.key>   portable; what a system template seeds
 *   custom:<custom_frameworks.id>               concrete; one organization's row
 *
 * A bare integer is accepted as `native:<n>` for forgiveness, never emitted.
 *
 * An empty selection means EVERY framework in scope. That is the whole
 * backward-compatibility story: schedules written before this column existed
 * carry NULL and must keep behaving exactly as they did.
 *
 * @module services/reporting/frameworkSelection
 */

export interface ParsedFrameworkSelection {
  /** frameworks.id values. */
  native: number[];
  /** custom_framework_definitions.plugin_key values. */
  plugin: string[];
  /** custom_frameworks.id values. */
  custom: number[];
  /** Entries matching no known form, kept so a caller can reject or report them. */
  invalid: string[];
}

const NATIVE = /^native:(\d+)$/;
const CUSTOM = /^custom:(\d+)$/;
// Lower-case only: plugin_key is a slug, and accepting "SOC2" as well as
// "soc2" would make two spellings of one framework look like two frameworks.
const PLUGIN = /^plugin:([a-z0-9][a-z0-9_-]*)$/;
const BARE = /^\d+$/;

function pushUnique<T>(list: T[], value: T): void {
  if (!list.includes(value)) list.push(value);
}

export function parseFrameworkSelection(raw: unknown): ParsedFrameworkSelection {
  const out: ParsedFrameworkSelection = { native: [], plugin: [], custom: [], invalid: [] };
  if (!Array.isArray(raw)) return out;

  for (const entry of raw) {
    const text = typeof entry === "number" ? String(entry) : typeof entry === "string" ? entry.trim() : null;
    if (text === null) {
      pushUnique(out.invalid, String(entry));
      continue;
    }

    // An id of 0 is rejected everywhere below. collectAllData gates framework
    // sections on === 1/2/3/4, so a 0 silently empties every one of them.
    const bare = BARE.exec(text);
    if (bare) {
      const id = Number(bare[0]);
      id > 0 ? pushUnique(out.native, id) : pushUnique(out.invalid, text);
      continue;
    }

    const native = NATIVE.exec(text);
    if (native) {
      const id = Number(native[1]);
      id > 0 ? pushUnique(out.native, id) : pushUnique(out.invalid, text);
      continue;
    }

    const custom = CUSTOM.exec(text);
    if (custom) {
      const id = Number(custom[1]);
      id > 0 ? pushUnique(out.custom, id) : pushUnique(out.invalid, text);
      continue;
    }

    const plugin = PLUGIN.exec(text);
    if (plugin) {
      pushUnique(out.plugin, plugin[1]);
      continue;
    }

    pushUnique(out.invalid, text);
  }

  return out;
}

/** True when nothing resolvable was selected — i.e. "every framework in scope". */
export function isEmptySelection(p: ParsedFrameworkSelection): boolean {
  return p.native.length === 0 && p.plugin.length === 0 && p.custom.length === 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd Servers && npx jest services/reporting/tests/frameworkSelection.spec.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add Servers/services/reporting/frameworkSelection.ts Servers/services/reporting/tests/frameworkSelection.spec.ts
git commit -m "feat(reporting): parse namespaced framework selections"
```

---

### Task 3: `resolveFrameworkTargets` honours the filter

**Files:**
- Modify: `Servers/services/reporting/reportScope.ts` (whole file — docblock included)
- Test: `Servers/services/reporting/tests/reportScope.spec.ts` (append)

**Interfaces:**
- Consumes: `parseFrameworkSelection`, `isEmptySelection` from Task 2.
- Produces: `resolveFrameworkTargets(scope, projectId, organizationId, frameworkIds?: string[] | null)`. Tasks 4 and 6 call the 4-argument form; existing 3-argument callers keep working.

- [ ] **Step 1: Write the failing tests**

Append to `Servers/services/reporting/tests/reportScope.spec.ts`, inside the existing `describe("resolveFrameworkTargets", ...)` block:

```typescript
  it("narrows to the selected native frameworks", async () => {
    await resolveFrameworkTargets("organization", null, 10, ["native:2", "native:3"]);

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("pf.framework_id = ANY(ARRAY[:nativeFrameworkIds]::INTEGER[])");
    expect(options.replacements.nativeFrameworkIds).toEqual([2, 3]);
  });

  it("adds no framework predicate for an empty selection", async () => {
    for (const empty of [undefined, null, []]) {
      mockQuery.mockClear();
      await resolveFrameworkTargets("organization", null, 10, empty as any);

      const [sql, options] = mockQuery.mock.calls[0];
      expect(sql).not.toContain("nativeFrameworkIds");
      expect(options.replacements).not.toHaveProperty("nativeFrameworkIds");
    }
  });

  it("resolves nothing when the selection names only non-native frameworks", async () => {
    // projects_frameworks holds native pairings only. Falling through to an
    // unfiltered query here would silently widen the report to every framework
    // the caller explicitly did not ask for.
    expect(await resolveFrameworkTargets("organization", null, 10, ["plugin:soc2"])).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("ignores an unparseable entry rather than querying for it", async () => {
    expect(await resolveFrameworkTargets("organization", null, 10, ["iso42001"])).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Servers && npx jest services/reporting/tests/reportScope.spec.ts
```

Expected: FAIL — the narrowing test finds no `nativeFrameworkIds` in the SQL.

- [ ] **Step 3: Rewrite the docblock and add the parameter**

In `Servers/services/reporting/reportScope.ts`, replace lines 1–18 (the file docblock) with:

```typescript
/**
 * @fileoverview Report scope resolution — turns a report's scope and framework
 * selection into the set of (project, framework) pairings its framework
 * sections are collected from.
 *
 * This file used to say the wizard should never grow a framework picker. That
 * rationale was against a SINGLE frameworkId field: projects_frameworks is
 * many-per-project, so one id would pin a report to one framework and silently
 * drop the project's others. A multi-valued filter where empty means "all" is
 * the case that argument does not cover, and it is what makes an "ISO 42001
 * Internal Audit Pack" expressible at all.
 *
 * Scope + projectId still decide the candidate set; frameworkIds only narrows
 * it, and an empty selection narrows nothing.
 *
 * Before scope existed, frameworkId and projectFrameworkId arrived as NULL from
 * every wizard-driven run and reportTemplateResolver coerced them to 0. Every
 * framework section in collectAllData is gated on the numeric framework id
 * (=== 1 for EU AI Act, 2/3 for ISO, 4 for NIST), so a 0 closed all four gates
 * and the report came out with no compliance, assessment, clauses or NIST
 * content at all. parseFrameworkSelection rejects 0 for the same reason.
 *
 * @module services/reporting/reportScope
 */
```

Then add the import below the existing ones:

```typescript
import { parseFrameworkSelection, isEmptySelection } from "./frameworkSelection";
```

- [ ] **Step 4: Implement the filter**

Replace the body of `resolveFrameworkTargets` (from its signature down to the `const rows = ...` call) with:

```typescript
export async function resolveFrameworkTargets(
  scope: ReportScope,
  projectId: number | null | undefined,
  organizationId: number,
  frameworkIds?: string[] | null,
): Promise<FrameworkTarget[]> {
  // A project-scoped report with no project covers nothing. Returning empty
  // beats querying the whole organization, which would leak every project's
  // data into a report that asked for one.
  if (scope === "project" && !projectId) return [];

  const selection = parseFrameworkSelection(frameworkIds ?? []);

  // A non-empty selection naming no native framework — only plugin/custom
  // entries, or only unparseable ones — resolves to nothing here, because
  // projects_frameworks holds native pairings only. Falling through to an
  // unfiltered query would widen the report to every framework the caller
  // explicitly did not ask for. The collector turns this into a visible
  // no_framework_target notice rather than a silently missing section.
  if (!isEmptySelection(selection) && selection.native.length === 0) return [];
  if (isEmptySelection(selection) && (frameworkIds ?? []).length > 0) return [];

  const replacements: Record<string, unknown> = { organizationId };

  let projectPredicate = "";
  if (scope === "project") {
    projectPredicate = " AND pf.project_id = :projectId";
    replacements.projectId = Number(projectId);
  }

  let frameworkPredicate = "";
  if (selection.native.length > 0) {
    // ARRAY[...]::INTEGER[] rather than a bare `= ANY(:ids)`: sequelize expands
    // an array replacement to a bare comma list, so `ANY(:ids)` renders as
    // `ANY(2, 3)` — a Postgres syntax error. Same reasoning, and the same form,
    // as dataCollector.ts:704.
    frameworkPredicate = " AND pf.framework_id = ANY(ARRAY[:nativeFrameworkIds]::INTEGER[])";
    replacements.nativeFrameworkIds = selection.native;
  }

  const rows = (await sequelize.query(
    `SELECT pf.id AS project_framework_id,
            pf.framework_id,
            pf.project_id,
            p.project_title,
            p.is_organizational,
            f.name AS framework_name
       FROM projects_frameworks pf
       JOIN projects p ON p.id = pf.project_id AND p.organization_id = :organizationId
       JOIN frameworks f ON f.id = pf.framework_id
      WHERE pf.organization_id = :organizationId${projectPredicate}${frameworkPredicate}
      ORDER BY pf.project_id, pf.framework_id`,
    { replacements, type: QueryTypes.SELECT },
  )) as any[];
```

Leave the `return rows.map(...)` block below unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd Servers && npx jest services/reporting/tests/reportScope.spec.ts
```

Expected: PASS — the 4 new tests plus the 6 that were already there.

- [ ] **Step 6: Commit**

```bash
git add Servers/services/reporting/reportScope.ts Servers/services/reporting/tests/reportScope.spec.ts
git commit -m "feat(reporting): filter framework targets by selection"
```

---

### Task 4: Section notices and project-set narrowing

Two behaviours that belong together: a requested section that finds nothing must say so, and a non-empty framework selection must narrow the projects that project-scoped sections read.

**Files:**
- Modify: `Servers/domain.layer/interfaces/i.reportGeneration.ts` (`ReportData`)
- Modify: `Servers/services/reporting/dataCollector.ts`
- Test: `Servers/services/reporting/tests/dataCollector.notices.spec.ts` (create)

**Interfaces:**
- Consumes: `ParsedFrameworkSelection` from Task 2; `FrameworkTarget[]` from Task 3.
- Produces:
  - `interface SectionNotice { sectionKey: string; reason: "no_framework_target" | "no_data" | "unresolved_framework" }`
  - `ReportData.sectionNotices: SectionNotice[]` — always present, possibly empty. Task 5's renderers read it.
  - `createScopedDataCollector(organizationId, userId, scope, targets, projectId?, frameworkIds?)` — the 6th parameter is new.

- [ ] **Step 1: Add the notice type**

In `Servers/domain.layer/interfaces/i.reportGeneration.ts`, immediately above `export interface ReportData {`:

```typescript
/**
 * Why a requested section produced nothing.
 *
 * Before this existed, collectAllData simply omitted the key and both
 * renderers skipped what was absent, so "the framework you picked is on no
 * project in scope" and "this section was never requested" looked identical in
 * the output.
 */
export interface SectionNotice {
  /** Matches a REPORT_SECTION_CATALOG key. */
  sectionKey: string;
  reason:
    /** Requested, but no pairing in scope carries a framework that serves it. */
    | "no_framework_target"
    /** A pairing exists; the query returned zero rows. */
    | "no_data"
    /** A plugin:/custom: framework was selected but that path is not available yet. */
    | "unresolved_framework";
}
```

And add the field inside `ReportData`, directly after `aiSummaries?: AISummaries;`:

```typescript
  /** Always present, possibly empty. See SectionNotice. */
  sectionNotices: SectionNotice[];
```

- [ ] **Step 2: Write the failing test**

Create `Servers/services/reporting/tests/dataCollector.notices.spec.ts`:

```typescript
/**
 * @fileoverview Tests for section notices and framework-driven project
 * narrowing.
 *
 * A framework-filtered report must not report other frameworks' project risks,
 * and a section that ends up with nothing must say so rather than vanish.
 *
 * @module tests/dataCollector.notices
 */

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));

jest.mock("../../../utils/reporting.utils", () => ({
  getProjectRisksReportQuery: jest.fn().mockResolvedValue([]),
}));

import { createScopedDataCollector } from "../dataCollector";
import type { FrameworkTarget } from "../reportScope";

const isoTarget: FrameworkTarget = {
  projectId: 5,
  projectTitle: "AI Management System",
  isOrganizationalProject: true,
  frameworkId: 2,
  frameworkName: "ISO 42001",
  projectFrameworkId: 11,
};

describe("section notices", () => {
  it("records no_framework_target for a gated section no selected framework serves", async () => {
    // nistSubcategories needs framework 4; only an ISO 42001 pairing resolved.
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget], null, [
      "native:2",
    ]);

    const data = await collector.collectAllData(["nistSubcategories"]);

    expect(data.sections.nistSubcategories).toBeUndefined();
    expect(data.sectionNotices).toContainEqual({
      sectionKey: "nistSubcategories",
      reason: "no_framework_target",
    });
  });

  it("records unresolved_framework when only a plugin framework was selected", async () => {
    const collector = createScopedDataCollector(10, 1, "organization", [], null, ["plugin:soc2"]);

    const data = await collector.collectAllData(["compliance"]);

    expect(data.sectionNotices).toContainEqual({
      sectionKey: "compliance",
      reason: "unresolved_framework",
    });
  });

  it("emits no notices when nothing was filtered", async () => {
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget], null, []);

    const data = await collector.collectAllData(["clausesAndAnnexes"]);

    expect(data.sectionNotices).toEqual([]);
  });
});

describe("project narrowing", () => {
  it("limits project risks to the projects carrying a selected framework", async () => {
    const { sequelize } = require("../../../database/db");
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget], null, [
      "native:2",
    ]);

    await collector.collectAllData(["projectRisks"]);

    const scoped = (sequelize.query as jest.Mock).mock.calls.find(([sql]: [string]) =>
      sql.includes("pr.project_id = ANY(:scopedProjectIds)"),
    );
    expect(scoped).toBeDefined();
    expect(scoped[1].replacements.scopedProjectIds).toEqual([5]);
  });

  it("skips the section instead of building an empty ANY() predicate", async () => {
    // `= ANY('{}')` runs into Postgres empty-array type inference. This is a
    // live path: a native:1 template run against an ISO project resolves zero
    // targets.
    const { sequelize } = require("../../../database/db");
    (sequelize.query as jest.Mock).mockClear();

    const collector = createScopedDataCollector(10, 1, "organization", [], null, ["native:1"]);
    const data = await collector.collectAllData(["projectRisks"]);

    expect(data.sections.projectRisks).toBeUndefined();
    expect(data.sectionNotices).toContainEqual({
      sectionKey: "projectRisks",
      reason: "no_framework_target",
    });
    const anyCall = (sequelize.query as jest.Mock).mock.calls.find(([sql]: [string]) =>
      sql.includes("scopedProjectIds"),
    );
    expect(anyCall).toBeUndefined();
  });

  it("does not narrow entity-scoped sections", async () => {
    // A vendor is not "an ISO 42001 vendor". These entities carry no framework,
    // and dropping rows because their project happens to hold another one would
    // be invisible to the reader.
    const { sequelize } = require("../../../database/db");
    (sequelize.query as jest.Mock).mockClear();

    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget], null, [
      "native:2",
    ]);
    await collector.collectAllData(["vendors"]);

    const narrowed = (sequelize.query as jest.Mock).mock.calls.find(([sql]: [string]) =>
      sql.includes("scopedProjectIds"),
    );
    expect(narrowed).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd Servers && npx jest services/reporting/tests/dataCollector.notices.spec.ts
```

Expected: FAIL — `createScopedDataCollector` takes 5 parameters, and `sectionNotices` is not on the result.

- [ ] **Step 4: Thread the selection into the collector**

In `Servers/services/reporting/dataCollector.ts`, add the import:

```typescript
import {
  parseFrameworkSelection,
  isEmptySelection,
  type ParsedFrameworkSelection,
} from "./frameworkSelection";
```

Add the private field beside `private targets?: FrameworkTarget[];`:

```typescript
  /**
   * The parsed framework selection. Empty means every framework in scope, and
   * every narrowing below is skipped — that is the backward-compatible path
   * every pre-existing schedule takes.
   */
  private selection: ParsedFrameworkSelection = {
    native: [],
    plugin: [],
    custom: [],
    invalid: [],
  };
```

Add a 8th constructor parameter and assignment:

```typescript
    frameworkIds?: string[] | null,
```

```typescript
    this.selection = parseFrameworkSelection(frameworkIds ?? []);
```

Add two private helpers below `frameworkTargets()`:

```typescript
  /** True when the caller named at least one framework. */
  private isFiltered(): boolean {
    return !isEmptySelection(this.selection);
  }

  /**
   * The projects a filtered report may read project-scoped sections from, or
   * null when unfiltered. An EMPTY array is a real answer meaning "no project
   * in scope carries a selected framework" — callers must skip the section, not
   * build `= ANY('{}')`, which hits Postgres empty-array type inference.
   */
  private scopedProjectIds(): number[] | null {
    if (!this.isFiltered()) return null;
    return Array.from(new Set(this.frameworkTargets().map((t) => t.projectId)));
  }

  /**
   * Why a filtered report cannot serve a section: a selection that named only
   * plugin/custom frameworks is unresolvable until the custom-framework data
   * path lands, and is worth distinguishing from a framework simply not being
   * on any project.
   */
  private filterNoticeReason(): SectionNotice["reason"] {
    return this.selection.native.length === 0 ? "unresolved_framework" : "no_framework_target";
  }
```

Import the type at the top of the file alongside the other interface imports:

```typescript
import type { SectionNotice } from "../../domain.layer/interfaces/i.reportGeneration";
```

- [ ] **Step 5: Emit notices and narrow project risks**

In `collectAllData`, immediately after `const sectionData: ReportData["sections"] = {};`:

```typescript
    const sectionNotices: SectionNotice[] = [];
    const scopedProjectIds = this.scopedProjectIds();
    const noticeReason = this.filterNoticeReason();
    // An empty scoped set means the filter matched no project at all. Every
    // section below that depends on a pairing has to report it rather than
    // quietly return nothing.
    const filteredToNothing = scopedProjectIds !== null && scopedProjectIds.length === 0;
```

Replace the `projectRisks` block:

```typescript
    if (sections.includes("projectRisks") || sections.includes("all")) {
      if (filteredToNothing) {
        sectionNotices.push({ sectionKey: "projectRisks", reason: noticeReason });
      } else {
        sectionData.projectRisks = await this.collectProjectRisks(
          this.scope === "organization",
          scopedProjectIds,
        );
      }
    }
```

Add an `else` notice to each of the three framework-gated blocks. For EU:

```typescript
    if (euTargets.length > 0) {
      // ... existing compliance and assessment collection, unchanged ...
    } else {
      for (const key of ["compliance", "assessment"]) {
        if (sections.includes(key) || sections.includes("all")) {
          sectionNotices.push({ sectionKey: key, reason: noticeReason });
        }
      }
    }
```

For ISO:

```typescript
    } else if (sections.includes("clausesAndAnnexes") || sections.includes("all")) {
      sectionNotices.push({ sectionKey: "clausesAndAnnexes", reason: noticeReason });
    }
```

For NIST:

```typescript
    } else if (sections.includes("nistSubcategories") || sections.includes("all")) {
      sectionNotices.push({ sectionKey: "nistSubcategories", reason: noticeReason });
    }
```

**Only push a notice for an explicitly requested section.** `sections.includes("all")` is the legacy "everything" request; a notice for each of the twelve on an "all" report over a single-framework estate would be noise, so guard those three blocks on `!sections.includes("all")` if the estate proves noisy in review — but ship the simple form first.

Finally, add `sectionNotices` to the returned `ReportData` object at the end of `collectAllData`.

- [ ] **Step 6: Narrow the project-risk query**

Change the signature of `collectProjectRisks` (`dataCollector.ts:541`):

```typescript
  private async collectProjectRisks(
    orgWide = false,
    scopedProjectIds: number[] | null = null,
  ): Promise<ProjectRisksSectionData> {
    const risks =
      scopedProjectIds && scopedProjectIds.length > 0
        ? await this.fetchRisksForProjects(scopedProjectIds)
        : orgWide
          ? await this.fetchOrganizationRisks()
          : ((await getProjectRisksReportQuery(this.projectId, this.organizationId)) as any[]);
```

Leave the rest of the method unchanged, and add the new fetch beside `fetchOrganizationRisks`:

```typescript
  /**
   * Risks of a specific set of projects — the framework filter's project tier.
   *
   * DISTINCT ON (risk.id) because projects_risks is many-to-many: one risk
   * linked to two selected projects would otherwise be counted twice, and
   * risksByLevel feeds the risk donut.
   */
  private async fetchRisksForProjects(projectIds: number[]): Promise<any[]> {
    return (await sequelize.query(
      `SELECT DISTINCT ON (risk.id)
              risk.*, pr.project_id AS project_id,
              u.name AS risk_owner_name, u.surname AS risk_owner_surname
         FROM risks risk
         JOIN projects_risks pr ON risk.id = pr.risk_id AND pr.organization_id = :organizationId
         LEFT JOIN users u ON risk.risk_owner = u.id
        WHERE risk.organization_id = :organizationId
          AND pr.project_id = ANY(:scopedProjectIds)
        ORDER BY risk.id`,
      {
        replacements: { organizationId: this.organizationId, scopedProjectIds: projectIds },
        type: QueryTypes.SELECT,
      },
    )) as any[];
  }
```

- [ ] **Step 7: Pass the selection through the factory**

In `createScopedDataCollector`, add the parameter and forward it:

```typescript
export function createScopedDataCollector(
  organizationId: number,
  userId: number,
  scope: ReportScope,
  targets: FrameworkTarget[],
  projectId?: number | null,
  /** The report's framework selection; empty means every framework in scope. */
  frameworkIds?: string[] | null,
): ReportDataCollector {
  const first = targets[0];
  return new ReportDataCollector(
    organizationId,
    projectId ?? first?.projectId ?? 0,
    first?.frameworkId ?? 0,
    first?.projectFrameworkId ?? 0,
    userId,
    scope,
    targets,
    frameworkIds,
  );
}
```

`createDataCollector` (the legacy single-target path) is left alone — it passes no selection, so `isFiltered()` is false and nothing narrows.

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd Servers && npx jest services/reporting/tests/dataCollector
```

Expected: PASS — the new notices spec plus the existing `dataCollector.scope.spec.ts`.

- [ ] **Step 9: Commit**

```bash
git add Servers/domain.layer/interfaces/i.reportGeneration.ts Servers/services/reporting/dataCollector.ts Servers/services/reporting/tests/dataCollector.notices.spec.ts
git commit -m "feat(reporting): narrow projects by framework and record section notices"
```

---

### Task 5: Renderers show the notices

A notice that no renderer prints is a notice that does not exist.

**Files:**
- Modify: `Servers/templates/reports/report-pdf.ejs`
- Modify: `Servers/templates/reports/styles/pdf.css`
- Modify: `Servers/services/reporting/docxGenerator.ts`
- Test: `Servers/services/reporting/__tests__/reportPdfTemplate.test.ts` (append)
- Test: `Servers/services/reporting/tests/docxGenerator.spec.ts` (append)

**Interfaces:**
- Consumes: `ReportData.sectionNotices` from Task 4.
- Produces: no new exports. A shared label map lives in the DOCX generator and is duplicated in the EJS template — the two renderers already duplicate every other section's copy.

- [ ] **Step 1: Write the failing renderer tests**

Append to `Servers/services/reporting/__tests__/reportPdfTemplate.test.ts`:

```typescript
describe("section notices", () => {
  it("names the section and explains why it is empty", async () => {
    const html = await renderReportHtml({
      ...baseReportData,
      sections: {},
      sectionNotices: [{ sectionKey: "nistSubcategories", reason: "no_framework_target" }],
    });

    expect(html).toContain("NIST subcategories");
    expect(html).toContain("No project in scope uses a framework that provides this section.");
  });

  it("renders nothing when there are no notices", async () => {
    const html = await renderReportHtml({ ...baseReportData, sections: {}, sectionNotices: [] });

    expect(html).not.toContain("section-notice");
  });
});
```

> Use whatever the existing file already calls its render helper and fixture — read the top of `reportPdfTemplate.test.ts` and reuse those names rather than introducing `renderReportHtml`/`baseReportData` if they differ.

Append to `Servers/services/reporting/tests/docxGenerator.spec.ts` an equivalent assertion against the generated document's text.

- [ ] **Step 2: Run both to verify they fail**

```bash
cd Servers && npx jest services/reporting/__tests__/reportPdfTemplate.test.ts services/reporting/tests/docxGenerator.spec.ts
```

Expected: FAIL — no notice markup is produced.

- [ ] **Step 3: Add the EJS block**

In `Servers/templates/reports/report-pdf.ejs`, immediately before the closing `</body>`:

```html
    <% if (typeof sectionNotices !== 'undefined' && sectionNotices && sectionNotices.length > 0) { %>
    <section class="report-section">
      <h2 class="section-title">Sections with no data</h2>
      <p class="section-notice-intro">
        These sections were requested but produced nothing. They are listed so an empty
        report is never mistaken for a clean one.
      </p>
      <%
        const NOTICE_LABELS = {
          projectRisks: 'Use case risks',
          vendorRisks: 'Vendor risks',
          modelRisks: 'Model risks',
          compliance: 'Requirements',
          assessment: 'Assessment tracker',
          clausesAndAnnexes: 'Clauses and annexes',
          nistSubcategories: 'NIST subcategories',
          models: 'AI models',
          vendors: 'Vendors',
          trainingRegistry: 'Training registry',
          policyManager: 'Policy manager',
          incidentManagement: 'Incident management'
        };
        const NOTICE_REASONS = {
          no_framework_target: 'No project in scope uses a framework that provides this section.',
          no_data: 'No records were found in scope.',
          unresolved_framework: 'The selected framework is a plugin framework, which reports do not yet cover.'
        };
      %>
      <ul class="section-notice">
        <% sectionNotices.forEach(function (n) { %>
        <li>
          <strong><%= NOTICE_LABELS[n.sectionKey] || n.sectionKey %></strong>
          &mdash; <%= NOTICE_REASONS[n.reason] || n.reason %>
        </li>
        <% }); %>
      </ul>
    </section>
    <% } %>
```

- [ ] **Step 4: Add the CSS**

Append to `Servers/templates/reports/styles/pdf.css`:

```css
.section-notice-intro {
  font-size: 11px;
  color: #667085;
  margin-bottom: 8px;
}

.section-notice {
  font-size: 12px;
  color: #344054;
  padding-left: 18px;
}

.section-notice li {
  margin-bottom: 4px;
}
```

- [ ] **Step 5: Add the DOCX block**

In `Servers/services/reporting/docxGenerator.ts`, above the generator function, add the shared maps:

```typescript
/**
 * Copy for the "sections with no data" block. Duplicated in report-pdf.ejs
 * the same way every other section's copy is — the two renderers do not share
 * a template layer.
 */
const NOTICE_LABELS: Record<string, string> = {
  projectRisks: "Use case risks",
  vendorRisks: "Vendor risks",
  modelRisks: "Model risks",
  compliance: "Requirements",
  assessment: "Assessment tracker",
  clausesAndAnnexes: "Clauses and annexes",
  nistSubcategories: "NIST subcategories",
  models: "AI models",
  vendors: "Vendors",
  trainingRegistry: "Training registry",
  policyManager: "Policy manager",
  incidentManagement: "Incident management",
};

const NOTICE_REASONS: Record<string, string> = {
  no_framework_target: "No project in scope uses a framework that provides this section.",
  no_data: "No records were found in scope.",
  unresolved_framework:
    "The selected framework is a plugin framework, which reports do not yet cover.",
};
```

Then, at the end of the section-building sequence (after the `incidentManagement` block at ~:1376), append:

```typescript
  const notices = reportData.sectionNotices ?? [];
  if (notices.length > 0) {
    children.push(createSubsectionHeader("Sections with no data"));
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text:
              "These sections were requested but produced nothing. They are listed so an " +
              "empty report is never mistaken for a clean one.",
            size: 20,
            color: "667085",
          }),
        ],
        spacing: { after: 120 },
      }),
    );
    for (const notice of notices) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: NOTICE_LABELS[notice.sectionKey] ?? notice.sectionKey, bold: true, size: 20 }),
            new TextRun({ text: ` — ${NOTICE_REASONS[notice.reason] ?? notice.reason}`, size: 20 }),
          ],
          spacing: { after: 60 },
        }),
      );
    }
  }
```

> Match the surrounding code's actual `children` accumulator name and helper signatures — read the `incidentManagement` block at :1376 first.

The two "has any section" guards at `:289` and `:1267` are **not** changed: a report that is nothing but notices should still render, and those guards decide whether an empty document is produced at all. Verify by running the docx spec with only notices set.

- [ ] **Step 6: Run both tests to verify they pass**

```bash
cd Servers && npx jest services/reporting/__tests__/reportPdfTemplate.test.ts services/reporting/tests/docxGenerator.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add Servers/templates/reports/ Servers/services/reporting/docxGenerator.ts Servers/services/reporting/__tests__/reportPdfTemplate.test.ts Servers/services/reporting/tests/docxGenerator.spec.ts
git commit -m "feat(reporting): render a notice for every section that produced nothing"
```

---

### Task 6: Carry `frameworkIds` through the request flow

**Files:**
- Modify: `Servers/domain.layer/interfaces/i.reportTemplate.ts`
- Modify: `Servers/domain.layer/interfaces/i.reportGeneration.ts` (`ReportGenerationRequest`)
- Modify: `Servers/utils/scheduledReport.utils.ts:5-22` and `:69-70`
- Modify: `Servers/controllers/reportTemplate.ctrl.ts:~310-325`
- Modify: `Servers/services/reporting/reportTemplateResolver.ts`
- Modify: `Servers/services/reporting/index.ts:100` and `:259`
- Test: `Servers/services/reporting/__tests__/reportTemplateResolver.test.ts` (append)

**Interfaces:**
- Consumes: `parseFrameworkSelection` (Task 2), `resolveFrameworkTargets` 4-arg form (Task 3), `createScopedDataCollector` 6-arg form (Task 4).
- Produces: `ReportGenerationRequest.frameworkIds?: string[]` — the field every downstream consumer reads.

- [ ] **Step 1: Extend the interfaces**

In `Servers/domain.layer/interfaces/i.reportTemplate.ts`, add above `export interface ScheduleConfig`:

```typescript
/** A template version's default target frameworks. Empty means all in scope. */
export interface FrameworkConfig {
  /** Namespaced ids — see services/reporting/frameworkSelection.ts. */
  frameworkIds?: string[];
}
```

And add to `ScheduledReportRecord`, beside `framework_id`:

```typescript
  /** Namespaced framework selection. NULL or [] means every framework in scope. */
  framework_ids: string[] | null;
```

In `Servers/domain.layer/interfaces/i.reportGeneration.ts`, add to `ReportGenerationRequest`:

```typescript
  /**
   * Namespaced framework selection. Empty or absent means every framework in
   * scope, which is what every request made before this field existed means.
   */
  frameworkIds?: string[];
```

- [ ] **Step 2: Write the failing resolver test**

Append to `Servers/services/reporting/__tests__/reportTemplateResolver.test.ts`:

```typescript
describe("framework selection", () => {
  it("carries framework_ids onto the request", () => {
    const request = resolveReportRequest({
      scope: "organization",
      sections_config: { sections: [{ reportSectionKey: "compliance", defaultEnabled: true }] },
      framework_ids: ["native:1"],
      name: "EU AI Act Readiness Review",
      format: "pdf",
    });

    expect(request.frameworkIds).toEqual(["native:1"]);
  });

  it("leaves frameworkIds undefined for a row written before the column existed", () => {
    const request = resolveReportRequest({
      scope: "organization",
      sections_config: { sections: [{ reportSectionKey: "compliance", defaultEnabled: true }] },
      name: "Legacy",
      format: "pdf",
    });

    expect(request.frameworkIds).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd Servers && npx jest services/reporting/__tests__/reportTemplateResolver.test.ts
```

Expected: FAIL — `frameworkIds` is `undefined` in the first test.

- [ ] **Step 4: Wire the resolver**

In `Servers/services/reporting/reportTemplateResolver.ts`, add to the returned object, directly below the `scope:` line:

```typescript
    // Namespaced framework selection. Undefined (not []) for a legacy row, so
    // resolveFrameworkTargets takes its unfiltered path unchanged.
    frameworkIds: sched.framework_ids ?? undefined,
```

Replace the stale comment above `scope:` — it currently says a schedule "never states a framework, because a project holds many and the wizard has no picker", which stopped being true in this change:

```typescript
    // A schedule states a scope and, optionally, which frameworks it targets.
    // generateReport turns scope + project into the set of projects_frameworks
    // pairings and frameworkIds narrows them. Falling back to the project id
    // keeps rows written before the scope column existed working.
```

- [ ] **Step 5: Wire persistence**

In `Servers/utils/scheduledReport.utils.ts`, add `framework_ids` to the INSERT column list and `:frameworkIds` to its VALUES, then to `replacements`:

```typescript
        frameworkIds: input.frameworkIds ? JSON.stringify(input.frameworkIds) : null,
```

And add to the update field map at `:69`:

```typescript
  frameworkIds: "framework_ids",
```

> The update path must `JSON.stringify` an array value too — check how the existing map's JSONB fields (`sections_config`, `ai_blocks_config`) are serialised there and follow the same handling.

- [ ] **Step 6: Wire the controller**

In `Servers/controllers/reportTemplate.ctrl.ts`, add the import:

```typescript
import { parseFrameworkSelection } from "../services/reporting/frameworkSelection";
```

Before the `const sched = {` literal in `runTemplateNow`:

```typescript
    // Reject an unparseable entry rather than silently widening the report to
    // every framework — a caller that asked for ISO 42001 and got everything
    // has no way to tell from the output.
    const frameworkIds: string[] = Array.isArray(req.body.frameworkIds) ? req.body.frameworkIds : [];
    const selection = parseFrameworkSelection(frameworkIds);
    if (selection.invalid.length > 0) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            `unrecognised framework selection: ${selection.invalid.join(", ")}`,
          ),
        );
    }
```

And add to the `sched` literal, beside `framework_id`:

```typescript
      framework_ids: frameworkIds.length > 0 ? frameworkIds : null,
```

Replace the stale comment above `scope:` in that literal — it says "nothing reads them to collect", which is now only true of the legacy scalars:

```typescript
      // Scope selects the report's data and framework_ids narrows it. The
      // legacy scalars below stay for the row's shape only; nothing reads them
      // to collect. See resolveFrameworkTargets.
```

Apply the same `parseFrameworkSelection` validation to the create-scheduled-report controller path, and pass `frameworkIds` into `createScheduledReportQuery`'s input.

- [ ] **Step 7: Wire the generator**

In `Servers/services/reporting/index.ts`, both at `:100` and `:259`:

```typescript
      ? await resolveFrameworkTargets(
          request.scope,
          request.projectId || null,
          organizationId,
          request.frameworkIds,
        )
```

And at the `createScopedDataCollector` call:

```typescript
          request.projectId || null,
          request.frameworkIds,
```

- [ ] **Step 8: Run the reporting test suite**

```bash
cd Servers && npx jest services/reporting utils/reportTemplate.utils.test.ts controllers/__tests__/reportTemplate.ctrl.test.ts
```

Expected: PASS.

- [ ] **Step 9: Add the tenant-isolation case**

`framework_ids` is a new tenant-scoped column, and the isolation suite is where the deny-by-default policy is enforced (`docs/technical/security/tenant-isolation.md`). Append to `Servers/tests/integration/tenant-isolation/report-templates.isolation.test.ts`, following the file's existing two-org fixture and request helpers:

```typescript
it("does not expose another organization's framework_ids", async () => {
  const created = await createScheduledReportAs(orgA, {
    templateVersionId: orgATemplateVersionId,
    name: "Org A ISO run",
    scope: "organization",
    frameworkIds: ["native:2"],
  });

  const asOrgB = await getScheduledReportAs(orgB, created.id);

  expect(asOrgB.status).toBe(404);
});

it("keeps each organization's framework_ids on its own row", async () => {
  const a = await createScheduledReportAs(orgA, {
    templateVersionId: orgATemplateVersionId,
    name: "Org A ISO run",
    scope: "organization",
    frameworkIds: ["native:2"],
  });
  const b = await createScheduledReportAs(orgB, {
    templateVersionId: orgBTemplateVersionId,
    name: "Org B NIST run",
    scope: "organization",
    frameworkIds: ["native:4"],
  });

  expect((await getScheduledReportAs(orgA, a.id)).body.framework_ids).toEqual(["native:2"]);
  expect((await getScheduledReportAs(orgB, b.id)).body.framework_ids).toEqual(["native:4"]);
});
```

> Match the helper names and fixture variables the file already uses — read it first rather than assuming `createScheduledReportAs` / `getScheduledReportAs` exist under those names.

Run it:

```bash
cd Servers && npx jest tests/integration/tenant-isolation/report-templates.isolation.test.ts
```

Expected: PASS.

- [ ] **Step 10: Check for route drift and build**

```bash
cd Servers && git diff --name-only -- routes/ && npm run build
```

If `git diff` listed any route file, also run:

```bash
cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift
```

- [ ] **Step 11: Commit**

```bash
git add Servers/domain.layer/interfaces/ Servers/utils/scheduledReport.utils.ts Servers/controllers/reportTemplate.ctrl.ts Servers/services/reporting/ Servers/tests/integration/tenant-isolation/
git commit -m "feat(reporting): carry frameworkIds from request to collector"
```

---

### Task 7: Seeder module and the two mechanical checks

The 21 definitions live in a module both the migration and the tests read. That single source is what turns the reachability check from a paragraph into a gate.

**Files:**
- Create: `Servers/database/seeders/systemReportTemplates.js`
- Test: `Servers/database/seeders/__tests__/systemReportTemplates.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `module.exports = { SYSTEM_REPORT_TEMPLATES, AI_BASE, FRAMEWORK_SECTION_GATES }`. Task 8's migration requires this file.
  - `SYSTEM_REPORT_TEMPLATES: Array<{ name, slug, description, category, defaultScope, recommendedFrequency, frameworkNames: string[], sections: Array<{key, reportSectionKey, label, core, defaultEnabled, supportedScopes}>, ai: object }>`
  - `frameworkNames` holds **names** (`"EU AI Act"`), never ids — the migration resolves them the way `20260302111132` does.

- [ ] **Step 1: Write the seeder module**

Create `Servers/database/seeders/systemReportTemplates.js`. It must contain all 21 rows from the spec's table. Start from the three currently inlined in `20260619191640-seed-reporting-system-templates.js` (copy their `SECTIONS` and `AI_BASE` verbatim) and add the 18 new ones.

```javascript
"use strict";

/**
 * The system report template library.
 *
 * Lives here rather than inside the seed migration so the migration and the
 * two mechanical checks in __tests__/ read the SAME definitions. A test that
 * restated the table would drift from the seed in silence, which is exactly
 * the failure the checks exist to prevent.
 *
 * CommonJS and .js on purpose: migrations run from dist/ (see Servers/CLAUDE.md),
 * and a TypeScript source would put the migration and the test on different
 * paths to the same data.
 *
 * frameworkNames holds framework NAMES, never ids. The migration resolves them
 * by name the way 20260302111132-seed-framework-struct-data.js does; a
 * hardcoded integer breaks on any install whose SERIAL ran differently.
 */

// The five blocks aiSummarizer produced pre-Phase-2. Behaviour-preserving base.
const AI_BASE = {
  sectionSummaries: true,
  executiveSummary: true,
  keyFindings: true,
  recommendedActions: true,
  riskAnalysis: true,
  complianceGap: false,
  vendorRisk: false,
};

const BOTH = ["project", "organization"];

/** One enabled section entry. Core sections cannot be switched off in the wizard. */
const s = (key, reportSectionKey, label, core = true) => ({
  key,
  reportSectionKey,
  label,
  core,
  defaultEnabled: true,
  supportedScopes: BOTH,
});

/**
 * Which frameworks open each framework-gated section in collectAllData.
 * Mirrors the gates at dataCollector.ts:238-240. The reachability test below
 * is the only thing keeping the two in step.
 */
const FRAMEWORK_SECTION_GATES = {
  compliance: ["EU AI Act"],
  assessment: ["EU AI Act"],
  clausesAndAnnexes: ["ISO 42001", "ISO 27001"],
  nistSubcategories: ["NIST AI RMF"],
};

const SYSTEM_REPORT_TEMPLATES = [
  // ... all 21 rows ...
];

module.exports = { SYSTEM_REPORT_TEMPLATES, AI_BASE, FRAMEWORK_SECTION_GATES };
```

Fill `SYSTEM_REPORT_TEMPLATES` from the spec's 21-row table. Two worked examples showing both shapes:

```javascript
  {
    name: "Daily Governance Pulse",
    slug: "daily-governance-pulse",
    description:
      "Daily operational governance digest: current high risks, overdue tasks, open incidents.",
    category: "operational",
    defaultScope: "project",
    recommendedFrequency: "daily",
    frameworkNames: [],
    sections: [
      s("current_high_risks", "projectRisks", "Current high / critical risks"),
      s("open_incidents", "incidentManagement", "Open / unresolved incidents"),
      s("vendor_reviews", "vendors", "Vendor reviews due soon", false),
      s("policy_due", "policyManager", "Policy reviews due soon", false),
    ],
    ai: { ...AI_BASE, vendorRisk: true },
  },
  {
    name: "ISO 42001 Internal Audit Pack",
    slug: "iso-42001-audit-pack",
    description:
      "Clause and annex implementation status for an ISO 42001 internal audit, with the policies, training and risks behind it.",
    category: "compliance",
    defaultScope: "organization",
    recommendedFrequency: "monthly",
    frameworkNames: ["ISO 42001"],
    sections: [
      s("clauses_annexes", "clausesAndAnnexes", "Clause and annex status"),
      s("policies", "policyManager", "Supporting policies"),
      s("training", "trainingRegistry", "Training records"),
      s("risks", "projectRisks", "Use case risks"),
    ],
    ai: { ...AI_BASE, complianceGap: true },
  },
```

**Transcribe all 21 rows from the spec's table.** Do not stop at these two examples. The tests in Step 2 assert `length === 21`, unique slugs, unique names, pairwise-distinct section sets, reachability and enum validity, so an incomplete or mistyped transcription fails loudly rather than shipping.

**Reproduce the original three exactly as `20260619191640` seeded them.** In that migration `vendor_reviews` and `policy_due` carry `defaultEnabled: false`, and `weekly-executive-brief`'s `incidents_summary` carries `core: false, defaultEnabled: true`. The `s()` helper above defaults `defaultEnabled` to `true`, so those entries need it spelled out:

```javascript
      { key: "vendor_reviews", reportSectionKey: "vendors", label: "Vendor reviews due soon",
        core: false, defaultEnabled: false, supportedScopes: BOTH },
```

Changing a shipped template's enabled sections would alter what existing schedules produce — the seed skips rows whose slug already exists, but a fresh install must still get the same three templates it got yesterday.

- [ ] **Step 2: Write the two mechanical checks**

Create `Servers/database/seeders/__tests__/systemReportTemplates.test.ts`:

```typescript
/**
 * @fileoverview The two mechanical checks the system template library must
 * pass before it may be seeded.
 *
 * These are not style checks. A template whose gated section no selected
 * framework opens renders empty and silent, and a 21-template migration is
 * expensive to unwind once installs have run it.
 *
 * @module tests/systemReportTemplates
 */

const {
  SYSTEM_REPORT_TEMPLATES,
  FRAMEWORK_SECTION_GATES,
} = require("../systemReportTemplates.js");

const CANONICAL_CATEGORIES = ["executive", "compliance", "risk", "operational", "governance"];
const FREQUENCIES = ["daily", "weekly", "monthly"];
const SCOPES = ["project", "organization"];
const KNOWN_FRAMEWORKS = ["EU AI Act", "ISO 42001", "ISO 27001", "NIST AI RMF"];

type Template = {
  name: string;
  slug: string;
  category: string;
  defaultScope: string;
  recommendedFrequency: string;
  frameworkNames: string[];
  sections: Array<{ reportSectionKey: string; defaultEnabled: boolean }>;
  ai: Record<string, boolean>;
};

const templates: Template[] = SYSTEM_REPORT_TEMPLATES;

const enabledSectionKeys = (t: Template) =>
  Array.from(
    new Set(t.sections.filter((s) => s.defaultEnabled !== false).map((s) => s.reportSectionKey)),
  ).sort();

describe("the library ships at least 20 templates", () => {
  it("has 21", () => {
    expect(templates.length).toBe(21);
  });

  it("has unique slugs", () => {
    expect(new Set(templates.map((t) => t.slug)).size).toBe(templates.length);
  });

  it("has unique names", () => {
    // report_templates carries a unique-name constraint per organization and
    // the system rows share organization_id NULL.
    expect(new Set(templates.map((t) => t.name)).size).toBe(templates.length);
  });
});

describe("check 1: every template is a different report", () => {
  it("no two templates share a section set", () => {
    const seen = new Map<string, string>();
    for (const t of templates) {
      const key = enabledSectionKeys(t).join("+");
      const clash = seen.get(key);
      expect(clash === undefined || `${clash} and ${t.slug} share sections: ${key}`).toBe(true);
      seen.set(key, t.slug);
    }
  });

  it("no two templates share a full configuration tuple", () => {
    const tuple = (t: Template) =>
      JSON.stringify([
        enabledSectionKeys(t),
        [...t.frameworkNames].sort(),
        t.defaultScope,
        t.recommendedFrequency,
        Object.keys(t.ai)
          .filter((k) => t.ai[k])
          .sort(),
      ]);
    expect(new Set(templates.map(tuple)).size).toBe(templates.length);
  });
});

describe("check 2: every gated section is reachable from its frameworks", () => {
  it.each(templates.map((t) => [t.slug, t] as const))(
    "%s reaches every framework-gated section it enables",
    (_slug, t) => {
      for (const sectionKey of enabledSectionKeys(t)) {
        const openedBy = (FRAMEWORK_SECTION_GATES as Record<string, string[]>)[sectionKey];
        if (!openedBy) continue; // not framework-gated
        // An empty selection means every framework in scope, so every gate opens.
        if (t.frameworkNames.length === 0) continue;
        expect({
          section: sectionKey,
          selected: t.frameworkNames,
          needsOneOf: openedBy,
          reachable: t.frameworkNames.some((f) => openedBy.includes(f)),
        }).toMatchObject({ reachable: true });
      }
    },
  );
});

describe("field validity", () => {
  it.each(templates.map((t) => [t.slug, t] as const))("%s has valid enum fields", (_slug, t) => {
    expect(CANONICAL_CATEGORIES).toContain(t.category);
    expect(FREQUENCIES).toContain(t.recommendedFrequency);
    expect(SCOPES).toContain(t.defaultScope);
    for (const f of t.frameworkNames) expect(KNOWN_FRAMEWORKS).toContain(f);
    expect(t.sections.some((s) => s.defaultEnabled !== false)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the checks**

```bash
cd Servers && npx jest database/seeders/__tests__/systemReportTemplates.test.ts
```

Expected: PASS. **If either check fails, fix the definitions — not the check.** A failing reachability assertion means that template would ship a silently empty section.

- [ ] **Step 4: Pin the `is_organizational` invariant**

Create `Servers/services/reporting/tests/frameworkInvariant.spec.ts`:

```typescript
/**
 * @fileoverview Pins the invariant that makes the !isOrganizationalProject
 * guard at dataCollector.ts:238 redundant.
 *
 * frameworks seeds EU AI Act with is_organizational = false and ISO 42001,
 * ISO 27001 and NIST AI RMF with true; createNewProjectQuery rejects a
 * framework whose flag differs from the project's. So frameworkId === 1
 * implies !isOrganizationalProject, and the guard never removes a target.
 *
 * If a future migration flips EU AI Act's flag, that guard starts emptying
 * every EU AI Act report. This test fails first.
 *
 * @module tests/frameworkInvariant
 */

import * as fs from "fs";
import * as path from "path";

describe("frameworks.is_organizational", () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      "../../../database/migrations/20260226234301-public-schema-tables.js",
    ),
    "utf-8",
  );

  it("seeds EU AI Act as non-organizational", () => {
    expect(migration).toContain("(1, 'EU AI Act'");
    const line = migration.split("\n").find((l) => l.includes("'EU AI Act'"));
    expect(line).toMatch(/false\s*\)/);
  });

  it("seeds ISO 42001, ISO 27001 and NIST AI RMF as organizational", () => {
    for (const name of ["ISO 42001", "ISO 27001", "NIST AI RMF"]) {
      const line = migration.split("\n").find((l) => l.includes(`'${name}'`));
      expect(line).toMatch(/true\s*\)/);
    }
  });
});
```

- [ ] **Step 5: Run it**

```bash
cd Servers && npx jest services/reporting/tests/frameworkInvariant.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add Servers/database/seeders/ Servers/services/reporting/tests/frameworkInvariant.spec.ts
git commit -m "feat(reporting): define 21 system templates with distinctness and reachability gates"
```

---

### Task 8: Seed the 18 new templates

**Files:**
- Create: `Servers/database/migrations/<TIMESTAMP_B>-seed-system-report-template-library.js`

**Interfaces:**
- Consumes: `SYSTEM_REPORT_TEMPLATES` from Task 7; the `framework_config` column from Task 1.
- Produces: 18 new `report_templates` rows with `is_system_template = true` and one `report_template_versions` row each.

- [ ] **Step 1: Generate a timestamp strictly after Task 1's**

```bash
cd Servers && date +%Y%m%d%H%M%S
```

Compare against `TIMESTAMP_A`. If they are equal, wait a second and run it again. Call it `TIMESTAMP_B`.

- [ ] **Step 2: Write the migration**

Create `Servers/database/migrations/<TIMESTAMP_B>-seed-system-report-template-library.js`:

```javascript
"use strict";

const { SYSTEM_REPORT_TEMPLATES } = require("../seeders/systemReportTemplates.js");

/**
 * Seeds the system report template library.
 *
 * Idempotent per slug: 20260619191640 already inserted three of these, and
 * report_templates.slug carries a unique index from 20260720163044, so an
 * existing system row is skipped rather than duplicated.
 *
 * Framework ids are resolved BY NAME the way 20260302111132 does. A template
 * naming a framework this install does not have is skipped with a log line
 * rather than seeded with a dangling id.
 */
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const frameworkRows = await queryInterface.sequelize.query(
        `SELECT id, name FROM verifywise.frameworks`,
        { type: queryInterface.sequelize.QueryTypes.SELECT, transaction: t },
      );
      const idByName = new Map(frameworkRows.map((f) => [f.name, Number(f.id)]));

      for (const tpl of SYSTEM_REPORT_TEMPLATES) {
        const existing = await queryInterface.sequelize.query(
          `SELECT id FROM verifywise.report_templates
            WHERE slug = :slug AND is_system_template = true`,
          {
            replacements: { slug: tpl.slug },
            type: queryInterface.sequelize.QueryTypes.SELECT,
            transaction: t,
          },
        );
        if (existing.length) continue;

        const missing = tpl.frameworkNames.filter((n) => !idByName.has(n));
        if (missing.length) {
          // eslint-disable-next-line no-console
          console.log(
            `[seed-templates] skipping "${tpl.slug}": framework(s) not installed: ${missing.join(", ")}`,
          );
          continue;
        }

        const frameworkIds = tpl.frameworkNames.map((n) => `native:${idByName.get(n)}`);

        const inserted = await queryInterface.sequelize.query(
          `INSERT INTO verifywise.report_templates
             (organization_id, name, slug, description, category, default_scope,
              supported_scopes, recommended_frequency, is_system_template, is_active)
           VALUES (NULL, :name, :slug, :description, :category, :defaultScope,
              '["project","organization"]', :freq, true, true)
           RETURNING id`,
          {
            replacements: {
              name: tpl.name,
              slug: tpl.slug,
              description: tpl.description,
              category: tpl.category,
              defaultScope: tpl.defaultScope,
              freq: tpl.recommendedFrequency,
            },
            type: queryInterface.sequelize.QueryTypes.INSERT,
            transaction: t,
          },
        );
        const templateId = inserted[0][0].id;

        await queryInterface.sequelize.query(
          `INSERT INTO verifywise.report_template_versions
             (template_id, version, sections_config, ai_blocks_config, framework_config,
              format_config, schedule_defaults, delivery_defaults, config_schema_version)
           VALUES (:tid, 1, :sections, :ai, :frameworks, '{"format":"pdf"}', :sched,
              '{"saveToStorage":true,"sendEmailLink":true,"attachFile":false}', 1)`,
          {
            replacements: {
              tid: templateId,
              sections: JSON.stringify({ sections: tpl.sections }),
              ai: JSON.stringify(tpl.ai),
              frameworks: JSON.stringify({ frameworkIds }),
              sched: JSON.stringify({
                frequency: tpl.recommendedFrequency,
                hour: 9,
                minute: 0,
                timezone: "UTC",
              }),
            },
            type: queryInterface.sequelize.QueryTypes.INSERT,
            transaction: t,
          },
        );
      }

      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  /**
   * Deactivates rather than deletes. scheduled_reports.template_id is
   * NOT NULL REFERENCES report_templates(id) with no ON DELETE clause, so
   * NO ACTION applies: deleting a template any organization has scheduled from
   * raises a foreign key violation and the whole rollback fails.
   */
  async down(queryInterface) {
    const { SYSTEM_REPORT_TEMPLATES: tpls } = require("../seeders/systemReportTemplates.js");
    const slugs = tpls.map((t) => t.slug).filter((s) =>
      !["daily-governance-pulse", "weekly-executive-brief", "compliance-evidence-gap"].includes(s),
    );
    await queryInterface.sequelize.query(
      `UPDATE verifywise.report_templates
          SET is_active = false, updated_at = NOW()
        WHERE is_system_template = true AND slug = ANY(ARRAY[:slugs]::varchar[])`,
      { replacements: { slugs } },
    );
  },
};
```

- [ ] **Step 3: Run the migration**

```bash
cd Servers && npm run build && npx sequelize db:migrate
```

Expected: no error. Any "framework(s) not installed" line means that install lacks a seeded framework — investigate before continuing.

- [ ] **Step 4: Verify 21 system templates exist and the three originals were not duplicated**

```bash
cd Servers && npx sequelize db:migrate:undo && npx sequelize db:migrate && npx sequelize db:migrate
```

Expected: the second `db:migrate` is a no-op, and re-running after undo re-seeds without duplicate-slug errors. Confirm by querying:

```sql
SELECT count(*) FROM verifywise.report_templates WHERE is_system_template = true;
SELECT slug, count(*) FROM verifywise.report_templates GROUP BY slug HAVING count(*) > 1;
```

Expected: `21`, and the second query returns no rows.

- [ ] **Step 5: Commit**

```bash
git add Servers/database/migrations/
git commit -m "feat(reporting): seed the 18 new system report templates"
```

---

### Task 9: Framework multi-select in the report wizard

**Files:**
- Modify: `Clients/src/presentation/pages/Reporting/ConfigureReportWizard.tsx`
- Modify: `Clients/src/domain/interfaces/i.reporting.ts`
- Test: `Clients/src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx` (append)

**Interfaces:**
- Consumes: `useFrameworks({ listOfFrameworks: [] }).allFrameworks` — each element has `id: number` and `name: string`.
- Produces: `frameworkIds: string[]` on both the run-now and create-schedule request bodies.

- [ ] **Step 1: Write the failing tests**

Append to `Clients/src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx`:

```tsx
describe("framework selection", () => {
  it("pre-selects the template's default frameworks", () => {
    render(
      <ConfigureReportWizard
        template={{
          ...baseTemplate,
          latestVersion: { ...baseTemplate.latestVersion, framework_config: { frameworkIds: ["native:2"] } },
        }}
        mode="run-now"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
  });

  it("allows an empty selection to mean every framework", async () => {
    render(<ConfigureReportWizard template={baseTemplate} mode="run-now" onClose={vi.fn()} />);

    // No framework picked, and Next is still enabled.
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
  });

  it("sends frameworkIds on the run body", async () => {
    const mutate = vi.fn();
    mockRunTemplateNow.mockReturnValue({ mutate, isPending: false });

    render(
      <ConfigureReportWizard
        template={{
          ...baseTemplate,
          latestVersion: { ...baseTemplate.latestVersion, framework_config: { frameworkIds: ["native:2"] } },
        }}
        mode="run-now"
        onClose={vi.fn()}
      />,
    );

    // Scope -> Sections -> AI Insights -> Review
    for (let i = 0; i < 3; i += 1) {
      await userEvent.click(screen.getByRole("button", { name: /next/i }));
    }
    await userEvent.click(screen.getByRole("button", { name: /run now/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ frameworkIds: ["native:2"] }),
      }),
      expect.anything(),
    );
  });

  it("sends an empty array when no framework is chosen", async () => {
    const mutate = vi.fn();
    mockRunTemplateNow.mockReturnValue({ mutate, isPending: false });

    render(<ConfigureReportWizard template={baseTemplate} mode="run-now" onClose={vi.fn()} />);

    for (let i = 0; i < 3; i += 1) {
      await userEvent.click(screen.getByRole("button", { name: /next/i }));
    }
    await userEvent.click(screen.getByRole("button", { name: /run now/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ frameworkIds: [] }) }),
      expect.anything(),
    );
  });
});
```

> Read the top of the existing test file first. Reuse its `baseTemplate` fixture and its existing `useRunTemplateNow` mock rather than introducing `mockRunTemplateNow` if it is already named something else, and reuse its default `template.default_scope` — a `project` default adds a project-picker step the loop above would have to satisfy first. If the fixture defaults to project scope, either switch it to `organization` for these two tests or select a project before clicking Next.

- [ ] **Step 2: Run to verify failure**

```bash
cd Clients && npx vitest run src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx
```

Expected: FAIL — no framework control is rendered.

- [ ] **Step 3: Add the payload type**

In `Clients/src/domain/interfaces/i.reporting.ts`, add to the run and schedule request body types:

```typescript
  /**
   * Namespaced framework ids ("native:1"). Empty or omitted means every
   * framework in scope, which is what every report did before this existed.
   */
  frameworkIds?: string[];
```

- [ ] **Step 4: Add the control**

In `ConfigureReportWizard.tsx`, add the import and hook:

```tsx
import useFrameworks from "../../../application/hooks/useFrameworks";
```

```tsx
  const { allFrameworks } = useFrameworks({ listOfFrameworks: [] });
  // Seeded from the template's default; an empty list means every framework in
  // scope, so canNext is deliberately NOT gated on it.
  const [frameworkIds, setFrameworkIds] = useState<string[]>(
    template.latestVersion?.framework_config?.frameworkIds ?? [],
  );
```

Add the field to the **Scope** step, below the project picker:

```tsx
          <TextField
            select
            label="Frameworks"
            value={frameworkIds}
            onChange={(e) =>
              setFrameworkIds(
                typeof e.target.value === "string"
                  ? e.target.value.split(",")
                  : (e.target.value as unknown as string[]),
              )
            }
            helperText="Leave empty to include every framework in scope."
            SelectProps={{
              multiple: true,
              renderValue: (selected) => (
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  {(selected as string[]).map((value) => (
                    <Chip
                      key={value}
                      size="small"
                      label={
                        allFrameworks.find((f: any) => `native:${f.id}` === value)?.name ?? value
                      }
                    />
                  ))}
                </Stack>
              ),
            }}
          >
            {allFrameworks.map((f: any) => (
              <MenuItem key={f.id} value={`native:${f.id}`}>
                {f.name}
              </MenuItem>
            ))}
          </TextField>
```

Add to the Review step, after the Scope line:

```tsx
          <Box>
            <Typography variant="body2" component="span" sx={{ mr: 1 }}>
              <strong>Frameworks:</strong>
            </Typography>
            {frameworkIds.length ? (
              <Stack direction="row" spacing={1} sx={{ display: "inline-flex", flexWrap: "wrap" }}>
                {frameworkIds.map((value) => (
                  <Chip
                    key={value}
                    size="small"
                    label={allFrameworks.find((f: any) => `native:${f.id}` === value)?.name ?? value}
                  />
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" component="span" color="text.secondary">
                all frameworks in scope
              </Typography>
            )}
          </Box>
```

And add to the `base` payload object in `submit`:

```tsx
      frameworkIds,
```

- [ ] **Step 5: Run to verify the tests pass**

```bash
cd Clients && npx vitest run src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Build both sides**

```bash
cd Clients && npm run build && cd ../Servers && npm run build
```

Expected: both succeed.

- [ ] **Step 7: Verify in the running app**

Start the dev server via the preview tooling, open Reporting → Templates, confirm 21 cards render, open "ISO 42001 Internal Audit Pack" → Run now, and confirm the Scope step shows ISO 42001 pre-selected. Take a screenshot for the PR.

- [ ] **Step 8: Commit**

```bash
git add Clients/src/presentation/pages/Reporting/ Clients/src/domain/interfaces/i.reporting.ts
git commit -m "feat(reporting): add a framework multi-select to the report wizard"
```

---

### Task 10: Documentation

**Files:**
- Modify: `docs/technical/domains/reporting.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code reads.

- [ ] **Step 1: Update the reporting domain doc**

Set `**Last Updated:** 2026-07-29` at the top, then document:

- **Framework selection** — the three namespaced id forms, that empty means all, and where `framework_config` / `framework_ids` live. State that the legacy `framework_id` / `project_framework_id` scalars stay dead and why.
- **The three narrowing tiers** — framework-gated, project-scoped, entity-scoped — with the reason entity-scoped sections are exempt: a vendor is not "an ISO 42001 vendor".
- **Section notices** — the three reasons and that a notice is rendered, not omitted.
- **The retracted `!isOrganizationalProject` claim** — record that the guard is verified-redundant (EU AI Act seeds `is_organizational = false`, `createNewProjectQuery` enforces flag matching), that it is kept as defense, and that `frameworkInvariant.spec.ts` pins it. Write this down so the next reader does not re-derive it.
- **The 21-template library** — point at `Servers/database/seeders/systemReportTemplates.js` as the source of truth and at the two mechanical checks as its gate.

- [ ] **Step 2: Run the full backend suite one last time**

```bash
cd Servers && npx jest services/reporting database/seeders utils/reportTemplate.utils.test.ts controllers/__tests__/reportTemplate.ctrl.test.ts tests/integration/tenant-isolation/report-templates.isolation.test.ts
```

Expected: PASS. Report any failure with its output — do not claim the phase is done over a red suite.

- [ ] **Step 3: Commit**

```bash
git add docs/technical/domains/reporting.md
git commit -m "docs(reporting): document framework selection, notices and the template library"
```

---

## Phase 1 done when

- `SELECT count(*) FROM verifywise.report_templates WHERE is_system_template = true` returns 21.
- `npx jest database/seeders` passes — both mechanical checks green.
- `cd Servers && npm run build` and `cd Clients && npm run build` both succeed.
- A report run with `frameworkIds: ["native:2"]` contains ISO clause content and no EU AI Act content, and names any section it could not fill.

Phases 2–4 (TemplatesTab grouping, the custom-framework data path, the five new catalog sections) get their own plans.
