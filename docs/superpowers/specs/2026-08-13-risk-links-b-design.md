# Risk links B — the linked-risks UI

> **Status:** Approved design, ready for implementation plan
> **Date:** 2026-08-13
> **Scope:** One new write endpoint, one new UI surface, and the removal of the client-side scoring duplicate it replaces.
> **Builds on:** `2026-08-12-risk-links-a1-design.md`, `2026-08-13-risk-links-a2a-design.md`

---

## 1. Summary

A1 and A2a built a link engine nothing can see. `risk_links` fills in the background, three endpoints serve it, and no screen in the product reads any of them.

B is the surface. A **Linked risks** tab inside the risk edit modal lists the engine's suggestions, lets a human confirm or dismiss each one, and lets a human assert a link the engine never found — including `inherits_from`, the relation this branch is named after and which nothing has ever been able to create.

B also **deletes** a feature. `Clients/src/application/tools/relatedRisks.ts` is a browser-side reimplementation of tier 0 — same weights, same `"0"` sentinel rule — feeding a transient post-save modal. It and the server engine cannot coexist: they disagree, because only the server has tier 1. The client copy goes.

---

## 2. Where this sits

| Phase | State |
|---|---|
| A1 — edge store, tier 0, worker, three endpoints | shipped |
| A2a — tier 1 structural graph | shipped |
| A2b — embeddings | deferred |
| **B — this document** | **UI + one write endpoint** |
| C — the agent | later |

### Out of scope for B (explicit — do NOT build)

- **A2b embeddings**, and the `duplicates` relation type.
- **Navigation to the related risk.** The deleted modal had an "Open" button. Reproducing it inside the risk edit modal requires threading a callback through `AddNewRiskForm` (243 lines) → `NewRisk` (688) → `RiskManagement` (1145) so one modal can close and another open. §7 explains why the panel is useful without it.
- **Link counts or badges on the risk table.** There is no batch-count endpoint and B does not add one.
- **An org-wide triage page.** The read API is per-risk only.
- **The DB constraint closing the concurrent-mutual-inheritance race.** §4.4 states the ceiling and why it is accepted.
- **Any scoring change.** `LINK_SCORE_THRESHOLD`, `MAX_LINKS_PER_RISK`, and both providers are untouched.

---

## 3. What already exists, and what it forces

Three facts from the shipped code determine most of this design. None of them are negotiable.

### 3.1 The engine cannot feed a post-save modal

`controllers/risks.ctrl.ts:286` and `:546` call `enqueueRiskLinkRecompute(...).catch(...)` — fire-and-forget, never awaited. The save response returns before the BullMQ job starts, and the job id `risk-link:<org>:<risk>` means a save arriving while a job is active is dropped rather than queued.

So a modal that fetches `GET /api/riskLinks/:riskId` immediately after a save reliably shows nothing on a new risk. The current modal only feels instant because it computes in the browser.

This is why B is a **replacement**, not an addition: any design that keeps a post-save nudge has to either keep the client-side scorer (two contradicting scores) or invent a readiness signal the API does not have.

### 3.2 The migration already anticipated manual links

`database/migrations/20260812185522-create-risk-links.js`:

```sql
CONSTRAINT risk_links_no_self CHECK (source_risk_id <> target_risk_id),
CONSTRAINT risk_links_canonical CHECK (
  relation_type = 'inherits_from' OR source_risk_id < target_risk_id
),
CONSTRAINT risk_links_unique UNIQUE (source_risk_id, target_risk_id, relation_type)
```

`inherits_from` is **explicitly exempted from canonicalisation** — direction is carried by which column an id sits in. `score NUMERIC(6,3) NOT NULL DEFAULT 0` and `reasons JSONB NOT NULL DEFAULT '[]'` mean a manual link can omit both. `created_by_user_id` exists and is written by nothing today.

The unique key includes `relation_type`, so one pair may hold both a derived `related_to` and a human `inherits_from`. That is intended.

### 3.3 Manual links are already immune to recompute

