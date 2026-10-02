# F6 — Model metadata → model risk candidate notices

> **Roadmap line.** "Model metadata → Model Risk auto-link — modelInventory
> değişince (yeni model, yeni framework) model_risks ile risks arasında
> shared-project'e göre otomatik `related_to` önerisi. MRM tarafındaki
> mrmMetricEvaluation / mrmThreshold breach'leri zaten var, risk'e köprü eksik."

**Status:** approved 2026-09-09. Phase 1 implements; phase 2 is designed here
but deferred (§8).

---

## 1. What this is

When a model inventory gains a project, or a new model risk is created on a
model that already has projects, the project risks in those projects get a
notification telling their owner there are new cross-entity link candidates to
review. The human confirms (or ignores) them in the existing
`LinkedRisksPanel`.

**No `risk_links` rows are written.** That is the whole design decision, and §2
is why.

---

## 2. Why not write the suggestion rows

The roadmap line asks for automatic cross-entity `related_to` suggestions. Three
findings, all verified against the live dev database on 2026-09-09, say the rows
would be noise rather than suggestions.

### 2.1 Cross-entity `related_to` is currently illegal

```
risk_links_cross_entity_inherits ::
  CHECK ((target_risk_id IS NOT NULL) OR (relation_type = 'inherits_from'))
```

A row whose target is a model risk or a vendor risk **must** be
`inherits_from`. Probed live:

```
INSERT INTO risk_links (..., target_model_risk_id, relation_type, ...)
VALUES (..., 9201, 'related_to', ...);
ERROR:  new row for relation "risk_links" violates check constraint
        "risk_links_cross_entity_inherits"
```

The application layer forbids it independently, at
`controllers/riskLinks.ctrl.ts:162`:

```ts
if (given[0].entityType !== "risk" && relationType !== "inherits_from") { ... }
```

So writing rows needs a migration plus a controller change. That cost is only
worth paying if the rows are good, which §2.3 says they are not.

### 2.2 `inherits_from` is not a workaround

`risk_links_single_parent_idx` is `UNIQUE (source_risk_id) WHERE inherits_from
AND confirmed`. A risk may hold exactly one confirmed parent.

Of the 22 risks that currently have shared-project model-risk candidates,
**10 already hold a confirmed parent**. Suggestions generated for those ten
could never be confirmed — the confirm would raise, and the controller would
return the single-parent error. Auto-generation collides with single-parent in
a way the human-triggered C6 pass never did, because C6 only ever proposes a
parent for a risk the direction pass judged to be a child.

The roadmap's choice of `related_to` was therefore correct engineering, not
loose wording.

### 2.3 There is no signal that discriminates the candidates

The shared-project join currently yields **89 (risk, model_risk) pairs across
22 risks**. Scoring them with the existing engine (`LINK_SCORE_THRESHOLD = 3`):

| Signal | Weight | Available on risk ↔ model_risk? |
|---|---|---|
| `shared_category` | 3 | **No** — the vocabularies are disjoint. `risks.risk_category` holds `Strategic risk`, `Operational risk`, `Compliance risk`, `Cybersecurity risk`, `Data privacy risk`, … ; `model_risks.risk_category` holds `Performance`, `Bias & Fairness`, `Security`, `Data Quality`, `Compliance`. Not one literal match. |
| `shared_control` | 2 | **No** — `model_risks` has no `controls_mapping`. |
| `shared_assessment` | 2 | **No** — no `assessment_mapping`. |
| `same_lifecycle_phase` | 2 | **No** — no `ai_lifecycle_phase`. |
| `shared_project` | 1 | Yes — but present on **89 of 89** pairs. |
| `same_owner` (candidate new signal) | — | Present on **89 of 89** pairs. Constant, not a discriminator. |

Maximum achievable score is **1**, against a threshold of **3**. The scoring
engine's own verdict on every one of these pairs is "not a link". Writing them
anyway means writing all 89 or none — there is no middle. Ranking them requires
either a hand-maintained category crosswalk (ages badly, silently) or an LLM
call on a background write path (a spending posture every prior feature in this
chain avoided by putting the model behind a button).

