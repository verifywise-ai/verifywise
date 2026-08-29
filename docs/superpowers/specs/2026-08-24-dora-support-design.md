# DORA support — design spec

> **Date:** 2026-08-24
> **Status:** Approved design, pre-implementation
> **Scope:** Two independent workstreams across two repos. DORA (EU Digital Operational Resilience Act) support.

## Context

DORA already exists in VerifyWise in three places (verified, not assumed):

| Location | What it is | Depth |
|---|---|---|
| Main app generic engine (`Servers/structures/DORA/dora.structure.ts`) | Seeded framework id `9`, key `dora`, renders through the generic framework page | 5 pillars / 16 requirements, `two_level` |
| Plugin (`plugin-marketplace/plugins/dora/`) | Registered, built framework plugin — in `plugins.json`, 7 UI slots, `dist/` committed | 5 pillars / 14 requirements, `two_level`, already carries `questions` + `evidence_examples` |
| Import seed (`plugin-marketplace/packages/custom-framework-ui/src/templates/dora.json`) | In-app "import a framework" catalog copy | 5 pillars, `two_level` |

So the compliance-requirements side of DORA is **already shipped**. This build does two things the codebase does **not** yet have:

1. **Deepen the DORA plugin catalog** to the richer three-level shape (content work).
2. **Register of Information** — a live ICT third-party inventory over the Vendors module (greenfield engineering). This does not exist anywhere (`grep` for register-of-information / third-party-risk-register returned nothing across both repos).

### Plugin vs. embedded — the architecture split (read this first)

The two workstreams sit on **opposite sides** of the plugin boundary, and this is a hard structural constraint, not a preference:

- **Workstream A (catalog) is a pure plugin.** It lives entirely in `plugin-marketplace/plugins/dora/`. Nothing touches verifywise core.
- **Workstream B (Register) is embedded in verifywise core — it cannot be a plugin.** The plugin framework engine (`createFrameworkPlugin` / `custom-framework-base`) only renders a requirements→controls→evidence tree over its own isolated struct/impl tables. It has **no access to the core `vendors` tables.** The Register of Information is by definition a live view over the vendor estate, so it must read/write `verifywise.vendors` — which only core code can do.

Making the Register a plugin would force it into a self-contained, hand-entered inventory in the plugin's own tables — i.e. the disconnected "spreadsheet you fill in once" point-tool the blog post explicitly attacks. The embedded approach is the one consistent with the blog's thesis. This is why B extends Vendors in the main app and the "inside the DORA plugin" option was rejected as a dead end.

### Visibility gating — no DORA UI unless DORA is active (HARD REQUIREMENT)

Because B's code lives in verifywise core, its UI must NOT appear for orgs that do not have DORA. This is a hard requirement: an org without DORA must see zero DORA UI anywhere (no ICT register tab, no DORA section in the vendor form).

**Verified mechanism (as of this branch):** the plugin UI-slot system (`PluginSlot` / `usePlugins` / `ui.slots`) **does not exist on `develop` or `feat/dora-support-design`** — it lives only on the unmerged `hp-aug-7-migrate-plugins-custom-frameworks` branch, and the DORA plugin on disk has no `plugins.json`/`ui.slots` config. Nothing in the main app loads plugin UI bundles at runtime. Building against slots is therefore NOT an option here.

