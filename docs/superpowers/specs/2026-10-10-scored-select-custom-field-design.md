# Scored select custom field — design

**Date:** 2026-10-10
**Status:** Draft for review
**Scope:** PR 1 of the custom-field scoring work. One new custom field type, nothing else.

## Why

A customer runs use case intake today with email, slide decks, and an Excel sheet. Architects score each submitted use case on about 8 questions. Each answer is a level that carries a number, for example:

- Technical feasibility: high (3), medium (2), low (1)
- Applies to one, a few, or most group companies: one (1), few (2), most (3)
- Estimated effort in man-days: low (3), medium (2), high (1). The scale is reversed.

A weighted total ranks the use cases, for example `Q1*10 + Q2*2 + Q3*5`. The customer wants all of this in VerifyWise so the Excel sheet goes away.

Use case custom fields can't express "a choice that is worth a number" today. Select options are plain labels (`options: string[]`), and a number field forces reviewers to remember that "low effort" means 3. This PR adds that building block. Formulas, sorting, filtering and export come in later PRs (see *Follow-ups*).

## What exists today (develop `22d2e818b`)

- **Tables.** `custom_field_definitions` (`organization_id`, `entity_type`, `field_key`, `label`, `field_type`, `options` JSONB, `required`) and `custom_field_values` (one row per definition and entity, with `value` JSONB). Both come from `Servers/database/migrations/20260520164729-create-custom-fields-tables.js`. The allowed field types are enforced by the CHECK constraint `cfd_field_type_allowed`: text, number, date, boolean, select, multiselect, user.
- **Entity types.** vendor, policy, project (use case), project_risk, vendor_risk, model_inventory, task, model_risk.
- **Server code.** Raw queries in `Servers/utils/customField.utils.ts`, the controller in `Servers/controllers/customField.ctrl.ts`, and routes in `Servers/routes/customField.route.ts`. Definition writes need `authorize("customField.admin")`. Values go through `PUT /api/custom-fields/values`.
  - `field_type` and `field_key` can't change after creation.
  - A select value is stored as its option label. Renaming or removing an option orphans existing values without warning.
  - Deleting a definition cascades to its values without warning.
- **Client code.** The Settings builder is `Clients/src/presentation/pages/SettingsPage/CustomFields/index.tsx`, where options are a one-per-line textarea. The section that edits values on a record is `Clients/src/presentation/components/CustomFieldsSection/index.tsx`. All 8 entity tables render values through `formatCustomFieldValue.ts`, passing the full definition from `useCustomFieldDefinitions`.
- **Audit ledger.** `Servers/utils/auditLedger.utils.ts`, `appendToAuditLedger`, is a hash-chained, per-org ledger shown in Settings → Audit ledger. Entries carry `eventType`, `entityType`, `entityId`, `fieldName`, `oldValue`, `newValue` and `description`. Orgs can switch it off with `audit_ledger_enabled`, which defaults to on. FRIA writes `event_log` entries best-effort after commit (`fria.ctrl.ts`).
- **Server tests.** None exist for custom fields. Client tests exist for the section, the Settings page, the hook and the repository.

## Decisions

| Topic | Decision |
|---|---|
| Type | New `scored_select`, labelled "Scored select". `select` is unchanged. |
| Choice | Single choice only. |
| Entities | All 8 custom-field entity types. |
| Option shape | `{ id, label, score }` |
| Option ids | The server assigns them, and they never change. Clients can't create them. |
| Option count | 1 to 50. |
| Labels | Trimmed, `OPTION_MIN` to `OPTION_MAX` characters (same as select), unique ignoring case and surrounding spaces. |
| Scores | Required on every option. Any finite number, rounded to 2 decimals on save. |
| Order | The admin's order. The Settings editor has up and down buttons. |
| Stored value | The chosen option's `id` (a JSON string). |
| Score of a value | Always read from the current definition, so editing a score re-scores every record. |
| Display | "High (3)": the label, then the score with trailing zeros dropped (3, 0.5, 0.33). An id that matches no option shows "—". |
| Removing a used option | The admin must choose another option to move those answers to. The move and the removal happen in one transaction. |
| Removing an unused option | Immediate. |
| Deleting a field | The confirmation shows how many records lose their answer. |
| History | One audit ledger `event_log` entry per definition change, for every field type, written best-effort after commit. Reordering isn't logged. |
| Who can set answers | Unchanged: anyone who can edit the record. |

