# DORA Register of Information Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a DORA Register of Information — a live ICT third-party inventory rendered as a new tab in the Vendors module, backed by new descriptive fields on the `vendors` table, with a submission-shaped export.

**Architecture:** Embedded in verifywise core (NOT a plugin — the plugin engine has no access to core `vendors` tables). Extend the existing `vendors` table with nullable DORA columns; add one read endpoint that filters ICT providers; render a new Vendors tab reusing existing table/search/export components; extend the vendor create/update form with a DORA section. **All DORA UI is gated on the DORA framework being installed for the org** — no DORA framework → zero DORA UI (verified: plugin UI slots do NOT exist on this branch, so gating is a runtime framework-installed check, not slot rendering). Descriptive-only — the existing vendor `risk_score` is untouched.

**Tech Stack:** Node.js 22 / Express 4 / Sequelize 6 / PostgreSQL (backend); React 19 / TypeScript / MUI 7 / React Query (frontend). Raw SQL via `sequelize.query()` with unqualified table names.

**Spec:** `docs/superpowers/specs/2026-08-24-dora-support-design.md` (Workstream B)

## Global Constraints

- **Branch:** work on `feat/dora-support-design` (already created) or a child branch. NEVER commit to `develop`.
- **Multi-tenancy:** every query is org-scoped with `WHERE organization_id = :organizationId`. `organizationId` comes from `req.organizationId` (JWT middleware).
- **Migration DDL:** use `verifywise.` prefix; generate timestamp with `date +%Y%m%d%H%M%S`. `addColumn` with unqualified names is acceptable for simple column additions.
- **Backend layers:** thin controller → utils (raw SQL) → PostgreSQL. Response format `STATUS_CODE[xxx](data)`. Use `logProcessing`/`logSuccess`/`logFailure`.
- **New DORA columns are all NULLABLE** so existing vendors are unaffected.
- **Descriptive-only:** do NOT modify the vendor `risk_score` calculation.
- **Visibility gate (HARD):** the ICT register tab AND the vendor-form DORA section must render ONLY when the DORA framework (id `9`, key `dora`, `is_organizational`) is installed for the org. No DORA framework → neither renders. Do NOT use plugin slots (`PluginSlot`/`usePlugins` do not exist on this branch). Use a runtime frameworks-installed check (Task 5b).
- **Truthful copy:** UI labels use "ICT register" / "supports the DORA Register of Information" — never "DORA compliant" as a guarantee.
- **UI:** VerifyWise components over raw MUI (`CustomizableBasicTable`, `SearchBox`, `CustomizableButton`, `Select`, `Field`). Sentence case; border `#d0d5dd`; radius 4px; green `#13715B`; 30px control height.
- **i18n:** new user-facing strings need de/fr/es entries in `Clients/src/.../i18n/translations.ts` or `i18n:audit:strict` fails.
- **API drift:** after route changes, run `cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift` and commit the regenerated `swagger.yaml` + `endpoints.ts`.
- **Gates (from package dirs):** `cd Servers && npm run build`; `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`.
- **tsc-watch caveat:** never write temp `.ts` files into the `Servers/` tree (restarts the backend). Use the scratchpad for throwaway scripts.

---

## File Structure

**Backend (verifywise `Servers/`):**
- Migration `Servers/database/migrations/<ts>-add-dora-fields-to-vendors.js` — CREATE the DORA columns + enums.
- Modify `Servers/domain.layer/models/vendor/vendor.model.ts` — add 7 columns to `VendorModel`.
- Modify `Servers/domain.layer/interfaces/i.vendor.ts` — add 7 fields to `IVendor`.
- Modify `Servers/utils/vendor.utils.ts` — extend `createNewVendorQuery`/`updateVendorByIdQuery` dynamic field lists; add `getDoraRegisterQuery`.
- Modify `Servers/controllers/vendor.ctrl.ts` — add `getDoraRegister` handler.
- Modify `Servers/routes/vendor.route.ts` — add `GET /dora-register`.