`model_risks` columns for the record: `id, organization_id, risk_name,
risk_category, risk_level, status, owner, target_date, description,
mitigation_plan, impact, likelihood, key_metrics, current_values, threshold,
model_id, created_at, updated_at, is_deleted, deleted_at, is_demo`.

### 2.4 What we do instead

Notify, and let the ranked picker do the ranking. C5 already ranks cross-entity
candidates and already renders the `Same project: <title>` badge; F6's job is to
tell the owner that the picker now has something new in it. This is the same
shape as F5: detect a transition, notify once, change nothing destructive.

---

## 3. Triggers

Three call sites, all **after** `transaction.commit()`, all fire-and-forget with
a `.catch()` — the shape the `notifyUserAssigned(...)` call already sitting in
`modelInventory.ctrl.ts` uses.

| # | Call site | Scope passed to the helper |
|---|---|---|
| 1 | `createNewModelInventory` — `controllers/modelInventory.ctrl.ts:221` | the `projects` array from the request body |
| 2 | `updateModelInventoryById` — `controllers/modelInventory.ctrl.ts:373` | only the **newly added** project ids (§3.1) |
| 3 | `createNewModelRisk` — `controllers/modelRisk.ctrl.ts:121` | all of the model's project ids, with candidates restricted to the new model risk |

**Trigger 3 is not in the roadmap's parenthetical ("yeni model, yeni
framework") and is included deliberately.** Without it the feature almost never
fires usefully: a model created through trigger 1 has zero model risks at the
moment of creation, so its candidate set is empty. A new model risk on an
existing model is the single most direct cause of a genuinely new candidate.

### 3.1 Why trigger 2 must diff

`updateModelInventoryByIdQuery` treats `projects` as a **full replacement** — it
deletes every `project_id` row for the model and re-inserts the given list
(`utils/modelInventory.utils.ts:356` and `:366`). Without a diff, re-saving a
model with an unchanged project list would re-notify every risk in every
attached project on every edit.

So: read the model's project ids **before** opening the transaction, and after
commit notify only for `projects \ before`. The guard block in the update query
only runs when `projects.length > 0 || deleteProjects`, so a plain field edit
(e.g. a rename) sends `projects: undefined`, the diff is empty, and nothing
fires.

### 3.2 Re-notification

A risk stops being a candidate for a given model risk once **any** `risk_links`
row exists for that pair — confirmed, suggested or dismissed (§4, `NOT
EXISTS`). A risk whose candidate the owner simply never reviewed stays a
candidate and would be notified again if the same project were detached and
re-attached. That is accepted: it is a rare, explicitly human action, and the
alternative (a per-(risk, model) notification ledger) is a table for a problem
nobody has.

---

## 4. The query

New export in `utils/riskLink.utils.ts`, next to the rest of this feature's SQL.

```sql
SELECT r.id                  AS risk_id,
       r.risk_name           AS risk_name,
       r.risk_owner          AS risk_owner,
       COUNT(DISTINCT mr.id) AS candidate_count
  FROM projects_risks pr
  JOIN risks r
    ON r.id = pr.risk_id
   AND r.organization_id = :organizationId
   AND r.is_deleted = false
  JOIN model_inventories_projects_frameworks mp
    ON mp.project_id = pr.project_id
   AND mp.organization_id = :organizationId
   AND mp.model_inventory_id = :modelInventoryId
  JOIN model_risks mr
    ON mr.model_id = mp.model_inventory_id
   AND mr.organization_id = :organizationId
   AND mr.is_deleted = false
 WHERE pr.organization_id = :organizationId
   AND pr.project_id IN (:projectIds)
   /* optional, trigger 3 only: AND mr.id IN (:modelRiskIds) */
   AND NOT EXISTS (
         SELECT 1
           FROM risk_links l
          WHERE l.organization_id     = :organizationId
            AND l.source_risk_id      = r.id
            AND l.target_model_risk_id = mr.id
       )
 GROUP BY r.id, r.risk_name, r.risk_owner
 ORDER BY r.id
 LIMIT :limit
```