The prune at `utils/riskLink.utils.ts:262` deletes only where `source = 'derived' AND status = 'suggested'`. A row written with `source = 'user'` survives every recompute, and so does any row a human has decided on. B relies on this rather than adding protection of its own.

---

## 4. Backend: `POST /api/riskLinks`

### 4.1 Route

`routes/riskLinks.route.ts`, one line:

```ts
router.post("/", authenticateJWT, createRiskLink);
```

No `authorize(...)`. The sibling `PATCH /:id` and `POST /api/risks` both gate on JWT alone; gating link creation harder than risk creation would be incoherent. That any authenticated role — including Auditor, nominally read-only — can write risks is a pre-existing gap in this codebase. B matches the surrounding behaviour and does not fix it.

No path collision: `POST /recompute` is a distinct path.

### 4.2 Request

```ts
{ sourceRiskId: number, targetRiskId: number, relationType: "related_to" | "inherits_from" }
```

The client sends ids explicitly rather than a `direction` enum. `direction` is meaningless for `related_to`, and it already exists on the **read** side as a value `toResponse` derives; making it an input too would compute the same word in one place and accept it in another.

For `inherits_from`, `sourceRiskId` is the risk that **inherits** and `targetRiskId` is the risk inherited **from** — matching how `riskLinks.ctrl.ts:44` reads direction back out.

### 4.3 Validation, in order

| # | Check | Failure |
|---|---|---|
| 1 | ids parse as integers; `relationType` is one of the two | `400 Invalid request` |
| 2 | `sourceRiskId !== targetRiskId` | `400 A risk cannot link to itself` |
| 3 | both ids are live risks in `req.organizationId` — one query, expect two rows | `404 Risk not found` |
| 4 | if `inherits_from`: the reverse row must not exist | `409 These risks would inherit from each other` |
| 5 | insert with `ON CONFLICT DO NOTHING RETURNING id`; zero rows returned | `409 These risks are already linked` |

Step 3 is the tenant boundary. Without it a caller can name another organisation's risk id: the table's `organization_id` column is set from the token, so the row would land in the caller's org while pointing at a foreign risk. It is the same class of hole A2a's degree query had to close.

Step 4 runs before step 5 so the two 409s carry different messages. `ON CONFLICT DO NOTHING` is used in preference to catching a unique-violation error code — the store returns rows or it does not, and the controller does not sniff driver errors.

`canonicalPair` (from `services/riskLinks/types`) is applied **only** when `relationType === "related_to"`, mirroring the CHECK constraint. Getting this backwards is the single most likely implementation error in B; §8.1 pins it with a test.

### 4.4 The accepted race

Two admins creating opposite `inherits_from` edges in the same instant both pass step 4 and both rows land, producing a two-cycle. Closing it properly needs a database constraint, i.e. another migration.

B accepts the application-level check and marks the ceiling in a comment. The race requires two humans asserting contradictory inheritance within milliseconds, the result is displayable rather than corrupting, and either row can be dismissed.

### 4.5 Store

`createUserRiskLinkQuery` in `utils/riskLink.utils.ts`, alongside the existing `upsertRiskLinkQuery`:

- `status = 'confirmed'` — the human asserted it; it is not a suggestion awaiting triage.
- `source = 'user'`
- `created_by_user_id` and `decided_by_user_id` = the caller, `decided_at = NOW()`
- `score` and `reasons` left to their column defaults (`0`, `[]`)

Confirmed-and-user-sourced makes the row immune to the §3.3 prune on both of its two conditions.

### 4.6 Response

`201 { id }`. The client invalidates its query and refetches rather than splicing a returned row into local state — consistent with `PATCH /:id`, which returns `{ id, status }`.

### 4.7 Generated artifacts

`npm run generate:swagger` and `npm run generate:endpoints` must be re-run and committed. **`check:api-drift` moves off 705.** The implementation plan pins the new number after regeneration, so the change is not mistaken for a failure — A2a's handoff treated 705 as an invariant and B breaks it deliberately.