**Frontend (verifywise `Clients/`):**
- Modify `Clients/src/domain/interfaces/i.vendor.ts` — add DORA fields.
- Modify `Clients/src/application/repository/vendor.repository.ts` — add `getDoraRegister`.
- Modify `Clients/src/application/hooks/useVendors.ts` — add a hook for the register.
- Modify `Clients/src/presentation/components/Modals/NewVendor/*` — add a DORA section to the vendor form.
- Modify `Clients/src/presentation/pages/Vendors/*` — add the "ICT register" tab.
- Create `Clients/src/presentation/pages/Vendors/DoraRegister/index.tsx` — the register table + export.

---

## Task 1: Migration — add DORA fields to `vendors`

**Files:**
- Create: `Servers/database/migrations/<ts>-add-dora-fields-to-vendors.js`

**Interfaces:**
- Produces: 7 new columns on `verifywise.vendors`: `is_ict_provider` (BOOLEAN), `ict_service_type` (ENUM), `function_criticality` (ENUM), `substitutability` (ENUM), `has_exit_plan` (BOOLEAN), `country_of_provision` (VARCHAR), `provider_lei` (VARCHAR).

- [ ] **Step 1: Generate the timestamp**

Run: `date +%Y%m%d%H%M%S` — use the output as `<ts>` in the filename.

- [ ] **Step 2: Write the migration**

Create `Servers/database/migrations/<ts>-add-dora-fields-to-vendors.js`:

```javascript
"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE verifywise.enum_vendors_ict_service_type AS ENUM (
          'Cloud services', 'Data analysis', 'Security services',
          'Network infrastructure', 'Software or applications',
          'IT project management', 'Other ICT services'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      DO $$ BEGIN
        CREATE TYPE verifywise.enum_vendors_function_criticality AS ENUM (
          'Critical', 'Important', 'Not critical'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      DO $$ BEGIN
        CREATE TYPE verifywise.enum_vendors_substitutability AS ENUM (
          'Easily substitutable', 'Difficult to substitute', 'Not substitutable'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      ALTER TABLE verifywise.vendors
        ADD COLUMN IF NOT EXISTS is_ict_provider BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS ict_service_type verifywise.enum_vendors_ict_service_type,
        ADD COLUMN IF NOT EXISTS function_criticality verifywise.enum_vendors_function_criticality,
        ADD COLUMN IF NOT EXISTS substitutability verifywise.enum_vendors_substitutability,
        ADD COLUMN IF NOT EXISTS has_exit_plan BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS country_of_provision VARCHAR(255),
        ADD COLUMN IF NOT EXISTS provider_lei VARCHAR(50);
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.vendors
        DROP COLUMN IF EXISTS is_ict_provider,
        DROP COLUMN IF EXISTS ict_service_type,
        DROP COLUMN IF EXISTS function_criticality,
        DROP COLUMN IF EXISTS substitutability,
        DROP COLUMN IF EXISTS has_exit_plan,
        DROP COLUMN IF EXISTS country_of_provision,
        DROP COLUMN IF EXISTS provider_lei;
      DROP TYPE IF EXISTS verifywise.enum_vendors_ict_service_type;
      DROP TYPE IF EXISTS verifywise.enum_vendors_function_criticality;
      DROP TYPE IF EXISTS verifywise.enum_vendors_substitutability;
    `);
  },
};
```

- [ ] **Step 3: Build and run the migration**

Run: `cd Servers && npm run build && npx sequelize db:migrate`
Expected: migration applies cleanly; `\d verifywise.vendors` shows the 7 new columns.

- [ ] **Step 4: Verify rollback works, then re-apply**

Run: `cd Servers && npx sequelize db:migrate:undo && npx sequelize db:migrate`
Expected: down then up both succeed.

- [ ] **Step 5: Confirm tenant-isolation audit still passes**

Run: `cd Servers && npx ts-node scripts/auditTenantIsolationCoverage.ts` (or the documented npm script if one exists — check `package.json`).
Expected: PASS. No new table was created (columns on existing registered `vendors`), so no `tenantIsolation.registry.ts` change is needed. If the audit flags anything, STOP and report.

- [ ] **Step 6: Commit**

```bash
git add Servers/database/migrations/<ts>-add-dora-fields-to-vendors.js
git commit -m "feat(dora): add ICT third-party register fields to vendors table"
```

---

## Task 2: Model + interface — expose DORA fields

**Files:**
- Modify: `Servers/domain.layer/models/vendor/vendor.model.ts`
- Modify: `Servers/domain.layer/interfaces/i.vendor.ts`

**Interfaces:**
- Consumes: the 7 columns from Task 1.
- Produces: `IVendor` and `VendorModel` carrying the 7 DORA fields with exact types below.

- [ ] **Step 1: Add fields to the `IVendor` interface**

In `Servers/domain.layer/interfaces/i.vendor.ts`, after `risk_score?: number;`, add:

```typescript
  // DORA Register of Information fields (descriptive)
  is_ict_provider?: boolean;
  ict_service_type?:
    | "Cloud services"
    | "Data analysis"
    | "Security services"
    | "Network infrastructure"
    | "Software or applications"
    | "IT project management"
    | "Other ICT services";
  function_criticality?: "Critical" | "Important" | "Not critical";
  substitutability?:
    | "Easily substitutable"
    | "Difficult to substitute"
    | "Not substitutable";
  has_exit_plan?: boolean;
  country_of_provision?: string;
  provider_lei?: string;