Notes that are not optional:

- **`model_inventories_projects_frameworks` holds two row shapes** for the same
  model: `(model_inventory_id, project_id)` and `(model_inventory_id,
  project_id, framework_id)`. A project can therefore appear more than once.
  `COUNT(DISTINCT mr.id)` and the `GROUP BY` absorb that; a naive `COUNT(*)`
  would double-count.
- **`NOT EXISTS` is status-agnostic on purpose.** A dismissed link is a human
  saying no; re-proposing it is exactly the behaviour F4's dismissal analytics
  exists to discourage.
- **`IN (:emptyArray)`** is a Postgres syntax error and Sequelize renders it as
  `IN (NULL)`. Both `projectIds` and `modelRiskIds` must be length-guarded in
  TypeScript, and the `modelRiskIds` clause must be **appended conditionally**,
  not passed as a `:allModelRisks OR ...` toggle.
- `risk_owner` is selected but not filtered on. A risk with no owner is a real
  candidate and belongs in the count; it simply cannot be notified (§5).

`LIMIT` is `MAX_CANDIDATE_NOTICES = 25`, matching the existing
`MAX_CROSS_ENTITY_CANDIDATES = 25`.

---

## 5. The notifier

New file `services/riskLinks/modelCandidates.ts`:

```ts
export interface ModelRiskCandidateNoticeSummary {
  organization_id: number;
  model_inventory_id: number;
  risks: number;      // rows the query returned
  candidates: number; // sum of candidate_count
  notified: number;   // notifications actually sent
}
```

It runs the query, then for each row with a non-null `risk_owner` sends one
in-app notification. A per-risk failure is logged and the loop continues —
identical to the F5 sweep's notify loop.

New helper in `services/inAppNotification.service.ts`, modelled exactly on
`notifyEvidenceStale` (line 946):

```ts
// Named `notifyRiskOfModelCandidates`, NOT `notifyModelRiskCandidates` —
// the latter is the orchestrating service in services/riskLinks/modelCandidates.ts,
// which calls this once per risk. Two different functions; do not merge the names.
export const notifyRiskOfModelCandidates = async (
  organizationId: number,
  risk: { id: number; risk_name: string; risk_owner: number | null },
  model: { id: number; name: string },
  candidateCount: number,
): Promise<void> => {
  if (risk.risk_owner == null) return;
  await sendInAppNotification(
    organizationId,
    {
      user_id: risk.risk_owner,
      type: NotificationType.MODEL_RISK_CANDIDATES,
      title: "New model risks to review",
      message:
        `Risk "${risk.risk_name}" now shares a project with ` +
        `${candidateCount} model risk${candidateCount === 1 ? "" : "s"} ` +
        `from "${model.name}". Review the suggested links.`,
      entity_type: NotificationEntityType.RISK,
      entity_id: risk.id,
      entity_name: risk.risk_name,
      action_url: buildEntityUrl(NotificationEntityType.RISK, risk.id),
    },
    false,
  );
};
```

The message is phrased so it reads correctly for all three triggers: it names
the *state* ("now shares a project with"), not the event.

`entity_type: RISK` puts the action URL at `/risk-management?riskId=<id>` —
where `LinkedRisksPanel` lives. Linking to the model page would send the reader
away from the control they need.

Email is `false`, matching `notifyEvidenceStale`.

---

## 6. Migration

One statement, following `20260909223204-evidence-freshness.js` exactly:

```js
ALTER TYPE verifywise.enum_notification_type
  ADD VALUE IF NOT EXISTS 'model_risk_candidates';
```

`down` is a documented no-op: removing a Postgres enum value requires
recreating the type and migrating every column that uses it. Same decision as
`20260711090100-add-mrm-revalidation-due-notification-type.js` and the F5
migration.

