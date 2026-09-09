# Feature 5 — Evidence freshness (Kanıt eskimesi)

**Date:** 2026-09-09
**Branch:** `feature/risk-inheritance`
**Original request:** "Kanıt eskimesi — evidenceHub ve modelInventory tarihli ama
risk'e bağlılığı kontrol eden yok. Kanıt 90 günde bir yenilenmezse linked risk
mitigation_status düşer / uyarı atar. automation sistemi zaten var, bir trigger
eklemek yeterli."

---

## The finding that shaped this design

The scheduling half of the request is true: the automation system is there and a
new sweep is four small edits. **The data half is not.** Today there is no
risk↔evidence relationship anywhere in the product:

| What exists | What it maps to | Maps to a risk? |
|---|---|---|
| `evidence_hub.mapped_model_ids` | model_inventories | no |
| `evidence_hub.mapped_training_ids` | trainings | no |
| `evidence_hub.framework_ids` | frameworks | no |
| `file_entity_links` (`entity_type='risk'`) | read by `Servers/advisor/functions/readinessFunctions.ts:139-160` | **no writer exists** — the risk form has no uploader |
| `risks.mitigation_evidence_document` | free-text `varchar` holding a filename | no |

So a sweep written against today's schema would run nightly and flag exactly zero
risks, forever. The feature is a **data-model change plus a sweep**, not a trigger.

### Options considered