```

- [ ] **Step 2: Add matching columns to `VendorModel`**

In `Servers/domain.layer/models/vendor/vendor.model.ts`, after the `risk_score` column block, add (matching the existing decorator style):

```typescript
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  is_ict_provider?: boolean;

  @Column({
    type: DataType.ENUM(
      "Cloud services", "Data analysis", "Security services",
      "Network infrastructure", "Software or applications",
      "IT project management", "Other ICT services",
    ),
    allowNull: true,
  })
  ict_service_type?:
    | "Cloud services" | "Data analysis" | "Security services"
    | "Network infrastructure" | "Software or applications"
    | "IT project management" | "Other ICT services";

  @Column({
    type: DataType.ENUM("Critical", "Important", "Not critical"),
    allowNull: true,
  })
  function_criticality?: "Critical" | "Important" | "Not critical";

  @Column({
    type: DataType.ENUM(
      "Easily substitutable", "Difficult to substitute", "Not substitutable",
    ),
    allowNull: true,
  })
  substitutability?:
    | "Easily substitutable" | "Difficult to substitute" | "Not substitutable";

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  has_exit_plan?: boolean;

  @Column({ type: DataType.STRING, allowNull: true })
  country_of_provision?: string;

  @Column({ type: DataType.STRING, allowNull: true })
  provider_lei?: string;
```

- [ ] **Step 3: Build to typecheck**

Run: `cd Servers && npm run build`
Expected: compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add Servers/domain.layer/models/vendor/vendor.model.ts Servers/domain.layer/interfaces/i.vendor.ts
git commit -m "feat(dora): expose ICT register fields on vendor model and interface"
```

---

## Task 3: Persist DORA fields on create/update

**Files:**
- Modify: `Servers/utils/vendor.utils.ts` (`createNewVendorQuery` ~line 167, `updateVendorByIdQuery` ~line 325)
- Test: `Servers/tests/**/vendor.utils.test.ts` (create if a vendor utils test file does not exist; otherwise add to it)

**Interfaces:**
- Consumes: `IVendor` DORA fields from Task 2.
- Produces: create/update persist the 7 DORA fields; `getDoraRegisterQuery` added in Task 4 can read them.

- [ ] **Step 1: Write the failing test**

In the vendor utils test file, add a test that creating a vendor with `is_ict_provider: true` and `function_criticality: "Critical"` persists those values (mock the sequelize query and assert the replacements include the DORA keys). Model it on the existing create-vendor test in the file; if none exists, assert on the `replacements` object shape the query builds:

