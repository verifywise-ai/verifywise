# MRM external_key settable — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let users set a model's `external_key` at create time (API + UI) and have it returned by the model serializers, so MRM metric ingestion can resolve models created through the normal flow.

**Architecture:** Mirror the already-shipped update-path fix onto the model-inventory create path (controller + model factory + INSERT SQL), add `external_key` to the two serializers, and add one input field to the create/edit modal. The DB column and unique index already exist (no migration).

**Tech Stack:** Node/Express/Sequelize (raw SQL utils) backend; React + MUI + VerifyWise `Field` component frontend.

## Global Constraints

- Do NOT create a database migration. The column `model_inventories.external_key VARCHAR(255)` and the partial unique index `(organization_id, external_key) WHERE external_key IS NOT NULL` already exist (migration `20260703100000`).
- Do NOT modify the UPDATE-path controller/model/SQL lines that the separate P0 PR (`fix/mrm-external-key`, #4233) already changes — this branch is off develop and must not collide. Touch only: the CREATE path, the two serializers, and the UI.
- `external_key` is optional/nullable. No required-field validation.
- Backend raw SQL uses parameterized `:external_key` binding (never string interpolation).
- Frontend: use the VerifyWise `Field` component (not raw MUI TextField). Sentence case for the label ("External key").
- New user-facing label text needs `de`/`fr`/`es` entries so `npm run i18n:audit:strict` passes.
- Pre-PR gates: `cd Servers && npm run build && npm run format-check`; `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`.

---

## File structure

Backend:
- `Servers/controllers/modelInventory.ctrl.ts` — create controller destructure + pass-through
- `Servers/domain.layer/models/modelInventory/modelInventory.model.ts` — create factory + `toSafeJSON`/`toJSON`
- `Servers/utils/modelInventory.utils.ts` — INSERT column/value/replacement

Frontend:
- `Clients/src/domain/interfaces/i.modelInventory.ts` — `external_key?: string`
- `Clients/src/presentation/components/Modals/NewModelInventory/index.tsx` — form value + initial + `Field`
- `Clients/src/i18n/translations.ts` — "External key" in de/fr/es

---

### Task 1: Backend — persist external_key on create + return it from serializers

**Files:**
- Modify: `Servers/controllers/modelInventory.ctrl.ts` (createNewModelInventory only)
- Modify: `Servers/domain.layer/models/modelInventory/modelInventory.model.ts` (createNewModelInventory factory, toSafeJSON, toJSON)
- Modify: `Servers/utils/modelInventory.utils.ts` (INSERT query)

**Interfaces:**
- Produces: `POST /api/modelInventory { ..., external_key }` persists the key; `GET /api/modelInventory/:id` and list responses include `external_key`.

- [ ] **Step 1: Add external_key to the create controller**

In `modelInventory.ctrl.ts`, function `createNewModelInventory`, add `external_key` to the `req.body` destructuring (alongside `hosting_provider`, `is_demo`, etc.):

```typescript
    hosting_provider,
    security_assessment_data,
    is_demo,
    external_key,
    projects,
    frameworks,
  } = req.body;
```

Then add it to the `ModelInventoryModel.createNewModelInventory({...})` call in the same function:

```typescript
      hosting_provider,
      security_assessment_data,
      is_demo,
      external_key,
    });
```

Do NOT touch `updateModelInventoryById` in this file (owned by the P0 PR).

- [ ] **Step 2: Add external_key to the model factory + both serializers**

In `modelInventory.model.ts`:

(a) In the static `createNewModelInventory(data)` method, set it on the constructed model (mirror how `is_demo` is set):

```typescript
      is_demo: data.is_demo,
      external_key: data.external_key ?? undefined,
```

(b) In `toSafeJSON()`, add to the returned object:

```typescript
      external_key: this.external_key ?? null,
```

(c) In `toJSON()`, add the same:

```typescript
      external_key: this.external_key ?? null,
```

Do NOT add the `updateModelInventory` block here (owned by the P0 PR).

- [ ] **Step 3: Add external_key to the INSERT query**

In `modelInventory.utils.ts`, `createNewModelInventoryQuery`, add `external_key` to the INSERT column list and `:external_key` to the VALUES list:

```sql
INSERT INTO model_inventories (organization_id, provider_model, provider, model, version, approver, capabilities, security_assessment, status, status_date, reference_link, biases, limitations, hosting_provider, security_assessment_data, is_demo, external_key, created_at, updated_at)
```

(add `external_key` before `created_at` in the columns, and the matching `:external_key` before `:created_at` in VALUES). Then add to the replacements object:

```typescript
          is_demo: modelInventory.is_demo,
          external_key: modelInventory.external_key ?? null,
```

Do NOT touch the UPDATE query (owned by the P0 PR).

- [ ] **Step 4: Build the backend**

Run: `cd Servers && npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 5: Live verify create persists + serializer returns it**

With the backend running locally, log in, then:

```bash
# create with external_key
curl -s -X POST http://localhost:3000/api/modelInventory -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"model":"P1 test","provider":"in-house","status":"Approved","external_key":"p1-test-key"}' -w "\n%{http_code}\n"
# read it back — external_key must be present and equal to p1-test-key
curl -s http://localhost:3000/api/modelInventory/<newId> -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)['data'].get('external_key'))"
```

Expected: create returns 201; read-back prints `p1-test-key`.

- [ ] **Step 6: Format-check and commit**

Run: `cd Servers && npm run format-check`
Then:

```bash
git add Servers/controllers/modelInventory.ctrl.ts Servers/domain.layer/models/modelInventory/modelInventory.model.ts Servers/utils/modelInventory.utils.ts
git commit -m "feat(mrm): accept external_key on model create and return it from serializers"
```

---

### Task 2: Backend — return 409 on duplicate external_key

**Files:**
- Modify: `Servers/controllers/modelInventory.ctrl.ts` (createNewModelInventory catch block)

**Interfaces:**
- Consumes: the unique partial index on `(organization_id, external_key)`.
- Produces: creating a model with an already-used `external_key` in the same org returns 409 with a clear message instead of 500.

- [ ] **Step 1: Detect the unique-constraint violation**

In `createNewModelInventory`'s `catch (error)` block, before the generic 500, add a guard for the Postgres unique violation (SQLSTATE `23505`) / Sequelize `SequelizeUniqueConstraintError`:

```typescript
    // A duplicate external_key within the org violates the partial unique index.
    const code = (error as { parent?: { code?: string }; original?: { code?: string } })?.parent?.code
      ?? (error as { original?: { code?: string } })?.original?.code;
    if (code === "23505") {
      return res.status(409).json(
        STATUS_CODE[409]("A model with this external key already exists in your organization."),
      );
    }
```

(Place it inside the existing catch, after any transaction rollback, before the existing 500 return. Match the file's existing STATUS_CODE usage.)

- [ ] **Step 2: Build**

Run: `cd Servers && npm run build`
Expected: no errors.

- [ ] **Step 3: Live verify the 409**

```bash
# create the same external_key twice; second must be 409
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/modelInventory -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"model":"dup A","provider":"x","status":"Approved","external_key":"dup-key"}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/modelInventory -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"model":"dup B","provider":"x","status":"Approved","external_key":"dup-key"}'
```

Expected: first `201`, second `409`.

- [ ] **Step 4: Format-check and commit**

Run: `cd Servers && npm run format-check`
Then:

```bash
git add Servers/controllers/modelInventory.ctrl.ts
git commit -m "feat(mrm): return 409 on duplicate external_key at model create"
```

---

### Task 3: Frontend — external_key field in the model create/edit modal

**Files:**
- Modify: `Clients/src/domain/interfaces/i.modelInventory.ts`
- Modify: `Clients/src/presentation/components/Modals/NewModelInventory/index.tsx`
- Modify: `Clients/src/i18n/translations.ts`

**Interfaces:**
- Consumes: the create/update API now accepting `external_key`.
- Produces: a user can type an External key in the create/edit modal; it submits and prefills on edit.

- [ ] **Step 1: Add external_key to the frontend interface**

In `Clients/src/domain/interfaces/i.modelInventory.ts`, add to `IModelInventory` (after `hosting_provider?: string`):

```typescript
  hosting_provider?: string;
  external_key?: string;
