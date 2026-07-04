# Model Risk Management (MRM)

> **Last Updated:** 2026-07-03
> **Status:** Built, PR #4228 (branch `feat/mrm-revalidation` → `develop`). Not yet merged.

Governance-grade model risk management for regulated banking standards: **SR 26-2**
(US Fed), **SS1/23** (UK PRA), **OSFI E-23** (Canada). Lives as a grouped **Model risk
management** tab inside Model inventory — one register for AI and traditional models, not a
separate silo.

**Scope boundary (deliberate):** governance MRM only — tiering, validation, findings,
monitoring, revalidation, attestation. VerifyWise never computes quantitative model metrics
(no drift/performance math) and ships **no third-party monitoring-tool connectors**.
The customer computes metrics and pushes them; VerifyWise owns thresholds, evaluation,
alerting, and the audit trail — the parts examiners inspect.

---

## Architecture at a glance

Built in three phases (all in one PR):
- **Core** — tiering, validation + report, findings, per-model roles.
- **Monitoring** — metric ingestion, threshold evaluation, tokens, monitoring UI.
- **Revalidation & attestation** — trigger workflow, scheduled sweep, portfolio roll-up + report.

Standard VerifyWise layering: thin controllers → utils (raw SQL, org-scoped) → Postgres;
frontend repository → React Query hooks → VerifyWise components.

---

## Database (all tables `organization_id`-scoped + indexed; `verifywise` schema)

Migrations `20260703100000`–`20260703120000`.

| Table | Purpose | Key notes |
|-------|---------|-----------|
| `model_inventories` (+cols) | tiering + external key | `mrm_tier`, `mrm_materiality_drivers`, `mrm_tiered_at/by`, `external_key` (unique/org), `mrm_revalidation_flagged/_at/_reason` (seed flag) |
| `mrm_validations` | staged validation lifecycle | `stage`, `trigger`, `validator_id`, `outcome`, `report` JSONB (6 sections + `revalidation_triggers[]`); **partial unique index = one open validation per model** |
| `mrm_findings` | findings register | severity/stage lifecycle to verified closure; **no hard delete** |
| `mrm_model_roles` | per-model owner/dev/validator/approver | `user_id` SET NULL on user delete |
| `mrm_metric_keys` | per-org metric-key catalogue | |
| `mrm_thresholds` | threshold config | 5 shapes `gt/gte/lt/lte/outside`; CHECK constraint guarantees an evaluatable row; **`window` column MUST be quoted `"window"` (Postgres reserved word)** |
| `mrm_metrics` | ingested time-series (append-only) | idempotency UNIQUE `(org, model, metric, segment, window, at)` where `at` is **truncated to the second in the INSERT** (`date_trunc('second', :at)`) — a generated column can't do this (must be IMMUTABLE; date_trunc over timestamptz is only STABLE) |
| `mrm_metric_evaluations` | immutable eval audit | stores a `threshold_snapshot` JSONB so later threshold edits never rewrite history |
| `mrm_ingestion_tokens` | machine-auth tokens | `token_hash` UNIQUE, **hashed never plaintext**, per-org, revocable, optional per-model scope |
| `mrm_revalidation_events` | immutable trigger-firing log | `trigger_source`, `created_validation`, `resulting_validation_id` (SET NULL) |

FK intent: model-with-history → RESTRICT (validations/findings; decommission not delete);
monitoring data → CASCADE with the model; user FKs → SET NULL (preserve audit).

---

## Backend

**Routes** — `/api/mrm/` (JWT) for tiering/validation/findings/roles/thresholds/tokens/
monitoring/attestation; the ingestion route `POST /api/mrm/models/:externalModelKey/metrics`
is **token-authed** (separate `mrmIngestionAuth` middleware + dedicated rate limiter keyed by
token, not IP — uses `express-rate-limit`'s `ipKeyGenerator` for the fallback).

**Threshold evaluation** (`utils/mrmMonitoring.utils.ts`) — the examiner-critical core. Pure,
deterministic, unit-tested (28 tests). **Most-conservative-wins selection**: if any matching
threshold breaches, a breaching one wins regardless of specificity (SR 11-7 fail-safe — a
loose specific threshold can never mask a catch-all breach). `no_threshold` is a first-class
recorded status. Client-supplied verdicts are never trusted.

**Revalidation** (`utils/mrmRevalidation.utils.ts`) — one `triggerRevalidation` util that 4
sources call (breach / material-change / tier-increase / scheduled). One open validation per
model; a second trigger **annotates** the open task (no duplicate) and every firing writes an
event. Race-safe: a **SAVEPOINT** around the create means a concurrent-trigger unique
violation re-resolves to the annotate path (without it the aborted transaction loses the audit
event). Scheduled sweep = BullMQ daily job (`services/automations/actions/mrmRevalidationSweep.ts`).

**Attestation** (`utils/mrmAttestation.utils.ts`, `services/reporting/mrmAttestationReport.ts`)
— fleet roll-up summary + a DOCX board/examiner report. Attestation is blocked only by open
**critical/high** findings.

---

## Frontend

`Clients/src/presentation/pages/ModelInventory/mrm/` — sub-tabs Overview / Tiering /
Validation / Findings / Monitoring / Settings. Data layer: `application/repository/mrm.repository.ts`,
`application/hooks/useMrm.ts`, `domain/interfaces/i.mrm.ts`, `domain/enums/mrm.enum.ts`.
Uses VerifyWise components + theme tokens; i18n de/fr/es via the DOM-level runtime translator
(`i18n/domTranslator.ts`) — components render plain strings, keys live in `i18n/translations.ts`
(NOT component-level `t()`).

---

## Gotchas learned (do not rediscover)

1. **`window` is a Postgres reserved word** — always `"window"` in raw SQL (migrations + utils
   + test factories). Bare use fails `CREATE TABLE` and every query.
2. **No `GENERATED` column over a timestamptz** — Postgres requires generated exprs IMMUTABLE;
   `date_trunc`/`extract` over `timestamptz` is only STABLE. Truncate in the INSERT instead.
3. **`express-rate-limit` v8** rejects a custom `keyGenerator` that reads `req.ip` directly —
   use the exported `ipKeyGenerator` for IPv6 safety.
4. **Running isolation tests:** always use `--globalSetup` (it creates the DB + runs migrations).
   An isolated `jest --testMatch=...` WITHOUT it runs against an unmigrated DB and gives bogus
   "relation does not exist". Drop `verifywise_mrm_test` between full runs if one failed mid-migration.

---

## Testing

- Unit: 28 threshold-eval tests in `utils/__tests__/mrmMonitoring.utils.test.ts` (part of the
  3360-test unit suite).
- Integration: 9 tenant-isolation suites (`tests/integration/tenant-isolation/mrm-*.isolation.test.ts`),
  36 tests, all green against a live Postgres.