```typescript
it("includes DORA fields in the create replacements when provided", async () => {
  const vendor = {
    vendor_name: "ACME Cloud", vendor_provides: "Hosting", assignee: 1,
    website: "https://acme", vendor_contact_person: "Jo",
    is_ict_provider: true, ict_service_type: "Cloud services",
    function_criticality: "Critical", substitutability: "Not substitutable",
    has_exit_plan: false, country_of_provision: "IE", provider_lei: "LEI123",
  };
  // ...invoke createNewVendorQuery with a mocked transaction/sequelize...
  // assert the built replacements contain is_ict_provider, ict_service_type,
  // function_criticality, substitutability, has_exit_plan,
  // country_of_provision, provider_lei
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Servers && npm run test -- vendor.utils`
Expected: FAIL (DORA keys absent from replacements).

- [ ] **Step 3: Extend the dynamic field lists**

In `createNewVendorQuery` (`Servers/utils/vendor.utils.ts`), append the DORA fields to the `fields`, `values`, and `replacements` structures the same way existing optional fields are appended (follow the pattern already used for `data_sensitivity`/`business_criticality`). For each of the 7 fields add its name to `fields` and `values` and set `replacements.<field> = vendor.<field> ?? null` (use `false` default for the two booleans if undefined). Do the same in `updateVendorByIdQuery`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Servers && npm run test -- vendor.utils`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/vendor.utils.ts Servers/tests
git commit -m "feat(dora): persist ICT register fields on vendor create and update"
```

---

## Task 4: Backend endpoint — `GET /api/vendors/dora-register`

**Files:**
- Modify: `Servers/utils/vendor.utils.ts` (add `getDoraRegisterQuery`)
- Modify: `Servers/controllers/vendor.ctrl.ts` (add `getDoraRegister`)
- Modify: `Servers/routes/vendor.route.ts` (add route)
- Test: vendor utils test file

**Interfaces:**
- Consumes: DORA columns; `organizationId`.
- Produces: `getDoraRegisterQuery(organizationId: number): Promise<IVendor[]>` returning org-scoped vendors where `is_ict_provider = true`. Route `GET /api/vendors/dora-register`.

- [ ] **Step 1: Write the failing test**

Add a test asserting `getDoraRegisterQuery` issues a query filtered by `organization_id = :organizationId AND is_ict_provider = true`:

```typescript
it("getDoraRegisterQuery filters by org and is_ict_provider", async () => {
  // mock sequelize.query; call getDoraRegisterQuery(7)
  // assert the SQL contains "is_ict_provider" and replacements.organization_id === 7
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Servers && npm run test -- vendor.utils`
Expected: FAIL (`getDoraRegisterQuery` not exported).

- [ ] **Step 3: Implement `getDoraRegisterQuery`**

In `Servers/utils/vendor.utils.ts`, following the shape of `getAllVendorsQuery` (line 20):

```typescript
export const getDoraRegisterQuery = async (
  organizationId: number,
): Promise<IVendor[]> => {
  const result = await sequelize.query(
    `SELECT * FROM vendors
     WHERE organization_id = :organization_id AND is_ict_provider = true
     ORDER BY vendor_name ASC`,
    {
      replacements: { organization_id: organizationId },
      type: QueryTypes.SELECT,
    },
  );
  return result as IVendor[];
};
```

- [ ] **Step 4: Add the controller handler**

In `Servers/controllers/vendor.ctrl.ts`, following the existing `getAllVendors` handler pattern (thin, `logProcessing`/`logSuccess`/`logFailure`, `STATUS_CODE`):

```typescript
export async function getDoraRegister(req: Request, res: Response) {
  logProcessing({ description: "getDoraRegister", functionName: "getDoraRegister", fileName: "vendor.ctrl.ts" });
  try {
    const rows = await getDoraRegisterQuery(req.organizationId);
    logSuccess({ /* ...as in getAllVendors... */ });
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    logFailure({ /* ...as in getAllVendors... */ });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
```

