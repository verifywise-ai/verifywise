# Adding a New Compliance Framework

This guide covers adding a framework to the **structure registry** in
`Servers/structures/`. The 21 bundled frameworks (ids 5–25: SOC 2, GDPR, HIPAA,
...) work this way. A registry framework needs no custom tables, routes,
controllers or UI. You declare its hierarchy in one TypeScript file, and the
generic endpoints (`/api/frameworks/:frameworkId/...`) and the generic UI
(`GenericFramework` + `GenericFrameworkDrawer`) handle the rest.

> **Users cannot create frameworks.** There is no UI or API for creating,
> importing, editing or exporting a framework structure. Every framework ships
> in the codebase. A new framework means a code change and a migration.

## Core frameworks vs registry frameworks

| | Core (hand-built) | Registry (structure file) |
|---|---|---|
| Frameworks | EU AI Act (1), ISO 42001 (2), ISO 27001 (3), NIST AI RMF (4) | 21 frameworks, ids 5–25 |
| Structure | Hand-written files in `Servers/structures/{EU-AI-Act,ISO-42001,ISO-27001,NIST-AI-RMF}/`, not in the registry | One `*.structure.ts` per framework, listed in `FRAMEWORK_STRUCTURES` |
| Tables | Bespoke (`controls_eu`, `subclauses_iso`, `subclauses_iso27001`, `nist_ai_rmf_subcategories`, ...) | Generated from the structure's `tables` / `cols` |
| API | Per-framework routers (`/api/eu-ai-act`, `/api/iso-42001`, `/api/iso-27001`, `/api/nist-ai-rmf`) | Generic `/api/frameworks/:frameworkId/...` |
| UI | Per-framework pages | `GenericFramework` + `GenericFrameworkDrawer` |
| Reports | Covered by the reporting service | **Not covered yet** (see [Compliance Frameworks](../domains/compliance-frameworks.md#reporting-limitation)) |

Add new frameworks through the registry, not as core frameworks.

## How a registry framework works

```
Servers/structures/<Name>/<key>.structure.ts   ← declares id, tables, seed
        │
        ├─► Servers/structures/index.ts (FRAMEWORK_STRUCTURES, getStructureById/ByKey)
        │
        ├─► migrations (compiled: require("../../dist/structures"))
        │     frameworks row + struct tables + seed, impl tables, __risks tables
        │
        ├─► Servers/utils/frameworkRegistry.utils.ts
        │     makeCreate(key) / makeDelete(key) → add/remove framework on a project
        │
        └─► Servers/utils/frameworkImpl.utils.ts + routes/frameworkImpl.route.ts
              tree, dashboard, impl read/update, risks, evidence
```

Per framework, the tables are:

| Table (from `tables`) | Scope | Contents |
|---|---|---|
| `l1_struct` | Global | Level 1 groupings (e.g. SOC 2 trust service categories) |
| `l2_struct` | Global | Level 2 items: title, description, summary, `questions[]`, `evidence_examples[]` |
| `l3_struct` (three-level only) | Global | Level 3 items, same columns |
| `l2_impl` / `l3_impl` | Per org + project | Status, owner, reviewer, approver, due date, implementation details, auditor feedback |
| `l2_risks` / `l3_risks` | Per org | `<impl>__risks` junction to `risks` |

Evidence goes in `file_entity_links` (`framework_type` = the structure's
`framework_type`, `entity_type` = `entity_types.l2_impl` / `l3_impl`).

## Worked example: the SOC 2 structure file

Two-level frameworks can start from `Servers/structures/SOC2/soc2.structure.ts`.
For three levels, use `HIPAA/hipaa.structure.ts` or
`NIST-CSF/nist-csf.structure.ts`. The shape is defined in
`Servers/structures/types.ts` (`FrameworkStructure`).

This is the real SOC 2 file, cut down to one level 1 group with one level 2
item:

```ts
// Servers/structures/SOC2/soc2.structure.ts
import type { FrameworkStructure } from "../types";

export const soc2Structure: FrameworkStructure = {
  id: 5,                       // fixed frameworks.id; must be unique and unused
  key: "soc2",                 // kebab-case; used for lookups and folder naming
  framework_type: "soc2",      // snake_case; stored in file_entity_links.framework_type
  displayName: "SOC 2 Type II Framework",
  tables: {
    l1_struct: "soc2_trust_service_categories_struct",
    l2_struct: "soc2_controls_struct",
    l2_impl: "soc2_controls",
    l2_risks: "soc2_controls__risks",
  },
  cols: {
    l2_struct_parent: "trust_service_category_id", // FK column l2_struct → l1_struct
    l2_impl_meta: "control_meta_id",               // FK column l2_impl → l2_struct
    l2_risks_impl: "control_id",                   // FK column l2_risks → l2_impl
  },
  entity_types: {
    l2_impl: "control",        // file_entity_links.entity_type
  },
  source_labels: {
    control: "SOC 2 controls", // files.source label; must be a FileSource value
  },
  seed: {
    name: "SOC 2 Type II Framework",  // frameworks.name, shown in the UI
    description: "Framework based on AICPA Trust Services Criteria for SOC 2 compliance",
    version: "1.0.0",
    is_organizational: true,          // true = organization-level, false = use-case-level
    hierarchy: {
      type: "two_level",              // or "three_level"; must match whether tables.l3_struct is set
      level1_name: "Trust Service Category",
      level2_name: "Control",
    },
    structure: [
      {
        title: "CC1: Control Environment",
        description:
          "The set of standards, processes, and structures that provide the basis for carrying out internal control",
        order_no: 1,
        items: [
          {
            title: "CC1.1 - Commitment to Integrity and Ethics",
            description: "The entity demonstrates a commitment to integrity and ethical values",
            order_no: 1,
            summary: "Establish and communicate ethical standards",
            questions: [
              "Is there a code of conduct?",
              "How are ethical standards communicated?",
              "How are violations handled?",
            ],
            evidence_examples: [
              "Code of conduct",
              "Ethics training records",
              "Disciplinary action records",
            ],
          },
        ],
      },
    ],
  },
};

export default soc2Structure;
```

Seed field rules (`types.ts`):

- Level 1 (`SeedLevel1`): `title` is required. `description`, `order_no` and
  `items` are optional.
- Level 2 / level 3 (`SeedLevel2` / `SeedLevel3`): `title` is required.
  `description`, `summary`, `questions[]`, `evidence_examples[]` and `order_no`
  are optional. A level 2 item has nested `items` only in a three-level
  framework.
- `hierarchy.level*_name` values are for documentation only.
- The struct migration throws if `seed.hierarchy.type` doesn't match whether
  `tables.l3_struct` is set.

Three-level frameworks also set:

- `tables.l3_struct`, `tables.l3_impl`, `tables.l3_risks`
- `cols.l3_struct_parent`, `cols.l3_impl_meta`, `cols.l3_impl_parent`,
  `cols.l3_risks_impl`
- `entity_types.l3_impl` and a matching `source_labels` entry

`hipaa.structure.ts` shows all of them.

## Steps

### 1. Write the structure file

Create `Servers/structures/<Name>/<key>.structure.ts` with a default export.
Use the next unused id. Ids 1–25 are taken, so the next is **26**. Check the
registry and `SELECT max(id) FROM verifywise.frameworks` first. Table names
must not collide with existing tables.

### 2. Register it

Add the import and the entry to `FRAMEWORK_STRUCTURES` in
`Servers/structures/index.ts`.

### 3. Add the create/delete wrappers

In `Servers/utils/frameworkRegistry.utils.ts`:

```ts
// <Name> (id=26)
export const create<Name>FrameworkQuery = makeCreate("<key>");
export const deleteProjectFramework<Name>Query = makeDelete("<key>");
```

### 4. Map the id

In `Servers/types/framework.type.ts`, import the two wrappers and add:

- `26: create<Name>FrameworkQuery` to `frameworkAdditionMap`
- `26: deleteProjectFramework<Name>Query` to `frameworkDeletionMap`
- `26: []` to `frameworkFilesDeletionSourceMap`. Registry frameworks clean up
  their own `file_entity_links`.

### 5. File source labels

Add each `source_labels` value to `Servers/domain.layer/models/file/file.model.ts`
in two places: the `FileSource` type union, and the `DataType.ENUM(...)` list on
the `source` column. The database column is `VARCHAR(255)`, so no schema change
is needed.

### 6. Notes

`GenericFramework` turns on the drawer's **Notes** tab with
`notesAttachedTo = "<FRAMEWORK_TYPE>_<ENTITY_TYPE>"` in upper case (e.g.
`SOC2_CONTROL`, `HIPAA_IMPLEMENTATION_SPECIFICATION`). Add one value per
entity type to `NotesAttachedToEnum` in
`Servers/domain.layer/models/notes/notes.model.ts`. The model rejects values
outside the enum. The column is `VARCHAR(50)`, so keep the value within 50
characters.

### 7. Tenant-isolation audit

Add the new `l2_impl` and `l2_risks` tables (and `l3_impl` / `l3_risks`, if
any) to `Servers/scripts/auditTenantIsolationCoverage.ts`, following the
existing per-framework entries. CI (`.github/workflows/backend-checks.yml`)
runs this script.

### 8. Write a new migration

Do **not** edit the `20260805*` migrations. Existing databases have already
run them, so they would never pick up a new registry entry. Create a new
migration with a `date`-generated timestamp (see `Servers/CLAUDE.md`) that, for
your key only:

1. inserts the `frameworks` row (`id`, `name`, `description`, `version`,
   `is_organizational`, `is_active = TRUE`, `is_demo = FALSE`)
2. creates the struct tables and seeds them from `seed.structure`, as in
   `20260805125946-create-framework-struct-tables.js`
3. creates the status enum, impl table(s) and `__risks` table(s), as in
   `20260805130326-create-framework-impl-tables.js`

Load your entry with
`const { requireStructureByKey } = require("../../dist/structures")`.

**Make it idempotent.** The `20260805*` migrations loop over the whole
`FRAMEWORK_STRUCTURES` array. On a **fresh** database they run with your
registry change in place and create your framework themselves, before your
migration runs. Guard your migration, for example by returning early when
`SELECT 1 FROM verifywise.frameworks WHERE id = :id` finds a row. Without a
guard, its `INSERT` and `CREATE TABLE` statements fail on new installs.

### 9. Build before migrating

Migrations `require("../../dist/structures")`, the **compiled** registry. Run
the build first:

```bash
cd Servers
npm run build        # compiles structures/ into dist/structures
npm run migrate-db
```

`npm run watch` (tsc-watch, then `postbuild` + `start`, which runs
`migrate-db`) and the Dockerfile (`RUN npm run build`) already build first. A
bare `npm run migrate-db` on a stale `dist/` won't see your framework.

### 10. Client

- Add a badge SVG to `Clients/public/assets/badges/`. Add an entry in
  `Clients/src/presentation/tools/frameworkBadge.ts` keyed by the **exact**
  `seed.name`. With no entry, callers render a fallback icon.
- No other client code is needed. The framework appears in the **AI
  Frameworks** add/remove modal: under **Frameworks → Manage frameworks** if
  `is_organizational` is true, or in a use case's **Frameworks/regulations**
  tab if false. `GenericFramework` (`Clients/src/presentation/pages/Framework/Generic/`)
  and `GenericFrameworkDrawer` (`Clients/src/presentation/components/Drawer/GenericFrameworkDrawer/`)
  render it.

### 11. API docs

A registry framework adds no routes, so `Servers/swagger.yaml` doesn't change.
Run `npm run generate:swagger` and `npm run generate:endpoints` only if you
also changed routes.

## Checklist

- [ ] `<key>.structure.ts` with a unique id, key, `framework_type` and table names
- [ ] Added to `FRAMEWORK_STRUCTURES`
- [ ] `makeCreate` / `makeDelete` wrappers
- [ ] `frameworkAdditionMap`, `frameworkDeletionMap`, `frameworkFilesDeletionSourceMap`
- [ ] `FileSource` union + `source` column `DataType.ENUM` list
- [ ] `NotesAttachedToEnum` values
- [ ] Tenant-isolation audit entries
- [ ] New, idempotent migration; `npm run build` then `npm run migrate-db`
- [ ] Badge SVG + `frameworkBadge.ts` entry
- [ ] Added to a project in the UI; requirements show "Not started"; status,
      evidence and risk links save; removing the framework deletes its impl rows

## Related documentation

- [Compliance Frameworks](../domains/compliance-frameworks.md)
- [Extensions](../infrastructure/extensions.md) (integrations, which are separate from frameworks)
- [Reporting](../domains/reporting.md)
- [Adding New Feature](./adding-new-feature.md)