---

## 5. Frontend structure

Follows the `Clients/CLAUDE.md` layer flow — Component → Repository → Hook. Not the `ProjectRiskLinkedPolicies.tsx` pattern, which hand-rolls `useEffect` fetching with untyped `any` and no React Query; it is the nearest precedent by subject matter and the wrong one by construction.

### 5.1 Created

| File | Responsibility |
|---|---|
| `domain/interfaces/i.riskLink.ts` | `RiskLink`, `RiskLinkStatus`, `RiskLinkRelationType`, `CreateRiskLinkInput`, mirroring `toResponse` exactly |
| `application/repository/riskLink.repository.ts` | Four calls, in the `policy.repository.ts` style (`apiServices` + `extractData` + `APIError`) |
| `application/hooks/useRiskLinks.ts` | `useRiskLinks(riskId, status?)` plus three mutations, all invalidating `["riskLinks", riskId]` |
| `presentation/components/LinkedRisksPanel/index.tsx` | Grouped list, per-link actions, empty state |
| `presentation/components/LinkedRisksPanel/LinkRiskForm.tsx` | Autocomplete + relation selector + create |

Splitting the picker out keeps both files near 150 lines; combined they would be roughly 300 and doing two jobs.

The response type mirrors the controller:

```ts
interface RiskLink {
  id: number;
  status: "suggested" | "confirmed" | "dismissed";
  source: "derived" | "user" | "agent";
  relationType: "related_to" | "inherits_from";
  score: number;
  reasons: { signal: string; weight: number; detail?: string }[];
  direction: "outgoing" | "incoming" | "undirected";
  decidedAt: string | null;
  lastComputedAt: string | null;
  relatedRisk: { id: number; name: string | null; riskLevel: string | null; ownerId: number | null };
}
```

### 5.2 Modified

**`presentation/components/AddNewRiskForm/index.tsx`** — two blocks mirroring the Activity tab at `:132` and `:201`, under the identical gate:

```tsx
{popupStatus === "edit" && entityId && (
  <Tab label="Linked risks" value="linked-risks" sx={tabStyle} disableRipple={disableRipple} />
)}
…
{popupStatus === "edit" && entityId && (
  <TabPanel value="linked-risks" sx={{ p: 0 }}>
    <LinkedRisksPanel riskId={entityId} />
  </TabPanel>
)}
```

No `keepMounted` — unlike the Risks and Mitigation panels, this one should fetch when opened, not on every risk edit.

**`presentation/pages/RiskManagement/index.tsx`** — deletions only. Removing `showRelatedRisks` (`:640`) also makes `previousIds` (`:650`) dead and collapses both `fetchProjectRisks().then((fresh) => …)` callbacks to bare `void fetchProjectRisks()`.

### 5.3 Deleted

| File | Lines |
|---|---|
| `application/tools/relatedRisks.ts` | 136 |
| `application/tools/__tests__/relatedRisks.test.ts` | 198 |
| `presentation/components/RelatedRisksSummary/index.tsx` | 76 |
| `presentation/components/RelatedRisksSummary/__tests__/index.test.tsx` | 65 |

Plus six regions in `RiskManagement/index.tsx`: imports `:21` and `:23`; the `relatedSummary` state `:120–123`; `showRelatedRisks` `:636–647`; its two call sites `:663` and `:678`; the render block `:1077–1088`. No other file imports either module.

The frontend comes out roughly line-neutral. B replaces a feature rather than stacking on it.

---

## 6. Panel behaviour

### 6.1 Grouping

Three groups, each hidden when empty. Within a group the API's `score DESC, related.id ASC` order is preserved.

| Group | Filter |
|---|---|
| Inherits from | `relationType === "inherits_from" && direction === "outgoing"` |
| Inherited by | `relationType === "inherits_from" && direction === "incoming"` |
| Related risks | `relationType === "related_to"` |

`direction` is the field `toResponse` already computes and nothing currently reads. Most risks will show only the third group.