Import `getDoraRegisterQuery` at the top alongside the other vendor utils imports.

- [ ] **Step 5: Register the route BEFORE `/:id`**

In `Servers/routes/vendor.route.ts`, add the register route ABOVE `router.get("/:id", ...)` so `dora-register` is not captured by the `:id` param:

```typescript
router.get("/dora-register", authenticateJWT, getDoraRegister);
```

Import `getDoraRegister` in the controller import block.

- [ ] **Step 6: Run tests + build**

Run: `cd Servers && npm run test -- vendor.utils && npm run build`
Expected: PASS + clean build.

- [ ] **Step 7: Regenerate API docs and check drift**

Run: `cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift`
Expected: no drift after committing regenerated files.

- [ ] **Step 8: Commit**

```bash
git add Servers/utils/vendor.utils.ts Servers/controllers/vendor.ctrl.ts Servers/routes/vendor.route.ts Servers/swagger.yaml Servers/docs/api-docs/src/config/endpoints.ts Servers/tests
git commit -m "feat(dora): add GET /api/vendors/dora-register endpoint"
```

---

## Task 5: Frontend — interface, repository, hook

**Files:**
- Modify: `Clients/src/domain/interfaces/i.vendor.ts`
- Modify: `Clients/src/application/repository/vendor.repository.ts`
- Modify: `Clients/src/application/hooks/useVendors.ts`

**Interfaces:**
- Consumes: `GET /api/vendors/dora-register`.
- Produces: `getDoraRegister(): Promise<Vendor[]>` in the repository; a `useDoraRegister()` (or extended `useVendors`) hook returning the register rows; frontend `Vendor` type carrying the DORA fields.

- [ ] **Step 1: Add DORA fields to the frontend vendor interface**

In `Clients/src/domain/interfaces/i.vendor.ts`, add the same 7 fields (mirroring the backend union types) to the vendor interface.

- [ ] **Step 2: Add the repository method**

In `Clients/src/application/repository/vendor.repository.ts`, following the existing `getAllVendors` pattern, add:

```typescript
export async function getDoraRegister(): Promise<Vendor[]> {
  const response = await apiServices.get("/vendors/dora-register");
  return response.data.data as Vendor[];
}
```

(Match the actual axios wrapper + envelope unwrapping the file already uses.)

- [ ] **Step 3: Add the React Query hook**

In `Clients/src/application/hooks/useVendors.ts`, add a `useDoraRegister` hook mirroring the existing vendors query hook, keyed `["dora-register"]`, calling `getDoraRegister`.

- [ ] **Step 4: Typecheck**

Run: `cd Clients && npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add Clients/src/domain/interfaces/i.vendor.ts Clients/src/application/repository/vendor.repository.ts Clients/src/application/hooks/useVendors.ts
git commit -m "feat(dora): frontend vendor DORA fields, repository, and register hook"
```

---

## Task 5b: Frontend — the DORA-installed gate hook

**Files:**
- Create: `Clients/src/application/hooks/useDoraActive.ts`
- Test: `Clients/src/application/hooks/__tests__/useDoraActive.test.ts`

**Interfaces:**
- Produces: `useDoraActive(): { doraActive: boolean; loading: boolean }` — true only when the DORA framework is INSTALLED/ASSIGNED for the org (not merely present in the catalog).

