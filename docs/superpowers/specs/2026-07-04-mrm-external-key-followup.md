# Follow-up: make MRM `external_key` fully settable (P1)

> **Status:** Scoped, not started. Follow-up to the P0 fix `fix/mrm-external-key`.
> **Date:** 2026-07-04

## Context

The MRM metric-ingestion endpoint (`POST /api/mrm/models/:externalModelKey/metrics`)
resolves a model by its `external_key`. The P0 fix made the **update** path
(`PATCH /api/modelInventory/:id`) persist `external_key`. Two gaps remain that
stop a normal user from actually setting it.

## Gap 1 — No UI field to set `external_key` (user-facing)

The MRM "Metrics feed & tokens" section instructs the user to set a stable
external key "on the model inventory record," but the model inventory
create/edit form (`Clients/src/presentation/pages/ModelInventory/index.tsx`)
has no input for it. So a UI-only user cannot enable ingestion for a model.

**Work:** add an `external_key` field to the model create/edit form, wired to the
existing create (`POST /api/modelInventory`) and update (`PATCH`) calls. Validate
uniqueness-friendly input (trimmed, no spaces recommended). Surface the value on
the model detail view too (see Gap 3).

## Gap 2 — Create path drops `external_key` (backend, same class as the P0 bug)

`createNewModelInventoryQuery` (`Servers/utils/modelInventory.utils.ts:157`)
omits `external_key` from its INSERT column list, and the create controller +
`ModelInventoryModel.createNewModelInventory` (`modelInventory.model.ts:427`) do
not map it. So even the API cannot set `external_key` at create time — only via
the now-fixed PATCH.

**Work (mirror the P0 update fix across the create path):**
- `Servers/controllers/modelInventory.ctrl.ts` — destructure `external_key` from
  `req.body` in `createNewModelInventory` and pass it to the model factory.
- `Servers/domain.layer/models/modelInventory/modelInventory.model.ts:427` —
  map `external_key` in `createNewModelInventory`.
- `Servers/utils/modelInventory.utils.ts:157` — add `external_key` to the INSERT
  columns and the bound values.
- Respect the existing partial-unique index
  `(organization_id, external_key) WHERE external_key IS NOT NULL` — a duplicate
  key should surface a clear validation error, not a 500.

## Gap 3 — `GET /api/modelInventory/:id` MRM columns (P2, minor)

During the simulator run, the model read endpoint did not surface persisted MRM
columns (`external_key`, `mrm_tier`) even though the DB held them. Confirm
whether the read projection/serialization drops MRM fields and, if so, include
them so an integrator can verify setup through the same read endpoint. Lower
priority than Gaps 1–2.

## Acceptance

- A user can set `external_key` when creating OR editing a model, in the UI and
  via the API.
- The value round-trips: create/edit → read shows it → ingestion resolves the
  model (no 404).
- Duplicate `external_key` within an org is rejected with a clear message.

## Not in scope

- Auto-generating `external_key` from the model name (could be a nicety later).
- Any change to the ingestion endpoint itself (already works once the key is set).