- **A — ride the risk_links chain.** risk → confirmed `inherits_from` parent →
  `model_risks.model_id` → `evidence_hub.mapped_model_ids` → dates. Zero
  migrations, but it only ever reaches risks that already have a cross-entity
  parent, and the explanation to a user is three hops long ("your risk is stale
  because a model two links away has expiring evidence"). Rejected.
- **C — `evidence_hub.mapped_risk_ids` (chosen).** One array column mirroring the
  two mapping columns the table already has, plus one multiselect in the evidence
  modal beside the "Mapped models" one. This *is* the "risk'e bağlılık" the
  request says is missing, in the shape the table already uses.
- **B — evidence upload on the risk form** (`file_entity_links` writer + UI).
  The full version, several times the diff, and it duplicates evidence_hub.
  Rejected as YAGNI; C reaches the same outcome through the table built for it.

**Chosen: C.**

---

## Data model

### 1. `evidence_hub.mapped_risk_ids INTEGER[]`

Mirrors `mapped_model_ids` exactly — nullable array, no FK (neither existing
mapping column has one), no GIN index. The sweep reads evidence rows per org and
unnests; it never asks "which evidence points at risk X", so an index buys
nothing today.

### 2. `risks.evidence_stale_at TIMESTAMPTZ NULL`

`NULL` = fresh. Non-`NULL` = the moment the sweep first saw stale evidence.
This is deliberately the same shape as Feature 2's `risk_links.parent_level_changed_at`,
so the two flags read and render alike.

Unlike F2, **no trigger.** The sweep owns both the set and the clear:

- risk has ≥1 stale mapped evidence and `evidence_stale_at IS NULL` → set `NOW()`, notify
- risk has 0 stale mapped evidence and `evidence_stale_at IS NOT NULL` → set `NULL`, no notification
- otherwise → no write

Making the sweep idempotent this way means re-running it is free and the
notification fires once per transition, not once per night.

### 3. `enum_notification_type += 'evidence_stale'`

`ALTER TYPE ... ADD VALUE IF NOT EXISTS`, down is a no-op — exactly
`20260711090100-add-mrm-revalidation-due-notification-type.js`.
`enum_notification_entity_type` already contains `risk`; no change there.

---

## Freshness rule

Evidence is stale when **either** holds:

```sql
e.expiry_date < :now
OR e.updated_at < :now - INTERVAL '90 days'
```

Both, not one. `expiry_date` is a date a human deliberately set in the evidence
modal (the form even rejects a past date on entry), so ignoring it would be wrong.
`updated_at` is the "90 günde bir yenilenmezse" half, and it is trustworthy:
`updateEvidenceQuery` (`Servers/utils/evidenceHub.utils.ts:246-258`) writes
`updated_at = new Date()` on every save, including a save that only swaps the
attached file.

The window is a module constant, `EVIDENCE_FRESHNESS_DAYS = 90`. Not a settings
row, not an env var — one number, one caller.

---

## What the sweep does NOT do

**It does not touch `mitigation_status`.** The original note offered either
branch — "mitigation_status düşer **/** uyarı atar" — and this design takes the
second. `enum_projectrisks_mitigation_status` does already contain
`Requires review`, so the destructive branch needs no migration and stays
available later. It is left out because:

- the value it overwrites is one a human typed, and there is no undo;
- the risk form lets that human set it straight back, so the nightly sweep and
  the user would overwrite each other indefinitely;
- the flag plus the notification already deliver the signal without destroying
  anything.

If the destructive branch is wanted, it is an additive change on top of this
design (one `UPDATE` in the same transition branch that fires the notification),
not a redesign. **Open question for the user.**

---

## Backend

### Migration — `Servers/database/migrations/2026090914xxxx-evidence-freshness.js`

Three statements, all `IF NOT EXISTS`:

```sql
ALTER TABLE verifywise.evidence_hub
  ADD COLUMN IF NOT EXISTS mapped_risk_ids INTEGER[];

ALTER TABLE verifywise.risks
  ADD COLUMN IF NOT EXISTS evidence_stale_at TIMESTAMPTZ;

ALTER TYPE verifywise.enum_notification_type
  ADD VALUE IF NOT EXISTS 'evidence_stale';
```

`down` drops the two columns; the enum value's removal is a no-op with the same
header comment the MRM migration uses.

### Query — `Servers/utils/evidenceHub.utils.ts`

`mapped_risk_ids` joins `mapped_model_ids` in the `INSERT`, the `UPDATE` and the
row mapper (`getAllEvidencesQuery` already selects the whole row).

One new exported query, `getStaleEvidenceRiskIdsQuery(organizationId, now)`:

```sql
SELECT DISTINCT unnest(e.mapped_risk_ids) AS risk_id
FROM evidence_hub e
WHERE e.organization_id = :organizationId
  AND e.mapped_risk_ids IS NOT NULL
  AND array_length(e.mapped_risk_ids, 1) > 0
  AND (e.expiry_date < :now OR e.updated_at < :cutoff)
```

Style matches the file: raw `sequelize.query`, no schema prefix, replacements not
interpolation.

### Sweep — `Servers/services/automations/actions/evidenceFreshnessSweep.ts`

Modelled directly on `mrmRevalidationSweep.ts`:

```ts
export interface EvidenceFreshnessSweepSummary {
  organization_id: number;
  stale: number;    // risks now flagged
  cleared: number;  // risks whose flag was lifted
  notified: number;
}

export async function runEvidenceFreshnessSweep(
  organizationId: number,
  now: Date = new Date(),
): Promise<EvidenceFreshnessSweepSummary>

export async function runEvidenceFreshnessSweepAllOrgs(): Promise<void>
```

Same isolation discipline as the MRM sweep: each risk wrapped in its own
try/catch so one failure cannot poison the rest, and the notification wrapped in
a nested try/catch so a delivery failure never fails the sweep. Each org wrapped
again in `...AllOrgs`.

Both the flag-set and the flag-clear run as single set-based `UPDATE`s filtered
on the current flag state, so the transition detection *is* the `WHERE` clause —
`RETURNING id` gives the rows that actually transitioned, and only those get
notified.

### Notification — `Servers/services/inAppNotification.service.ts`

`notifyEvidenceStale(organizationId, risk, staleCount)`, following
`notifyPolicyDueSoon`. Recipient is `risks.risk_owner` when set; a risk with no
owner is flagged but not notified. In-app only — `sendEmailNotification = false`,
no new email template. Type `NotificationType.EVIDENCE_STALE`, entity type
`NotificationEntityType.RISK`.

### Schedule

`scheduleEvidenceFreshnessSweep()` in
`Servers/services/automations/automationProducer.ts`, pattern `0 5 * * *`
(03:00 = retention prune, 04:00 = revalidation sweep, so 05:00 is free),
`removeOnComplete: true, removeOnFail: false`, **non-obliterating**.

Registered in `Servers/jobs/producer.ts` `addAllJobs()` after the obliterating
schedulers, with the same trailing comment the two MRM schedulers carry.

Dispatched from the `else if` chain in
`Servers/services/automations/automationWorker.ts` (~line 527), next to
`mrm_revalidation_sweep`:

```ts
} else if (name === "evidence_freshness_sweep") {
  await runEvidenceFreshnessSweepAllOrgs();
}
```

No `automation_triggers` row. That table drives user-configurable email
automations; neither MRM sweep uses it, and making the window per-org
configurable is a later change, not this one.

---

## Frontend

### Evidence modal — `Clients/src/presentation/components/Modals/EvidenceHub/index.tsx`

A second `CustomizableMultiSelect`, "Mapped risks", directly under "Mapped
models" in step 3, fed by the existing risks list. Same `Suspense` wrapper, same
props shape, `placeholder="Select risks"`.

### Risk table — `Clients/src/presentation/components/Table/VWProjectRisksTable/VWProjectRisksTableBody.tsx`

An "Evidence stale" chip in the risk-name cell when `row.evidence_stale_at` is
set, `title` = the localised timestamp. Same treatment as F2's "Parent level
changed" chip in `LinkedRisksPanel/index.tsx:328-333`.

The list query is `SELECT r.* ...` (`Servers/utils/risk.utils.ts:79`), so the new
column reaches the client with no query change — only the `IRisk` interface and
the client-side risk type need the field added.

---

## Making it observable

A nightly job is invisible for a day and untestable by hand, so the feature ships
with two things that exist only to make it verifiable:

- **`POST /evidenceHub/freshness-sweep`** (Admin) runs the sweep for the caller's
  organization and returns the summary. This mirrors `POST /riskLinks/recompute`,
  which exists for the same reason. The sweep is idempotent, so a hand-run is
  safe and a second run must report zero transitions.
- **Demo evidence rows** in the `9700` id block of `seed_risk_links_demo.sql`,
  mapped to the existing demo risks: one past `expiry_date`, one untouched for 91
  days, one untouched for 89 days (the control that must stay clean), and one
  stale row mapped to two risks. `evidence_hub` has no `is_demo` column and none
  of the cascade coverage `risk_links` has, so the seed's delete block needs its
  own `DELETE FROM evidence_hub WHERE id BETWEEN 9700 AND 9799;`.

## Testing

**Unit (`Servers`, jest):** the sweep with a fabricated stale-evidence query —
sets the flag and notifies on the NULL → set transition; a second run over the
same state writes nothing and notifies nothing; evidence refreshed clears the
flag without notifying; a risk with no `risk_owner` is flagged but not notified;
a thrown notification does not abort the remaining risks.

**Integration (`Servers`, `tests/integration`):** real rows — evidence with a
past `expiry_date`, evidence 91 days untouched, evidence 89 days untouched
(control, must stay fresh), and evidence mapped to two risks (both flagged).

**Client (vitest):** the chip renders when `evidence_stale_at` is set and is
absent when it is null; the modal's "Mapped risks" value round-trips.

---

## Known limits (accepted)

- Detection granularity is one day. A piece of evidence that expires at 10:00 is
  flagged at 05:00 the next morning.
- Deleting the last stale evidence mapped to a risk clears the flag on the next
  sweep, not immediately.
- `mapped_risk_ids` has no FK, so a deleted risk leaves a dangling id in the
  array — exactly the existing behaviour of `mapped_model_ids`. The sweep's
  `UPDATE ... WHERE id IN (...)` simply matches nothing for it.