## Data model

**Migration** `Servers/database/migrations/<YYYYMMDDHHmmss>-add-scored-select-custom-field-type.js`. The timestamp is the creation time, like the existing migrations.

- `up`: drop and recreate `cfd_field_type_allowed` with `scored_select` added. No other schema change. `options` stays JSONB, and values stay JSONB.
- `down`: if any `scored_select` definition exists, throw an error that says so instead of deleting customer data. Otherwise recreate the original constraint.

**Option shape for `scored_select`** (stored in `custom_field_definitions.options`, in the admin's order):

```json
[
  { "id": "opt_3f9a1c2e", "label": "High", "score": 3 },
  { "id": "opt_8b20d4f1", "label": "Medium", "score": 2 },
  { "id": "opt_c71e0a95", "label": "Low", "score": 1 }
]
```

- The id is `opt_` followed by 8 lowercase hex characters from `crypto.randomBytes(4)`. It only needs to be unique within its definition; the server regenerates it on a collision.
- **Value:** `custom_field_values.value` holds the chosen id as a JSON string, for example `"opt_3f9a1c2e"`.

**Types** (`ICustomFieldDefinition` on the server, `i.customField.ts` on the client):

```ts
type CustomFieldType = "text" | "number" | "date" | "boolean" | "select" | "multiselect" | "user" | "scored_select";
interface IScoredOption { id: string; label: string; score: number }
options: string[] | IScoredOption[] | null; // IScoredOption[] only when field_type === "scored_select"
```

## Server behaviour (`customField.utils.ts`)

### Validating options

`validateOptionsForType` gets a `scored_select` branch that calls a new `validateScoredOptions(input, existing)`. `existing` is `null` on create and the current options on update.

1. The input must be an array of 1 to 50 objects.
2. For each item:
   - `label`: a string, trimmed, `OPTION_MIN` to `OPTION_MAX` characters.
   - `score`: a finite number, stored as `Math.round(score * 100) / 100`, with `-0` stored as `0`.
   - `id`: optional. If present it must be an id in `existing`; any other id is rejected, so clients can't mint ids or reuse ids from another field. Items without an id get a new one.
3. Labels must be unique after `trim().toLowerCase()`.
4. Ids must be unique, so the same existing option can't be sent twice.
5. Unknown keys on an option are dropped.
6. The output keeps the input order.

`select` and `multiselect` keep their current validation. Sending option objects to them is still rejected with "option values must be strings".

### Validating values

`validateValue` gets a `scored_select` case. The value must be a string equal to the `id` of one of the definition's current options; otherwise it returns 400 "Value must be one of the allowed options".

### Updating a definition: removed options and moves

`PATCH /definitions/:id` gains an optional `option_moves` field, `{ "<removedOptionId>": "<targetOptionId>" }`. It's accepted only for `scored_select`; for any other type it's rejected with 400. The `patch` parameter of `updateCustomFieldDefinitionQuery` gains `option_moves`. The controller already passes `req.body` through.

`updateCustomFieldDefinitionQuery` doesn't use a transaction today. It gains one (`sequelize.transaction()`), and does the following inside it:

1. Read the definition with `SELECT … FOR UPDATE`, then validate the new options against it (above). Removed ids are those in `existing` but not in the new options.
2. Count the values that use each removed id, scoped by `definition_id` and the org.
3. If any removed id is in use and `option_moves` has no target for it, throw a `ConflictException` (409) whose `metadata` carries the body below:

   ```json
   {
     "code": "options_in_use",
     "in_use": [{ "id": "opt_…", "label": "Medium", "count": 80 }],
     "entity_type": "project"
   }
   ```

   Nothing is written. The client uses this response to open the "move to" dialog.

   `respondWithError` in `customField.ctrl.ts` sends only `error.message` today. It's extended so that a `ConflictException` with `metadata.code === "options_in_use"` responds with `STATUS_CODE[409]({ message, code, in_use, entity_type })`. All other errors keep the current behaviour.
4. Every target must be an id in the **new** options and must not itself be removed. Otherwise return 400.
5. For each move, run `UPDATE custom_field_values SET value = to_jsonb(CAST(:target AS text)), updated_at = NOW() WHERE definition_id = :id AND organization_id = :org AND value = to_jsonb(CAST(:removed AS text)) RETURNING 1`, and keep the row count for the ledger.
6. Write the definition and commit. Ledger entries are written after the commit.

**Racing value writes.** Today `setCustomFieldValueQuery` reads the definition outside its transaction (`customField.utils.ts:502`) and writes the value inside it (`:532`). Under READ COMMITTED, a removal could commit between the two and leave a record holding a removed id. So for `scored_select`, the value write reads the definition with `FOR SHARE` inside the transaction the controller already passes in. A removal (`FOR UPDATE`) and a value write then serialize:
- If the write goes first, the removal sees the new value and counts or moves it.
- If the removal goes first, the write validates against the new options and gets 400.

Other field types keep their current read.

### Usage counts

A new route, `GET /definitions/by-id/:id/usage`, behind `authenticateJWT` and `authorize("customField.admin")`, returns:

```json
{ "total": 120, "by_option": { "opt_3f9a1c2e": 40, "opt_8b20d4f1": 80 } }
```

- `by_option` is filled only for `scored_select`. It's `{}` for every other type.
- The query is org-scoped through the definition.
- The client uses `total` in the delete confirmation for every field type, and `by_option` to label options in the Settings editor.

`deleteCustomFieldDefinitionQuery` counts the field's values before deleting, in the same transaction, so the "Field deleted" ledger entry can state how many records lost their answer.

### Audit ledger entries

These are written by a helper `recordDefinitionChanges(def, before, after, userId, moves)`, called after commit for create, update and delete. They're best-effort: `appendToAuditLedger` runs inside try/catch and a failure is logged, never thrown, matching FRIA.

Every entry uses `entryType: "event_log"`, `entityType: "custom_field_definition"`, `entityId: def.id`, and a `description` that names the field and its entity type, for example `Use cases · Technical feasibility`.

| Change | eventType | fieldName | oldValue → newValue |
|---|---|---|---|
| Field created | Create | — | — |
| Field deleted | Delete | — | — (description adds "N records lost their answer") |
| Label changed | Update | label | old → new |
| Required changed | Update | required | false → true |
| Select or multiselect options changed | Update | options | old list → new list (joined with ", ") |
| Scored option added | Update | option | — → "Low (1)" |
| Scored option renamed | Update | option label | "Medium" → "Moderate" |
| Scored option rescored | Update | option score: High | 3 → 4 |
| Scored option removed | Update | option | "Medium (2)" → — (description adds "80 answers moved to Low") |
| Options reordered | not logged | | |

A save that changes several things writes one entry per change.

## Client behaviour

### Settings → Custom fields (`SettingsPage/CustomFields/index.tsx`)

- **Type dropdown:** gains "Scored select".
- **Option editor for scored select:** rows instead of the textarea.
  - Each row has a label field, a score field, up and down buttons, and a remove button. The score field is a number input that accepts decimals and shows the value rounded to 2 decimals when it loses focus, matching what the server stores.
  - An "Add option" button sits below the rows.
  - Rows for existing options carry their `id`; new rows don't.
  - Each row shows "Used by N" from the usage endpoint when N > 0.
- **Client checks** mirror the server: at least 1 option, a label and score on every row, unique labels.
- **Saving:**
  - If the server returns 409 `options_in_use`, a `StandardModal` opens with one row per removed option: "80 use cases use Medium. Move them to: [option ▾]". The choices are the remaining options.
  - Confirming resends the same PATCH with `option_moves`.
  - The entity word comes from the 409's `entity_type`. `CUSTOM_FIELD_ENTITY_LABELS` in `i.customField.ts` is singular and not consistently sentence case ("Model Inventory"), so a new `CUSTOM_FIELD_ENTITY_PLURAL_LABELS` is added: use cases, vendors, policies, project risks, vendor risks, models, tasks, model risks. The same map is used for "Used by N …" and the delete confirmation.
- **Options column in the fields table:** shows scored options as "High (3)" chips. Today it maps strings at `:201`.
- **Delete confirmation:** adds "N records have a value for this field" from `total`, for every field type.

### Editing values (`CustomFieldsSection/index.tsx`)

- A `scored_select` field renders the house `Select`.
- Items are `{ _id: option.id, name: "High (3)" }` in definition order.
- Empty and required handling is identical to `select`: `normalize`, `valuesEqual` and `isEmpty` treat it like `select`, and `RequiredCustomFieldsGate` needs no change. `renderInput` gets a `scored_select` case with a `ScoredSelectInput` next to `SelectInput`.

### Display (`formatCustomFieldValue.ts`)

- `CustomFieldDefLike` gains `options?`.
- For `scored_select`, the formatter finds the option by id and returns `${label} (${formatScore(score)})`, or "—" if no option matches.
- `formatScore` drops trailing zeros: 3, 0.5, 0.33, -2.
- All 8 tables already pass the full definition from `useCustomFieldDefinitions`; `VWProjectRisksTableBody` gets it through its `customFieldDefs` prop from `VWProjectRisksTable`. They pick this up with no further change.

### Strings

All new screen text is sentence case and gets de, fr and es entries in `Clients/src/i18n/translations.ts`. `npm run i18n:audit:strict` must stay at 0 gaps.

## API documentation

- `Servers/swagger.yaml`: the field type enum, the scored option schema, `option_moves`, the 409 body, and the usage endpoint.
- `docs/api-docs/src/config/endpoints.ts`: the same.

## Testing

**Servers (Jest, new `Servers/utils/__tests__/customField.scoredSelect.test.ts`)**. There are no server tests for custom fields yet. These mock `sequelize` the way the existing `Servers/utils/__tests__/*.utils.test.ts` files do, and assert the SQL and replacements sent, including that the move and the definition update share one transaction.

- Option validation:
  - ids are assigned on create and kept on update
  - an unknown id is rejected
  - a duplicate id or a label that differs only in case is rejected
  - 0 or 51 options are rejected
  - a missing or non-finite score is rejected
  - scores round to 2 decimals and `-0` becomes 0
  - order is kept
- Value validation: a current option id is accepted; a removed id, a label, or a number is rejected.
- Update:
  - removing an unused option succeeds
  - removing a used option without a move returns 409 with counts
  - a move to a removed or unknown target returns 400
  - a move rewrites only that definition's and org's values, in the same transaction as the definition update
  - the update reads the definition `FOR UPDATE`, and a scored-select value write reads it `FOR SHARE` inside its transaction
- Ledger:
  - one entry per change
  - no entry for a reorder
  - a ledger failure doesn't fail the request
- Select and multiselect behave exactly as before (regression).
- Migration (separate file, using a fake `queryInterface` like `agentPrimitiveOwnersMigration.test.ts`): up recreates the CHECK with `scored_select`; down recreates the original CHECK when no scored field exists, and throws when one does.
- Controller: a 409 `options_in_use` response includes `in_use` and `entity_type`; other errors are unchanged.

**Clients (Vitest)**

- `formatCustomFieldValue`: scored id → "High (3)", decimals, unknown id → "—".
- `CustomFieldsSection`: renders "High (3)" options, saves the id, and the required gate treats empty as missing.
- Settings `CustomFields`:
  - the row editor: add, reorder, remove
  - client validation
  - the 409 opens the move dialog and resends with `option_moves`
  - the delete confirmation shows the count

**Manual**

- Run the migration locally.
- Create the customer's three example questions on use cases and score a few use cases.
- Check "High (3)" in the use case table and in Settings.
- Rescore an option and confirm the table updates.
- Remove a used option through the move dialog.
- Check the entries in Settings → Audit ledger.

**Gates:** `cd Servers && npm run build && npm run test`, `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npx vitest run`, `npm run format-check` in Servers.

## Out of scope (follow-ups, in order)

1. Record changes to a record's custom-field answers in that record's change history (all field types). This should land before formulas, so scoring can be audited end to end.
2. Formula fields, for example `=q1*10 + q2*2 + q3*5`. A scored select contributes its score.
3. Sorting and filtering custom-field columns, and including them in exports.
4. Showing selected custom fields on the use case Overview tab.
5. A file upload field type in intake forms.
6. Field-level edit permissions, for example only reviewers set scores. Ask the customer whether he needs this.
7. Converting an existing select field to a scored select.
