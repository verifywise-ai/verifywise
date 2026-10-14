# Audit Ledger Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Admin can download the organization's audit ledger as a streamed CSV from Settings → Audit ledger.

**Architecture:** A new `GET /api/audit-ledger/export` route streams CSV in keyset batches of 1000 straight to the response; a pure `csv.utils.ts` does the encoding; the page gets one "Export CSV" button that downloads the blob with the current filters.

**Tech Stack:** Express 4, Sequelize raw SQL (PostgreSQL), Jest; React 19, MUI 7, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-11-audit-ledger-export-design.md`

## Global Constraints

- Admin only: `authorize("auditLedger.admin")`. No new permission key.
- Only `entity_type` and `entry_type` filters; `entry_type` ∈ {`event_log`, `change_history`} else 400.
- Batch size 1000, keyset `al.id > :afterId ORDER BY al.id ASC`; every query filters `al.organization_id = :organizationId`.
- Columns, in order: `id, occurred_at, user_id, user, entry_type, event_type, action, entity_type, entity_id, field_name, old_value, new_value, description, entry_hash, prev_hash`.
- CSV: UTF-8 BOM, every field quoted, `"` doubled, `\r\n` line ends, formula guard (`=`, `+`, `-`, `@`, `\t`, `\r` → leading `'`).
- Filename `audit-ledger-YYYY-MM-DD.csv`.
- Migrations use the `verifywise.` schema prefix in DDL.
- Sentence case UI text; new strings need de/fr/es in `Clients/src/i18n/translations.ts`.
- Gates from package dirs: `cd Servers && npm run build && npm run format-check && npm run test`; regenerate `npm run generate:swagger && npm run generate:endpoints`. `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npx vitest run <changed dirs>`.

## Review Focus

1. Client disconnects mid-download → the loop stops querying (no runaway batches).
2. A DB error after the first byte → response destroyed, not a silently truncated file that looks complete.
3. Values with commas, quotes, newlines or a leading `=` survive a round trip into a spreadsheet unchanged in meaning.
4. Another organization's rows never appear (every batch query carries `organization_id`).
5. The export's own ledger entry is written after success only, and its failure never breaks the download.

---

### Task 1: Server — CSV utils, streaming export endpoint, index migration

**Files:**
- Create: `Servers/utils/csv.utils.ts`, `Servers/utils/__tests__/csv.utils.test.ts`
- Create: `Servers/utils/auditLedgerExport.utils.ts` (batch reader + row formatter), `Servers/utils/__tests__/auditLedgerExport.utils.test.ts`
- Modify: `Servers/controllers/auditLedger.ctrl.ts` (add `exportAuditLedger`)
- Create: `Servers/controllers/__tests__/auditLedger.export.ctrl.test.ts`
- Modify: `Servers/routes/auditLedger.route.ts`
- Create: `Servers/database/migrations/20261011120000-add-audit-ledger-org-id-index.js`
- Modify (generated): `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts`

**Interfaces:**
- Produces: `GET /api/audit-ledger/export?entity_type=&entry_type=` → `text/csv` attachment. Client relies on the `Content-Disposition` filename.

- [ ] **Step 1: CSV utils, test first.** `csv.utils.ts`:

```ts
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV field: quoted, quotes doubled, formula-looking text prefixed with '. */
export const csvField = (value: unknown): string => {
  if (value === null || value === undefined) return '""';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

/** One CSV line, RFC 4180 line ending. */
export const csvRow = (values: unknown[]): string => `${values.map(csvField).join(",")}\r\n`;

/** Byte-order mark so spreadsheet apps read the file as UTF-8. */
export const CSV_BOM = "﻿";
```

Tests: null/undefined → `""`; `a"b` → `"a""b"`; `x,y\nz` stays inside quotes; `=SUM(A1)` → `"'=SUM(A1)"`; `-5` string → `"'-5"`; number `-5` → `"-5"` (numbers are not guarded); Date → ISO; row ends with `\r\n`.

- [ ] **Step 2: Export utils, test first.** `auditLedgerExport.utils.ts`:

```ts
export const EXPORT_BATCH_SIZE = 1000;
export const AUDIT_LEDGER_EXPORT_COLUMNS = [
  "id", "occurred_at", "user_id", "user", "entry_type", "event_type", "action",
  "entity_type", "entity_id", "field_name", "old_value", "new_value",
  "description", "entry_hash", "prev_hash",
] as const;

export interface AuditLedgerExportFilters { entityType?: string; entryType?: string }

/** One batch of the org's ledger after `afterId`, oldest first. */
export const fetchAuditLedgerBatch = async (
  organizationId: number,
  filters: AuditLedgerExportFilters,
  afterId: number,
): Promise<any[]> => { /* SQL from the spec, LIMIT :limit with EXPORT_BATCH_SIZE */ };

/** A ledger row as CSV values, in AUDIT_LEDGER_EXPORT_COLUMNS order. */
export const ledgerRowValues = (row: any): unknown[] => [
  row.id,
  row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
  row.user_id,
  [row.user_name, row.user_surname].filter(Boolean).join(" "),
  row.entry_type, row.event_type, row.action, row.entity_type, row.entity_id,
  row.field_name, row.old_value, row.new_value, row.description,
  row.entry_hash, row.prev_hash,
];
```

Tests (mock `sequelize.query`): SQL has `al.organization_id = :organizationId`, `al.id > :afterId`, `ORDER BY al.id ASC`, `LIMIT :limit`; filters add `al.entity_type = :entityType` / `al.entry_type = :entryType` only when given; `ledgerRowValues` order and user name join, deleted user → `""`.