### 6.2 Row

Risk name, risk-level `Chip`, reason `Chip`s built from `reasons[].signal` and `detail`, and the score.

The score is **hidden when `source === "user"`** — it is `0` by column default there and means nothing. Showing "0" next to a link a human deliberately asserted reads as a weak link.

### 6.3 Actions

Driven by the backend's `ALLOWED_TRANSITIONS` (`riskLinks.ctrl.ts:24`), not re-derived:

| Status | Offered |
|---|---|
| `suggested` | Confirm, Dismiss |
| `confirmed` | Dismiss |
| `dismissed`, `source === "derived"` | Restore (→ `suggested`), Confirm |
| `dismissed`, `source === "user"` | Confirm only |

The last row is not a simplification. `dismissed → suggested` clears `decided_by_user_id` and `decided_at` so a later recompute may prune the edge normally again — but the prune also requires `source = 'derived'` (§3.3), so returning a human-created link to `suggested` achieves nothing and misdescribes it as a machine suggestion. Confirm is the only meaningful undo there.

Dismissed links are invisible by default — the API's `DEFAULT_STATUSES` is `suggested` + `confirmed`. A **Show dismissed** toggle re-queries with `?status=dismissed`.

The toggle is not decoration. `dismissed → suggested` is documented at `riskLinks.ctrl.ts:20` as "the explicit undo". Without a way to reach a dismissed link, that path is dead code and a misclick is permanent.

Because the API accepts one status at a time, the toggle switches the view rather than appending to it.

### 6.4 Link a risk

A button at the top of the panel toggles `LinkRiskForm` open. It offers an Autocomplete over the org's active risks and a three-way relation choice:

| Choice | Payload |
|---|---|
| Related to | `{ sourceRiskId: subject, targetRiskId: partner, relationType: "related_to" }` |
| Inherits from | `{ sourceRiskId: subject, targetRiskId: partner, relationType: "inherits_from" }` |
| Is inherited by | `{ sourceRiskId: partner, targetRiskId: subject, relationType: "inherits_from" }` |

The client never canonicalises. The server does, and only for `related_to` (§4.3).

Candidates come from `getAllProjectRisks({ filter: "active" })` (`projectRisk.repository.ts:16`) through a `useQuery` in the form. **Not** `useProjectRisks` — that hook calls `getAllProjectRisksByProjectId` and is scoped to one project; links are org-wide.

Candidates exclude:

- the subject itself
- any risk already linked to the subject **with the currently selected relation type** — not merely already linked, since a pair may legitimately hold both a `related_to` and an `inherits_from`
- for either inheritance choice, any risk holding the reverse `inherits_from`

All three are computed from the link list the panel already fetched. This reduces both 409s from §4.3 to genuine races.

### 6.5 Empty state

"No linked risks yet."

Admins — via the existing `useIsAdmin` hook (`application/hooks/useIsAdmin.ts:25`) — additionally get **Scan for related risks**, calling `POST /api/riskLinks/recompute`, followed by a toast: *"Scanning N risks. Links will appear as the scan completes."*

The copy says *scanning N risks*, not *this risk*: the action is org-wide, and the endpoint returns `{ enqueued }` so N is real rather than guessed.

This button is what stops B shipping dead on an existing install. `risk_links` only fills as risks are saved, so every risk predating A1 has no links and every panel is empty until someone triggers a backfill.

Non-admins get one explanatory line and no button. **Link a risk** stays available to everyone in either case — manual linking does not need the engine.

### 6.6 Errors

| Case | Behaviour |
|---|---|
| 409 | Inline in the form, with the two cases distinguished by the messages in §4.3 |
| 404 | "One of these risks no longer exists", and invalidate the query |
| Query failure | `Alert` with retry, in place of the list |

---

## 7. What the user loses, and why that is acceptable

The deleted modal pushed itself in front of the user after every save. The panel waits to be opened. That is a real reduction in discovery, and it is the price of §3.1: the server engine cannot be pushed at save time without either keeping a second, contradicting scorer, or building a readiness protocol the API does not have.