```

- [ ] **Step 2: Add the form value + initial state**

In `NewModelInventory/index.tsx`:

(a) In `NewModelInventoryFormValues`, add:

```typescript
  external_key?: string;
```

(b) In `initialState`, add:

```typescript
  external_key: "",
```

- [ ] **Step 3: Add the Field to the form**

In `modelDetailsSection`, add an "External key" field next to `hosting_provider`. Mirror the existing `Field` pattern in the file. Place it as the companion in the hosting_provider row (or a new row):

```tsx
        <Field
          id="external_key"
          label="External key"
          width={"50%"}
          value={values.external_key ?? ""}
          onChange={handleOnTextFieldChange("external_key")}
          sx={fieldStyle}
          placeholder="eg. credit-scoring-v3"
        />
```

The generic `handleOnTextFieldChange` handler and the `...values` spread on submit require no changes — `external_key` flows through automatically.

- [ ] **Step 4: Add i18n for the label**

In `Clients/src/i18n/translations.ts`, add `"External key"` with translations under `de`, `fr`, and `es` (mirror the format of the neighbouring model-form labels, e.g. "Hosting provider"). Suggested: de "Externer Schlüssel", fr "Clé externe", es "Clave externa".

- [ ] **Step 5: Typecheck + i18n audit + format**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`
Expected: all pass (i18n 100%, 0 gaps).

- [ ] **Step 6: Live verify in the app**

With the frontend running, open Model inventory → create a model, enter an External key, save. Confirm it persists (re-open the model to edit — the External key field is prefilled). Confirm a duplicate key surfaces the 409 message.

- [ ] **Step 7: Commit**

```bash
git add Clients/src/domain/interfaces/i.modelInventory.ts Clients/src/presentation/components/Modals/NewModelInventory/index.tsx Clients/src/i18n/translations.ts
git commit -m "feat(mrm): add external key field to the model inventory form"
```

---

## Self-review

**Spec coverage:**
- Gap 2 (create path drops external_key) → Task 1 ✓
- Gap 3 (serializers omit external_key, blank edit prefill) → Task 1 Step 2b/2c ✓
- Gap 1 (no UI field) → Task 3 ✓
- Duplicate handling → Task 2 ✓
- i18n → Task 3 Step 4 ✓

**No-collision with P0 (#4233):** Task 1 explicitly touches only `createNewModelInventory` (controller + model factory), the INSERT SQL, and the serializers — never the update-path lines the P0 PR owns. When both merge, the changed hunks do not overlap.

**Placeholder scan:** every code step shows the exact snippet and the run/expected output.

**Type consistency:** `external_key?: string` added to both the frontend `IModelInventory` and used consistently as an optional string; the model factory uses `?? undefined`, the SQL replacement uses `?? null`, matching the existing patterns.