**Critical distinction:** `useFrameworks` exposes `allFrameworks` (the full catalog — DORA is in it for every org) and `filteredFrameworks` (frameworks actually assigned to the org's projects). The gate MUST use the installed/assigned set, NOT the catalog, or DORA UI would show for everyone. DORA is `is_organizational: true`, so confirm how organizational frameworks register as "installed" for an org (org-framework assignment, not project assignment). If the existing frameworks list does not distinguish organizational-installed cleanly, add a small backend helper `GET /api/frameworks/installed` returning the org's installed framework keys/ids and consume that instead.

- [ ] **Step 1: Determine the installed-frameworks source**

Read `Clients/src/application/hooks/useFrameworks.ts`, `Clients/src/application/repository/entity.repository.ts` (`getAllFrameworks`), and `Clients/src/presentation/pages/Framework/Settings/index.tsx` to see how the org's INSTALLED frameworks (esp. `is_organizational` ones like DORA) are determined today. Identify the concrete signal that means "DORA is installed for this org." If none exists on the frontend, note that Task 5b requires the backend helper described above and add it first (raw SQL over the org's framework assignments, org-scoped).

- [ ] **Step 2: Write the failing test**

```typescript
import { renderHook } from "@testing-library/react";
// mock the installed-frameworks source to include a DORA framework
it("doraActive is true when the DORA framework is installed for the org", () => {
  // mock returns [{ id: 9, name: "DORA", is_organizational: true }]
  // const { result } = renderHook(() => useDoraActive(), { wrapper });
  // expect(result.current.doraActive).toBe(true);
});
it("doraActive is false when DORA is not installed", () => {
  // mock returns [] or only non-DORA frameworks
  // expect(result.current.doraActive).toBe(false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd Clients && npm run test -- useDoraActive`
Expected: FAIL (`useDoraActive` not defined).

- [ ] **Step 4: Implement `useDoraActive`**

Implement over the installed-frameworks source identified in Step 1. Match DORA by framework key/id (prefer id `9` or key `dora`; fall back to `name.toLowerCase().includes("dora")` only if key/id is unavailable). Return `{ doraActive, loading }`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd Clients && npm run test -- useDoraActive`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add Clients/src/application/hooks/useDoraActive.ts Clients/src/application/hooks/__tests__/useDoraActive.test.ts
git commit -m "feat(dora): add useDoraActive gate hook (DORA-framework-installed check)"
```

---

## Task 6: Frontend — DORA section in the vendor form

**Files:**
- Modify: `Clients/src/presentation/components/Modals/NewVendor/*` (the vendor add/edit form)

**Interfaces:**
- Consumes: the frontend `Vendor` type DORA fields (Task 5); `useDoraActive()` (Task 5b).
- Produces: the vendor create/edit payload includes the 7 DORA fields — the section renders ONLY when `doraActive`.

- [ ] **Step 1: Locate the form's field-render + state**

Read the NewVendor modal component(s). Identify where existing optional fields (e.g. `data_sensitivity`, `business_criticality`) are rendered as `Select`s and wired into form state + submit payload.

- [ ] **Step 2: Add a GATED collapsible "ICT provider (DORA)" section**

Call `useDoraActive()`. Wrap the entire section in `{doraActive && ( ... )}` so nothing DORA renders when the org lacks DORA. Inside: a `Toggle`/checkbox for `is_ict_provider`. When on, reveal `Select`s for `ict_service_type`, `function_criticality`, `substitutability`, a toggle for `has_exit_plan`, and `Field` inputs for `country_of_provision` and `provider_lei`. Use VerifyWise `Select`/`Field`/`Toggle`, sentence-case labels, 30px control height. Wire each into form state and the submit payload.

- [ ] **Step 3: Add i18n strings**

Add de/fr/es entries for every new label to `Clients/src/.../i18n/translations.ts`.