`enum_notification_entity_type` already contains both `risk` and `model`; no
change there.

---

## 7. Out of scope

- **Writing `risk_links` rows.** §2. The `risk_links_cross_entity_inherits`
  CHECK and the `riskLinks.ctrl.ts:162` guard both stay as they are.
- **`recompute.ts:99-102`.** Because F6 writes no rows, the comment "C4
  cross-entity inheritance is manual-only … Recompute owns `related_to`
  suggestions, so leave these rows and their human decision untouched" stays
  true and the skip stays correct. Had F6 written cross-entity `related_to`
  rows, that ownership question would have had to be reopened.
- **Vendor risks.** The same shared-project path exists via `vendors_projects`,
  and the same argument applies, but nothing in the roadmap line asks for a
  vendor trigger and no vendor equivalent of "model inventory changed" was
  named.
- **Backfill.** Existing model/project attachments produce no notifications.
  The feature starts at the next attachment or the next model risk.
- **Frontend.** The notification list renders `title` / `message` /
  `action_url` generically; F5's `evidence_stale` needed no client change and
  neither does this. Verified twice: neither the TS enum member
  `EVIDENCE_STALE` nor the wire value `"evidence_stale"` appears anywhere
  under `Clients/src` as a notification type. (`evidence_stale_at` does — but
  that is the risk column F5 added, not a notification type.)

---

## 8. Phase 2 (deferred) — MRM breach → risk

The roadmap's second sentence: the breach machinery exists, the bridge to risk
does not. Designed here, **not implemented in phase 1**.

**Hook.** `handleBreaches(...)` — `controllers/mrmMonitoring.ctrl.ts:361`. It
already runs post-commit as a best-effort side effect: it filters `warn`/
`breach` outcomes, flags revalidation when a threshold's `breach_action` is
`NOTIFY_FLAG_REVALIDATION`, opens an MRM finding for hard breaches (gated on
`settings.breach_auto_open_finding`), and notifies MRM stakeholders. The risk
notice slots in as one more of those side effects.

**Join path.** `mrm_metric_evaluations` carries only `metric_id` and
`threshold_id` — no model column. The model comes from
`mrm_metrics.model_inventory_id` (verified: the column exists).
`mrm_thresholds.model_inventory_id` and `mrm_findings.model_inventory_id` also
exist, and `handleBreaches` already holds the model in scope for the finding it
opens, so no new join is actually needed at the hook.

**Behaviour.** On `breach` only (not `warn` — `warn` is already noisy and
already notified), reuse the §4 query scoped to that model's projects, with a
distinct message naming the breached metric, under a separate notification type.

**Why it is deferred.** Every MRM table is empty in the dev database:

```
mrm_metrics=0  mrm_thresholds=0  mrm_metric_evaluations=0  mrm_findings=0
```

There is nothing to run it against. Implementing it now ships code that cannot
be verified. Phase 2 starts with MRM demo seed data (a model, a metric, a
threshold, an ingestion that breaches it), then the bridge.

---

## 9. Testing

**Unit** — `services/riskLinks/__tests__/modelCandidates.test.ts`, mocking the
query and the notifier:

1. Empty candidate list → no notification, summary all zeros.
2. Two risks with candidates → two notifications, `candidates` is the sum.
3. A risk with `risk_owner = null` → counted in `risks`/`candidates`, not
   notified.
4. One notification throwing → the other still sends, the helper still resolves.
5. `projectIds: []` → returns early, the query is never called.

**Integration** — `tests/integration/riskLinks.modelCandidates.test.ts`, real
database, following `tests/integration/riskLinks.hierarchy.test.ts`:

1. Model attached to a project that has risks, with model risks present → a
   `notifications` row per owned risk.
2. A pair that already has a `risk_links` row with `status = 'dismissed'` → not
   a candidate, no notification.
3. A model with zero model risks → no notification (this is trigger 1's normal
   case).
4. Tenant isolation: another organization's risks in a same-named project are
   never returned.
