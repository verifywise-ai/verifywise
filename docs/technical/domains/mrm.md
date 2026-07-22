# Model Risk Management (MRM)

> **Last Updated:** 2026-07-11
> **Status:** Merged (PR #4228, 2026-07-04). Metric retention added on `feat/mrm-retention`.
> Alert email delivery + configuration added on `feat/mrm-alerts` (stacked; merges after retention).

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
| `mrm_org_settings` | org-wide MRM config | `retention_months` (default 25, CHECK ≥ 13); `alert_email_enabled`, `breach_auto_open_finding` (both default false); one row per org, lazily created — missing row = defaults |
| `mrm_alert_recipients` | org-wide extra alert recipients | `(organization_id, user_id)` PK, both FKs `ON DELETE CASCADE` — a deleted user silently drops off the list |

Migrations `20260711090000`–`20260711090100` (alerts): the `mrm_org_settings` alert columns +
`mrm_alert_recipients` above, plus `mrm_findings.auto_metric VARCHAR(100)` (partial index
`idx_mrm_findings_auto_metric` on `(organization_id, model_inventory_id, auto_metric) WHERE
auto_metric IS NOT NULL`), `mrm_validations.overdue_notified_at TIMESTAMPTZ`, and a new
`enum_notification_type` value `mrm_revalidation_due` (down is a no-op — removing a Postgres
enum value requires recreating the type, too risky for a fix-forward migration).

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

**Metric retention** (`utils/mrmRetention.utils.ts`, `services/automations/actions/mrmRetentionPrune.ts`)
— daily BullMQ job (03:00) prunes benign aged-out `mrm_metrics` points per org
(batched 10k, capped 500 batches/run). **A point with any warn/breach evaluation
is never deleted** — the NOT EXISTS guard lives inside the batch-window subquery
(guard-outside would let protected rows clog the window and wedge the loop).
Config via `GET/PUT /api/mrm/settings` (floor 13 months); UI in Settings → Data retention.

**Alerts: email delivery + configuration (gaps #2+#3)** (`utils/mrmAlerts.utils.ts`,
`controllers/mrmMonitoring.ctrl.ts::handleBreaches`,
`services/automations/actions/mrmRevalidationSweep.ts`, `controllers/mrmSettings.ctrl.ts`) —
turns a metric breach or an overdue revalidation into an in-app notification, an optional
email, and (for hard breaches) an optional auto-opened finding.

*Recipients.* `getAlertRecipientsUnion` unions two sources, deduped: the model's MRM roles
(`owner`/`validator`/`approver`, via `getBreachNotificationRecipientsQuery`) and the org-wide
extra recipients in `mrm_alert_recipients` (`getAlertExtraRecipientsQuery`). Extras are a join
table rather than an `INTEGER[]` column specifically so a deleted user disappears from every
model's audience automatically via `ON DELETE CASCADE`, instead of leaving a dangling id.

*Dispatch.* `dispatchAlerts` fans a notification out to each recipient through the existing
`sendInAppNotification` entry point — in-app delivery is unconditional; email is gated on
`mrm_org_settings.alert_email_enabled` (default **false**) and is queued/rate-limited and
failure-swallowed by that shared service, so one bad email never blocks the in-app copy or the
next recipient. Two MJML templates back the two alert kinds: `mrm-breach-alert.mjml`
(variables `model_label`, `metric`, `value`, `severity`, `model_url`) and
`mrm-revalidation-due.mjml` (`model_label`, `due_date`, `validation_url`), both registered in
`EMAIL_TEMPLATES`.

*Breach path (`handleBreaches`, exported for unit testing).* Runs once per ingestion, after the
metrics are already committed and after the existing revalidation-flag/trigger block (so an
auto-opened finding can link an already-open validation instead of racing to create one). It
reads `mrm_org_settings` once, then for every warn/breach point: (1) tries
`maybeAutoOpenFindingForBreach`, (2) resolves the recipient union, (3) dispatches one alert per
breach with the `mrm-breach-alert` template. All of it is best-effort — a failure here never
rolls back or fails the already-committed ingestion.

*Auto-opened findings (`maybeAutoOpenFindingForBreach`).* Hard breaches only (`status ===
BREACH`; a `warn` never opens a finding) and only when `breach_auto_open_finding` is enabled.
Dedup key is `(organization_id, model_inventory_id, auto_metric)` while the finding's `stage <>
'closed'` — i.e. one in-flight auto-finding per model+metric; once it's closed a fresh breach
opens a new one. The check-then-insert runs inside a transaction that first takes `SELECT ...
FOR UPDATE` on the `model_inventories` row: findings are permanent (no hard delete), so two
concurrently-ingesting requests for the same model must not both pass the dedup check and both
insert. A partial `UNIQUE` index was considered and rejected — it would surface as a raw DB
constraint violation if a human later reopens an old closed auto-finding with the same metric,
instead of the intended "just open a new one" behavior. The finding is deliberately
**segment-coarse**: the dedup key has no `segment` column, so breaches from different segments
of the same metric collapse onto the same finding — segment-level detail already lives in the
`mrm_metric_evaluations` audit trail, and one finding per (model, metric) is the right
governance granularity (examiners track a metric issue, not a per-segment ticket). The finding
links the model's currently-open validation (if any) and its `owner` role user, and its title
is always `Metric breach: <metric>`.

*Overdue-validation alerts (`notifyRevalidationDue` / `claimOverdueNotificationQuery`).* Fired
by `runRevalidationSweep` — both the daily BullMQ job (`runRevalidationSweepAllOrgs`) and the
on-demand `POST /revalidation/sweep` endpoint call this same function, so both paths share one
claim mechanism. This is a **once-per-validation-lifecycle** nudge, atomically claimed by
flipping `mrm_validations.overdue_notified_at` from `NULL` to `now()` in a single `UPDATE ...
WHERE overdue_notified_at IS NULL RETURNING id`; only the caller that flips it proceeds to
notify, so re-running the sweep (which re-annotates an already-open overdue validation every
day) does not re-alert. A new validation row for the next cycle starts at `NULL`, so the model
gets exactly one nudge per lifecycle, not one per calendar day it stays overdue. **The claim
happens before recipient lookup**, so the lifecycle's one nudge is consumed even if the model
currently has nobody assigned to hear it — consistent with the breach path's "recorded, but no
one assigned to notify" behavior, and it prevents a model that temporarily has zero recipients
from silently re-queuing an alert every day once someone is later assigned.
  - *Why not gate on `triggerRevalidation`'s `created_validation` flag instead of adding a
    claim column?* That was the original design, but it's unreachable: `getDueRevalidationsQuery`
    (the sweep's source query) only returns models that **already have an open, `not_started`**
    validation past its due date. `triggerRevalidation` dedups on "one open validation per
    model," so for every row the sweep processes it can only **annotate** the existing
    validation, never create a new one — `created_validation` is true only on the rare race
    where a validation closes and a new due date is computed between the query and the trigger
    call. Keying the alert on that flag would mean the overdue alert almost never fires. The
    `overdue_notified_at` claim decouples "should this validation get its one nudge" from
    "did this particular sweep run create vs. annotate," which is what actually needs to be
    once-per-lifecycle.
  - Only the sweep claims the column, so manual revalidation, breach-triggered revalidation, and
    tier-increase-triggered revalidation never consume or check the claim — the overdue nudge is
    specific to the scheduled/swept path.

*Settings API (`GET`/`PUT /api/mrm/settings`).* The response envelope now carries
`{ organization_id, retention_months, alert_email_enabled, breach_auto_open_finding,
alert_recipients }` (the last is the flat extra-recipient user-id list). `PUT` is **partial**:
only keys present in the request body are validated and written — the retention UI can PUT just
`retention_months` and the alerts UI can PUT just its three fields without clobbering the other.
`alert_recipients`, when present, is validated against the caller's org
(`getOrgMemberIdsQuery`) and any id outside the org fails with 400; on success the whole list is
replaced in one transaction (`replaceAlertRecipientsQuery`: `DELETE` then bulk `INSERT`) alongside
the `mrm_org_settings` upsert, so a partial write of settings + a stale recipient list can't be
observed mid-request.

*Frontend.* `Clients/src/presentation/pages/ModelInventory/mrm/AlertsSection.tsx` — a settings
card (email-alerts toggle, auto-open-finding toggle, an "additional recipients" multi-select,
and a save button) rendered above the pre-existing per-model role table ("who is notified for
this model"), which is unchanged. Strings are translated de/fr/es via the existing DOM-level
i18n runtime (`i18n/translations.ts`), consistent with the rest of MRM.

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
  3360-test unit suite). Alerts logic: `utils/__tests__/mrmAlerts.utils.test.ts` and
  `services/automations/actions/__tests__/mrmRevalidationSweep.test.ts` — both mock
  `inAppNotification.service`, so no unit test ever sends real email.
- Integration: tenant-isolation suites (`tests/integration/tenant-isolation/mrm-*.isolation.test.ts`)
  against a live Postgres, including `mrm-alerts.isolation.test.ts` (recipient union, breach dual
  dispatch, auto-finding dedup/lock, overdue claim, org scoping).