What the user gains in exchange: links that persist, that survive reload, that carry tier-1 structural evidence the browser cannot compute, that record a decision, and that a human can create by hand.

The panel is useful without the "Open" navigation (§2) because a link is displayed with the partner's name, risk level and the specific reasons it matched. That is enough to decide whether it matters; acting on it is a separate trip either way.

If discovery proves too weak in practice, the cheapest fix is a link count on the risk table — which needs a batch-count endpoint, and is deliberately not in B.

---

## 8. Testing

### 8.1 `controllers/__tests__/riskLinks.ctrl.test.ts` (modified)

Cases for `createRiskLink`: malformed body → 400; self-link → 400; unknown or cross-org risk id → 404; duplicate pair → 409; reverse `inherits_from` → 409; and 201 for each relation type.

The load-bearing assertion is **column placement**: a `related_to` posted as `{ source: 9, target: 4 }` must be stored as `{ 4, 9 }`, while an `inherits_from` posted identically must be stored as `{ 9, 4 }`. That is the entire point of the CHECK exemption in §3.2, and it is the one thing an implementer can silently invert — with no visible symptom until someone reads an inheritance backwards.

### 8.2 `tests/integration/tenant-isolation/riskLinks.isolation.test.ts` (modified)

One real-database case: organisation A cannot create a link naming organisation B's risk. The controller test's 404 is mocked; this is the tier where the isolation claim is actually tested.

### 8.3 `application/hooks/__tests__/useRiskLinks.test.ts` (new)

Query key shape, and that each of the three mutations invalidates `["riskLinks", riskId]`. Follows `useVendorRiskMutations.test.ts`, which is the closest existing React Query mutation-hook test.

### 8.4 `LinkRiskForm` tests (new)

Each of the three relation choices produces the exact payload in §6.4 — the client half of the §8.1 assertion. Plus candidate exclusion for the reverse-inheritance case.

### 8.5 `LinkedRisksPanel` tests (new)

Grouping by direction; the action set per status **and source**, including that a dismissed `source === "user"` link offers Confirm but not Restore; the Admin/non-admin fork in the empty state; the Show dismissed toggle re-querying with `?status=dismissed`.

---

## 9. Files

**Backend**

| File | Change |
|---|---|
| `Servers/routes/riskLinks.route.ts` | +1 route |
| `Servers/controllers/riskLinks.ctrl.ts` | +`createRiskLink` |
| `Servers/utils/riskLink.utils.ts` | +`createUserRiskLinkQuery`, +a pair/existence lookup for step 4, +a live-risk check for step 3 |
| `Servers/swagger.yaml` | regenerated |
| `docs/api-docs/src/config/endpoints.ts` | regenerated |
| `Servers/controllers/__tests__/riskLinks.ctrl.test.ts` | modified |
| `Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts` | modified |

No migration. No model change. No change to `services/riskLinks/`.

**Frontend**

| File | Change |
|---|---|
| `Clients/src/domain/interfaces/i.riskLink.ts` | new |
| `Clients/src/application/repository/riskLink.repository.ts` | new |
| `Clients/src/application/hooks/useRiskLinks.ts` | new |
| `Clients/src/presentation/components/LinkedRisksPanel/index.tsx` | new |
| `Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx` | new |
| tests for the hook and both components | new |
| `Clients/src/presentation/components/AddNewRiskForm/index.tsx` | +tab, +panel |
| `Clients/src/presentation/pages/RiskManagement/index.tsx` | deletions only |
| the four files in §5.3 | deleted |

---

## 10. Done when

- `cd Servers && npm run build` clean; `npm test` green.
- `cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift` — agreeing on the new count, pinned in the plan.
- `cd Clients && npm run build` clean; `npm run test` green.
- The four files in §5.3 are gone and nothing imports them.
- `git grep -n "findRelatedRisks\|RelatedRisksSummary"` returns nothing.