- [ ] **Step 4: Typecheck + i18n audit**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add Clients/src/presentation/components/Modals/NewVendor Clients/src/**/i18n/translations.ts
git commit -m "feat(dora): add ICT provider section to the vendor form"
```

---

## Task 7: Frontend — the "ICT register" tab + export

**Files:**
- Create: `Clients/src/presentation/pages/Vendors/DoraRegister/index.tsx`
- Modify: `Clients/src/presentation/pages/Vendors/*` (tab host)

**Interfaces:**
- Consumes: `useDoraRegister()` (Task 5); `useDoraActive()` (Task 5b).
- Produces: a new tab rendering the register table with search + CSV export — the tab renders ONLY when `doraActive`.

- [ ] **Step 1: Locate the Vendors page tab structure**

Read `Clients/src/presentation/pages/Vendors/index.tsx`. It already uses `TabBar` + `TabContext`/`TabPanel` from `@mui/lab`. Call `useDoraActive()`. Conditionally include the "ICT register" `<Tab>` + its `<TabPanel>` only when `doraActive` — so the tab is entirely absent (not just disabled) for orgs without DORA. Guard the tab-index/value logic so removing the tab does not break the existing "Vendors" tab selection.

- [ ] **Step 2: Build the register table component**

Create `DoraRegister/index.tsx`: call `useDoraRegister()`, render a `CustomizableBasicTable` with columns: Vendor, ICT service type, Function criticality, Substitutability, Exit plan, Country, LEI. Add a `SearchBox` filtering by vendor name. Empty state via `EmptyState` when no ICT providers exist ("No ICT providers yet. Mark a vendor as an ICT provider to add it to the register.").

- [ ] **Step 3: Add CSV export**

Add a `CustomizableButton` ("Export register") that serializes the current rows to CSV (submission-shaped column order: provider name, LEI, ICT service type, function criticality, substitutability, exit plan, country of provision) and triggers a client-side download. Reuse any existing CSV/export util in the repo if present; otherwise a small local `toCsv(rows)` helper.

- [ ] **Step 4: Add i18n strings**

Add de/fr/es entries for the tab label, column headers, empty-state, and export button.

- [ ] **Step 5: Typecheck + i18n + format**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add Clients/src/presentation/pages/Vendors
git commit -m "feat(dora): add ICT register tab with search and CSV export to Vendors"
```

---

## Task 8: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full backend gate**

Run: `cd Servers && npm run build && npm run test -- vendor`
Expected: build clean, vendor tests pass.

- [ ] **Step 2: Full frontend gate**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`
Expected: all pass.

- [ ] **Step 3: Manual smoke — DORA active (running app)**

With the DORA framework installed for the org: create a vendor, mark it an ICT provider with criticality "Critical", save. Open the "ICT register" tab → the vendor appears. Export → CSV downloads with the DORA columns. Un-mark it → it disappears from the register.

- [ ] **Step 4: Manual smoke — DORA NOT active (the leak test)**

Use an org WITHOUT the DORA framework installed. Confirm: NO "ICT register" tab in Vendors, and NO DORA section in the vendor add/edit form. Nothing DORA is visible anywhere. This is the hard requirement — if any DORA UI shows, STOP and fix the gate.

- [ ] **Step 5: Confirm risk score untouched**

Verify the vendor's `risk_score` is unchanged by any DORA field edit (descriptive-only constraint).

---

## Self-Review Notes

- **Spec coverage:** B1 (Task 1–2), B2 (Task 3–4), B3 export (Task 7), B4 tab+drawer (Task 6–7), B5 risk untouched (constraint + Task 8 step 5), B6 truthful copy (constraint + labels), **visibility gating (Task 5b + gates in Task 6/7 + leak test Task 8 step 4)**. All covered.
- **Gate uses INSTALLED frameworks, not the catalog** — Task 5b step 1 explicitly resolves this (DORA is in every org's catalog; the gate must key off org-installed `is_organizational` framework assignment). If the frontend can't distinguish installed cleanly, Task 5b adds a backend `GET /api/frameworks/installed` helper.
- **Slots deliberately NOT used** — verified they don't exist on this branch; gating is a runtime framework-installed boolean.
- **Route ordering:** `dora-register` registered before `/:id` (Task 4 step 5) — avoids param capture.
- **No new table** → no `tenantIsolation.registry.ts` change; audit still run (Task 1 step 5).
- **Follow-up plan (separate):** Workstream A — deepen the DORA plugin catalog to three-level in `plugin-marketplace`. Blocked on restoring the missing `build:framework-plugins` tooling. Not in this plan.
