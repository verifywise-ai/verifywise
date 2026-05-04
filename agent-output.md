# Issue #3395 & #3259 — Session Report

> **Date:** 2026-04-30
> **Branch:** `mo-342-april-30-integration-issues`

## Session Summary

This session resolved two GitHub issues and one pre-existing auto-driver bug:

1. **Issue #3395** — Fixed "column updated_at of relation users does not exist" error when changing user roles, and wired the missing RBAC-protected route for `updateUserRole`.
2. **Issue #3259** — Implemented a post-upload evidence wizard with 5 steps (Upload, Classification, Tags & Metadata, Frameworks & Models, Assignment), including new DB columns, backend persistence, and table display.
3. **Bonus fix** — Fixed a pre-existing auto-driver crash (`Named replacement ":implementation_details" has no entry`) that blocked demo data creation.

**Final state:** 11 commits, both frontend and backend builds passing.

---

## Commits Made (11 total)

### Issue #3395: Missing `updated_at` + RBAC

#### 1. `fix(users): add missing updated_at column to users table`
- **File:** `Servers/database/migrations/20260430094125-add-updated-at-to-users.js`
- Adds `updated_at TIMESTAMP NOT NULL DEFAULT NOW()` to the users table via `ALTER TABLE ADD COLUMN IF NOT EXISTS`.

#### 2. `feat(users): wire updateUserRole route with Admin-only access`
- **File:** `Servers/routes/user.route.ts`
- Added `PATCH /:id/role` route with `authenticateJWT` + `authorize(["Admin"])` middleware, positioned before the generic `PATCH /:id` to avoid route shadowing.

---

### Issue #3259: Evidence Upload Wizard

#### 3. `feat(evidence): add wizard columns to evidence_hub table`
- **File:** `Servers/database/migrations/20260430094758-add-evidence-hub-wizard-columns.js`
- Adds `tags` (JSONB), `framework_ids` (TEXT[]), `reviewer_id` (INTEGER FK), `retention_policy` (VARCHAR) to `evidence_hub`.

#### 4. `feat(evidence): add wizard fields to backend evidence hub model`
- **Files:** `Servers/domain.layer/models/evidenceHub/evidenceHub.model.ts`, `Servers/domain.layer/interfaces/i.evidenceHub.ts`
- Added Sequelize `@Column` decorators and interface fields for the 4 new columns. Updated `toSafeJSON()`, `toJSON()`, and `updateEvidence()`.

#### 5. `feat(evidence): persist wizard fields in evidence hub queries`
- **File:** `Servers/utils/evidenceHub.utils.ts`
- Updated `createNewEvidenceQuery` INSERT and `updateEvidenceByIdQuery` UPDATE SQL to include the 4 new columns with proper serialization (JSON.stringify for tags, PostgreSQL array literal for framework_ids).

#### 6. `feat(evidence): track wizard field changes in controller`
- **File:** `Servers/controllers/evidenceHub.ctrl.ts`
- Added `tags`, `framework_ids`, `reviewer_id`, `retention_policy` to the `fieldsToTrack` array for model inventory change history.

#### 7. `feat(evidence): add wizard fields to frontend evidence hub model`
- **File:** `Clients/src/domain/models/Common/evidenceHub/evidenceHub.model.ts`
- Added `tags`, `framework_ids`, `reviewer_id`, `retention_policy` properties and constructor initialization.

#### 8. `feat(evidence): create TagInput component for evidence tagging`
- **File:** `Clients/src/presentation/components/Inputs/TagInput/index.tsx` (new)
- Reusable chip-based tag input: Enter/comma to add, Backspace to remove last, suggestion chips, validation (max 50 tags, 100 chars, alphanumeric+hyphens+underscores).

#### 9. `feat(evidence): refactor evidence modal to 5-step wizard`
- **File:** `Clients/src/presentation/components/Modals/EvidenceHub/index.tsx`
- Replaced flat `StandardModal` form with `StepperModal` wizard:
  - Step 1: Upload Files
  - Step 2: Classification (name, type, description)
  - Step 3: Tags & Metadata (TagInput with suggestions)
  - Step 4: Frameworks & Models (toggle chips for 7 frameworks, multi-select for models)
  - Step 5: Assignment (reviewer dropdown, retention policy select, expiry date)

#### 10. `feat(evidence): display tags, frameworks, reviewer, retention in table`
- **File:** `Clients/src/presentation/pages/ModelInventory/evidenceHubTable.tsx`
- Added 4 new columns: Tags (chip badges with +N overflow tooltip), Frameworks, Reviewer (resolved from user map), Retention Policy. All support column visibility toggling; reviewer and retention support sorting.

---

### Bonus: Auto-Driver Fix

#### 11. `fix(eu): null-coalesce optional demo control fields in EU framework seeder`
- **File:** `Servers/utils/eu.utils.ts`
- **Root cause:** 7 newer EU AI Act control structure files (00, 13-18) lack `implementation_details`, `evidence_description`, and `feedback_description`. When `enable_ai_data_insertion = true`, accessing these `undefined` fields caused Sequelize to reject them (`Named replacement has no entry in the replacement map`).
- **Fix:** Added optional chaining (`?.`) and null coalescing (`?? null`) on lines 884 and 943 so `undefined` becomes `null`.

---

## Verification

- **Backend build:** `cd Servers && npm run build` — passed
- **Frontend build:** `cd Clients && npm run build` — passed (2.02s)
- **Demo data creation:** Fixed by commit 11 — auto-driver no longer crashes on newer control structures