- [ ] **Step 3: Controller, test first.** `exportAuditLedger(req, res)` in `auditLedger.ctrl.ts`:
  1. Validate `entry_type` (400 via `STATUS_CODE[400]` if not one of the two values).
  2. Track disconnects on the RESPONSE: `let aborted = false; res.on("close", () => { aborted = !res.writableFinished; });` (NOT `req` close: on Node 16+ it fires as soon as the request is read, which would cut every export after one batch).
  3. Set headers (spec), `res.write(CSV_BOM + csvRow([...AUDIT_LEDGER_EXPORT_COLUMNS]))`.
  4. Loop: if `aborted` break; `rows = await fetchAuditLedgerBatch(...)`; if `aborted` break; build the batch text with `csvRow(ledgerRowValues(r))`; `if (!res.write(text)) await waitForDrainOrClose(res)` (a `Promise.race` of `drain` and `close` that removes the other listener); count rows; `afterId = last row id`; stop when `rows.length < EXPORT_BATCH_SIZE`.
  5. If `aborted`, return without `end` or self-audit. Otherwise `res.end()`; then best-effort (never awaited before `end`) `appendToAuditLedger({ organizationId, entryType: "event_log", userId: req.userId, eventType: "Read", entityType: "audit_ledger", description: \`Exported ${count} audit ledger entries\` + filters })` in try/catch.
  6. catch: `logFailure`; if `!res.headersSent` → 500 JSON; else `res.destroy(error)`.

  Headers set: `Content-Type`, `Content-Disposition`, and `Access-Control-Expose-Headers: Content-Disposition` (the CORS config in app.ts exposes no headers).

  Tests (mock `fetchAuditLedgerBatch`, `appendToAuditLedger`). The fake `req` and `res` MUST be real `EventEmitter`s (`res` adds `setHeader`, `write` returning a configurable boolean, `end` setting `writableFinished`, `destroy`, `headersSent`, `status().json()`), so close/drain tests exercise real listeners: headers incl. `Access-Control-Expose-Headers` + BOM + header row; 1000 + 3 rows → two batches, second `afterId` = last id of first; invalid `entry_type` → 400 and no query; error on first batch → 500 JSON; error on second batch → `destroy` called, no `end`; self-audit called once with count 1003 after `end`; self-audit throwing does not throw; `res` close after batch one stops further fetches and skips self-audit; `req` emitting close does NOT stop the export (regression guard); `write` returning false waits until `drain` is emitted, and a `close` instead of `drain` ends the loop without hanging.

- [ ] **Step 4: Route.** `router.get("/export", authorize("auditLedger.admin"), exportAuditLedger);`. Mandatory test: the `/export` GET layer in the router stack is guarded by `authorize("auditLedger.admin")` (mock `authorize` to tag its permission key and assert it).

- [ ] **Step 5: Migration.**

```js
"use strict";
/** Org-scoped keyset reads of the audit ledger (export batches, list). */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_audit_ledger_org_id ON verifywise.audit_ledger (organization_id, id);`,
    );
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS verifywise.idx_audit_ledger_org_id;`);
  },
};
```

- [ ] **Step 6: Gates and docs.** Run the Servers gates; regenerate swagger/endpoints (the generator reads app.ts route mappings; then set the new operation's summary/description and the 200 `text/csv` response in `swagger.yaml` by hand and regenerate again so both files agree); commit `feat(audit-ledger): stream the audit ledger as a CSV export`.

### Task 2: Client — Export CSV button

**Files:**
- Modify: `Clients/src/application/repository/auditLedger.repository.ts`
- Modify: `Clients/src/presentation/pages/SettingsPage/AuditLedger/index.tsx`
- Modify: `Clients/src/presentation/pages/SettingsPage/AuditLedger/__tests__/AuditLedger.test.tsx`
- Modify: `Clients/src/i18n/translations.ts`

**Interfaces:**
- Consumes: `GET /audit-ledger/export?entity_type=&entry_type=` from Task 1.

- [ ] **Step 1: Repository.**

```ts
export async function exportAuditLedger(
  params: Pick<GetAuditLedgerParams, "entity_type" | "entry_type"> = {},
): Promise<{ blob: Blob; filename: string }> {
  const query = new URLSearchParams();
  if (params.entity_type) query.set("entity_type", params.entity_type);
  if (params.entry_type) query.set("entry_type", params.entry_type);
  const response = await CustomAxios.get(
    `/audit-ledger/export${query.toString() ? `?${query.toString()}` : ""}`,
    { responseType: "blob" },
  );
  const fallback = `audit-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  const match = /filename="?([^";]+)"?/.exec(response.headers?.["content-disposition"] ?? "");
  return { blob: response.data, filename: match?.[1] ?? fallback };
}
```

- [ ] **Step 2: Button, test first.** In `index.tsx`, an `isExporting` state and an "Export CSV" `CustomizableButton` (variant `outlined`, same `sx` height as Verify) placed before "Verify chain". On click: `exportAuditLedger({ entity_type: filters.entity_type || undefined, entry_type: filters.entry_type || undefined })` → `triggerBrowserDownload(blob, filename)`; on error only reset `isExporting` (`customAxios` already toasts every failed request; no page alert). Text while running: "Exporting...". The page is Admin-only already; no role check.

  Test: mock the repository and `triggerBrowserDownload`; with an entity filter selected, clicking "Export CSV" calls `exportAuditLedger` with that filter and downloads the returned blob; a rejected export re-enables the button and downloads nothing.

- [ ] **Step 3: i18n.** Add de/fr/es for "Export CSV" and "Exporting..." next to the existing audit ledger strings (skip any that already exist).

- [ ] **Step 4: Gates.** Clients gates; commit `feat(audit-ledger): add Export CSV button`.
