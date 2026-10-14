# Audit ledger export — design

**Date:** 2026-10-11
**Status:** approved in chat (scope: "a simple download should do; large exports streamed in batches")

## Goal

Let an Admin download the organization's audit ledger as a CSV file, so they
can hand auditors a log of who did what, when, with before and after values.

## Why the ledger

`audit_ledger` already holds both kinds of audit record:

- `entry_type = 'event_log'`: every create, update, delete and error event
  (mirrored from `logEvent`, `Servers/utils/logger/dbLogger.ts`).
- `entry_type = 'change_history'`: every per-record field change with
  `field_name`, `old_value`, `new_value`, `entity_type`, `entity_id` and the
  user (mirrored from `recordEntityChange`,
  `Servers/utils/changeHistory.base.utils.ts`).

It is hash-chained and append-only, so it is the record an auditor wants.
The event tracker (`event_logs`) is out of scope.

## Scope

In:

1. `GET /api/audit-ledger/export` streams a CSV of the org's ledger.
2. The current on-screen filters (`entity_type`, `entry_type`) apply.
3. An "Export CSV" button on Settings → Audit ledger downloads it.
4. A migration adds an index for org-scoped batching.

Out (deliberately, to keep it simple): JSON format, date-range and user
filters, entity names, event tracker export, new on-screen filters. The
page's client-side user search applies to the visible page only and is not
sent to the export.

## Backend

**Route:** `router.get("/export", authorize("auditLedger.admin"), exportAuditLedger)`
in `Servers/routes/auditLedger.route.ts`. Admin only, the same permission as
chain verification: old and new values can hold sensitive text.

**Query params:** `entity_type`, `entry_type` (optional, same meaning as the
list endpoint). `entry_type` must be `event_log` or `change_history` if given;
anything else is a 400.

**Streaming:** the controller sets
`Content-Type: text/csv; charset=utf-8` and
`Content-Disposition: attachment; filename="audit-ledger-YYYY-MM-DD.csv"`
(with `Access-Control-Expose-Headers: Content-Disposition`), writes a UTF-8
BOM and the header row, then reads in batches of 1000 with keyset paging:

```sql
SELECT al.*, u.name AS user_name, u.surname AS user_surname
  FROM audit_ledger al
  LEFT JOIN users u ON al.user_id = u.id
 WHERE al.organization_id = :organizationId
   AND al.id > :afterId
   [AND al.entity_type = :entityType]
   [AND al.entry_type = :entryType]
 ORDER BY al.id ASC
 LIMIT 1000
```

Rows are written oldest first (chain order). Each batch is written with
`res.write`; when it returns false the loop waits for `drain` or `close`,
whichever comes first. The loop stops when a batch returns fewer than 1000
rows, or when the client disconnects: `res` `close` firing before the
response finished. (`req` `close` is not a disconnect signal on Node 16+; it
fires once the request has been read.) An aborted export writes no
self-audit entry.

**Errors:** an error before the first byte is a normal 500 JSON response. An
error after streaming started is logged and the response is destroyed, so the
download fails rather than ending as a silently truncated file.

**Columns** (header row, in order):
`id, occurred_at, user_id, user, entry_type, event_type, action, entity_type,
entity_id, field_name, old_value, new_value, description, entry_hash,
prev_hash`. `occurred_at` is ISO 8601 UTC. `user` is `name surname`, empty
when the user was deleted.

**CSV encoding** (`Servers/utils/csv.utils.ts`, new, pure):
- `null`/`undefined` → empty field.
- Every field is quoted; `"` is doubled. Embedded newlines stay inside quotes.
- Formula guard: a text value starting with `=`, `+`, `-`, `@`, tab or
  carriage return gets a leading `'`, so a spreadsheet does not run it.
- Lines end with `\r\n` (RFC 4180).
- Signed numbers (`-5`, `+1.5`) and a lone `-` or `+` (change history's
  "no value") are not formulas and are left unchanged; anything else starting
  with a guarded character is prefixed, so the file is not byte-faithful for
  those values. Found in a live run: guarding `-` prefixed every "created"
  change.

**Self-audit:** after the stream ends successfully, append one ledger entry
(best effort, never fails the request): `entryType: "event_log"`,
`eventType: "Read"`, `entityType: "audit_ledger"`, description
`Exported N audit ledger entries` plus the filters used. `logSuccess` does
not write "Read" events, so this calls `appendToAuditLedger` directly.

**Index:** new migration (plain `CREATE INDEX`; the brief lock on
`audit_ledger` while it builds is accepted, as no migration here uses
`CONCURRENTLY`) adding
`CREATE INDEX IF NOT EXISTS idx_audit_ledger_org_id ON verifywise.audit_ledger (organization_id, id)`
(down drops it). The list endpoint's `organization_id` filter also benefits.

**Permissions:** reuse `auditLedger.admin`; no new key.

**API docs:** regenerate `swagger.yaml` and `endpoints.ts`.

## Frontend

- `Clients/src/application/repository/auditLedger.repository.ts`:
  `exportAuditLedger({ entity_type, entry_type }): Promise<{ blob, filename }>`,
  `CustomAxios.get(..., { responseType: "blob" })`, filename from
  `Content-Disposition` with a dated fallback.
- `SettingsPage/AuditLedger/index.tsx`: an "Export CSV" `CustomizableButton`
  next to "Verify chain", sending the current `filters.entity_type` and
  `filters.entry_type`, disabled while exporting, using
  `triggerBrowserDownload`. A failure shows the page's existing error alert
  pattern.
- Errors: `customAxios` already shows a toast for any failed request, so the
  button only resets its busy state on failure; no second alert.
- The page is only rendered for Admins (`SettingsPage/index.tsx:52`), which
  matches the export permission, so the button needs no extra role check.
- New strings get de/fr/es entries.

## Testing

- `csv.utils` unit tests: quoting, doubled quotes, newlines, nulls, formula
  guard, line endings.
- Controller tests: headers, BOM and header row, org scoping and filters in
  the SQL, keyset batching across more than one batch, invalid `entry_type`
  400, error before streaming → 500, error mid-stream → response destroyed,
  self-audit entry written after success.
- Route permission: `/export` uses `auditLedger.admin`.
- Client test: the button calls the repository with the current filters and
  triggers a download.
- Browser check on a scratch database: download a file with a few thousand
  rows and open it.