**Gate used instead — runtime "is the DORA framework installed for this org?" check.** DORA ships today as an `is_organizational` framework (id `9`, key `dora`) registered via `Servers/utils/frameworkRegistry.utils.ts` and the `frameworks` table. The UI is gated on whether the org has the DORA framework installed/assigned (mirroring how `Framework/Settings` already inspects the org's frameworks list). DORA not installed → the gate boolean is false → the ICT register tab and the vendor-form DORA section do not render. This is a plain runtime boolean, no slots, no bundle loading.

The 7 DB columns on the shared `vendors` table are always present once migrated (a shared table cannot be per-plugin) but are inert and invisible unless DORA is active — accepted. Only the UI is gated; the `GET /api/vendors/dora-register` endpoint stays available but nothing surfaces it without the gate.

### Alignment with the DORA blog post

The unpublished blog draft (`docs/research/drafts/stop-shopping-for-dora-compliance-software.mdx`) argues: DORA is not a point tool you buy; the Register of Information is "a view you run over your vendor estate, not a spreadsheet you produce"; DORA is one framework mapped onto a control environment you already run. This design delivers exactly that thesis — the seeded catalog is "DORA on the spine," and the Register is a live view over Vendors. **No contradiction.** The one copy risk is the blog's "not a pre-built checklist" line vs. shipping a seeded catalog; that is a wording fix in the blog, not a design conflict.

---

## Workstream A — Deepen the DORA plugin catalog (`plugin-marketplace`)

Content build, not engineering. The plugin exists, is registered, and renders. Current shape is `two_level` (5 pillars / 14 requirements) and already carries `questions` + `evidence_examples` on level-2 items.

### Change
Rewrite `plugins/dora/template.json` from `two_level` → `three_level`, matching the OSFI E-23 pattern (`plugins/osfi-e23/template.json`):

- **Level 1 = Pillar** (5, unchanged): ICT Risk Management, ICT Incident Management, Digital Operational Resilience Testing, Third-Party ICT Risk, Information Sharing.
- **Level 2 = Requirement / Article area** — carries `summary`, `questions[]`, `evidence_examples[]`.
- **Level 3 = specific obligation** (`items[]`) — the granular, auditable requirements.

Field shape per the verified TS contract in `packages/custom-framework-base/index.ts` (`FrameworkLevel1/2/3`): each node has `title`, `description?`, `order_no`, and (L2/L3) `summary?`, `questions?: string[]`, `evidence_examples?: string[]`, `metadata?`.

Content sourced from Regulation (EU) 2022/2554 (Articles 5–49) plus the relevant RTS. Also update `packages/custom-framework-ui/src/templates/dora.json` (the in-app import copy) to the same structure.

Keep the `plugins.json` DORA entry (already registered, 7 slots); optionally bump `version` and enrich `features[]`. Watch category casing: `plugins.json` uses lowercase `"compliance"`; `template.json` category is free-form.

### Blocker (dependency, not solved here)
The build scripts referenced in docs/`package.json` (`npm run build:framework-plugins`, `scripts/build-framework-plugins.js`) are **missing from disk** — `scripts/` is empty. `dist/index.js` and `ui/dist/` are committed pre-built. Rewriting `template.json` cannot be rebuilt via the documented command as-is. Resolution options: (a) restore the build tooling, or (b) regenerate `dist/index.js` by hand (the `index.ts` wrapper is trivial and already correct, importing `./template.json`). **Must be resolved before Workstream A ships.**

---

## Workstream B — Register of Information (main app, extend Vendors)

Greenfield engineering. The Register is a **live view over the Vendors estate**, not a fork or a separate inventory.

### B1 — Data model (extend `vendors`, do not fork)

One migration adding nullable DORA columns to `verifywise.vendors` (all nullable → existing vendors unaffected). Migration uses `verifywise.` prefix per `Servers/CLAUDE.md`; `addColumn` with unqualified names is acceptable for simple additions.

New columns:
- `is_ict_provider` BOOLEAN DEFAULT false — is this vendor in DORA's ICT third-party scope
- `ict_service_type` ENUM — RTS service-type taxonomy (cloud services, data analysis, security services, network infrastructure, software/apps, etc.)
- `function_criticality` ENUM('Critical','Important','Not critical') — supports a critical or important function
- `substitutability` ENUM('Easily substitutable','Difficult to substitute','Not substitutable')
- `has_exit_plan` BOOLEAN DEFAULT false
- `country_of_provision` VARCHAR — country where the ICT service is provided
- `provider_lei` VARCHAR — Legal Entity Identifier

Update `VendorModel` (`Servers/domain.layer/models/vendor/vendor.model.ts`) and `IVendor` interface accordingly.

**Tenant isolation:** columns are on the already-registered `vendors` table, so no new `tenantIsolation.registry.ts` entry is required. Confirm the schema-drift audit (`Servers/scripts/auditTenantIsolationCoverage.ts`) passes after the migration.

### B2 — Backend

Thin controller → utils (raw SQL, unqualified names, `organization_id` replacement).

- `GET /api/vendors/dora-register` — returns org-scoped vendors where `is_ict_provider = true`, shaped to the register columns. Register in `app.ts` route file (`routes/vendor.route.ts`), apply `authenticateJWT`.
- Extend existing vendor create/update to accept the new fields.
- Regenerate OpenAPI: `npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift`; commit generated files (CI `api-docs-drift` gate).

### B3 — Export

Submission-shaped export (CSV/XLSX) of the register — "the report you run." Core RTS fields mapped to columns. **v1 fidelity = core fields, submission-shaped** (not full ~15-template RTS fidelity). Structured so full-template fidelity is an extension, not a rewrite.

### B4 — Frontend

New **"ICT register"** tab inside the existing Vendors module (decided: Vendors tab, not the framework page). DORA framework page may deep-link to it later (out of scope for v1).

**Both the tab and the vendor-form DORA section are gated on the DORA-framework-installed check** (see "Visibility gating" above). Org without DORA → neither renders.

- Reuse `CustomizableBasicTable` (register rows), `SearchBox`, `CustomizableButton` (export).
- Extend the existing vendor drawer with a DORA section (the new fields), gated/shown when `is_ict_provider`.
- Repository/hook/types follow the frontend clean-architecture pattern (`application/repository`, `application/hooks`, `domain/interfaces`).

### B5 — Risk scoring

**Descriptive only in v1** (decided). The DORA fields are inventory data; the existing vendor `risk_score` formula is **not** touched. No regression risk to current scoring. Feeding criticality/substitutability into the score is a deliberate future extension.

### B6 — Truthful copy

UI labels avoid compliance guarantees. Use "ICT third-party register," "supports the DORA Register of Information" — never "DORA compliant" as a guarantee. Matches the blog and the standing truthful-copy rule (`feedback_truthful_copy`).

### Data flow

```
Vendor drawer (DORA section)
   → vendors table (new columns)
      → GET /api/vendors/dora-register  (org-scoped, is_ict_provider = true)
         → ICT register tab (table + search)
         → Export (CSV/XLSX, submission-shaped)
```

Live view: updates as vendors change. This is the blog's "register is a view you run," made real.

---

## Testing

- **Backend:** unit tests for the register utils (org scoping, `is_ict_provider` filter), controller happy-path + auth. Migration up/down.
- **Frontend:** component tests for the register tab and the extended drawer section.
- **Isolation:** confirm `auditTenantIsolationCoverage.ts` passes (no new table, but verify).
- **Gates (run from package dirs):** `cd Servers && npm run build`; `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`. New user-facing strings need de/fr/es in `i18n/translations.ts`.

## Out of scope (v1)

- Full ~15-template RTS submission fidelity.
- DORA-specific incident-reporting timeline logic (strict initial/intermediate/final report clocks) — could reuse the Incidents domain later.
- Feeding DORA fields into vendor risk score.
- DORA framework dashboard custom tiles / cross-link (Register lives in Vendors for v1).
- Restoring the plugin-marketplace build tooling (tracked as a Workstream A dependency, not built here).

## Sequencing

Workstreams A and B are independent and ship separately. B (the Register) is the sharper differentiator and the blog's payload; A (catalog depth) is lower-risk content work.
