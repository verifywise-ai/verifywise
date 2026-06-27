# Regulation Impact Analysis — design spec (V1: detect-only)

> **Status:** Design approved 2026-06-27. Builds on the Regulations Tracker module
> (`feat/regulations-tracker`). Scope: detect-only, LLM-key-gated. Task creation,
> completion tracking and audit evidence are explicitly OUT of V1 (future work).
>
> Reference: `docs/technical/domains/regulations-tracker.md` (the base module).

---

## 1. Problem & promise

Today's Regulations Tracker is a passive feed: a tracked country's regulations change → the org
gets a notification + a detail page. The human must then work out what the change *means for their
organisation*. This feature closes that gap.

**Promise (for orgs with an LLM key configured):** when a tracked country's regulation changes, the
country detail page shows an **Impact panel**, and the change notification carries the headline counts:

> **This change affects your organisation**
> ✓ 4 AI systems — *Fraud Scorer, Resume Ranker, …*
> ✓ 9 controls require review
> ✓ 2 policies may be outdated
> ✓ 5 vendors impacted
> ✓ 12 assessments should be updated

Each line expands to the specific entities, each with a one-sentence **"why"** the LLM produced.

**Orgs without an LLM key** keep today's behaviour unchanged (notification + detail page), **plus** a
single appended line on the change notification nudging the admin to configure a key. No empty panel,
no separate nag notification.

This is a **pure additive, key-gated upgrade**. Nothing in the existing module changes for keyless orgs.

---

## 2. Architecture — two-stage funnel

The schema reality (see §6) is that the org graph stores **region** (a coarse enum) and **framework
name**, while the feed gives a **country** + free-text obligations. Pure attribute joins cannot
credibly produce "*these 4 systems*." So we narrow deterministically, then let the LLM decide precisely.

```
Regulation change (country X, framework type, obligations[], lastChange diff)
        │
   Stage A — Deterministic candidate filter (no LLM, cheap, always runs)
        │   Produces an over-inclusive CANDIDATE SET per entity type.
        │   A type with zero candidates is skipped entirely (no LLM call, no spend).
        │
   Stage B — LLM verdict (org's llm_keys config, via runAdvisorAiSdk)
        │   ONE call PER ENTITY TYPE. Filter-and-annotate only.
        │   Each candidate → { affected: bool, why: string }, validated against
        │   the candidate set we sent. Never additive.
        │
   Impact panel = candidates where affected === true, grouped by type.
   Notification counts = the validated affected-only counts.
```

**Why this split:** Stage A keeps the LLM bounded — we never ask the LLM about the whole org, only
plausible candidates. Stage B supplies the precision and the human-readable "why" the columns can't.

**Safety guarantee:** the LLM can only *filter and annotate* the candidate set Stage A already found.
It can never introduce an entity, id or name we didn't send. We enforce this in code (validation, §5).

---

## 3. Stage A — deterministic candidate filter

For a changed country (slug, mapped region, framework name(s) the regulation maps to):

| Entity type | Candidate rule | Strength |
|---|---|---|
| **AI systems** (`projects`) | `geography` matches country→region map, **OR** linked via `project_frameworks` to the regulation's framework | Coarse (region, not country) — LLM refines |
| **Controls** | belong to a project whose framework matches (3-hop: `controls→control_categories→projects→project_frameworks→frameworks`) | OK when regulation maps to a framework |
| **Assessments** | `project_id` ∈ candidate projects | Inherited from project |
| **Vendors** | `regulatory_exposure` maps to the framework, **OR** linked (`vendorsProjects`) to a candidate project | Weak (single-value enum) — LLM refines |
| **Policies** | linked (`policy_linked_objects`, `object_type='control'`) to a candidate control | **Weakest** — standalone policies unmatched (V1 limit) |

- **Country → region map** is a static config (the `geography` enum has no DB lookup table):
  `1 Global, 2 Europe, 3 North America, 4 South America, 5 Asia, 6 Africa`. The map assigns each feed
  country to one region; "Global" candidates always included. This is intentionally lossy — Stage B
  reads the actual country name from the regulation and can reason an entity is out of scope.
- **Framework match** is by `frameworks.name` (exact string; the 4 seeded names are
  `EU AI Act`, `ISO 42001`, `ISO 27001`, `NIST AI RMF`). Framework IDs are not stable across installs.
  A static map associates a regulation's `type`/jurisdiction to framework name(s) where applicable.
- All queries tenant-scoped: unqualified table names, `WHERE organization_id = :organizationId`.

---

## 4. Timing — eager at sync time

When the weekly sync (or admin `POST /sync`) detects a country change, the impact analysis runs inside
the existing notification phase of `syncRegulationsTracker.ts`. That phase is an **outer per-org loop**
(`for (const [orgId, countries] of byOrg)`, ~line 262) with an **inner per-country loop**
(`for (const c of countries)`, ~line 275). The impact-analysis hook sits at the **top of the inner
loop**, before the per-user notification fan-out.

**Per org (resolved once, at the top of the `byOrg` loop, before the country loop):**
- `hasKey = (await getLLMKeysWithKeyQuery(orgId)).length > 0`. Resolve **once per org**, not per country
  (the result also drives the no-key nudge in §7).
- `impactEnabled` — read from `regulation_tracker_settings.impact_enabled` (default `true`; see §5a).
  When a key exists but `impactEnabled === false`, the org has **opted out**: skip Stage A/B entirely
  and emit today's plain notification with **no** counts and **no** nudge (they made a choice).
- After the country loop, if any impact pass ran for the org, set
  `regulation_tracker_settings.last_impact_run_at = NOW()` (the Settings "Last impact run" line, §5a).

**Per (org, country) — inside the inner loop, only when `hasKey && impactEnabled`:**
1. **Fetch detail.** `CountryChange`/`c` carries only `lines[]`/`changeCount`/`changeDates` — NOT
   obligations. Query `regulation_countries WHERE slug = :slug` for `data` (JSONB) + `hash` to get
   `obligations[]`, `name`, `type`, `status`, `maxPenalty`, country name. (One query per changed country,
   not per org — cache the detail in a `Map<slug, detail>` across the outer loop.)
2. **Cache check.** If a `regulation_impact_analysis` row for `(orgId, slug)` already has
   `regulation_hash === current hash` and `status='ok'`, reuse it — no LLM. (Covers re-runs and admin
   refresh hitting an unchanged hash.)
3. **Stage A** per entity type. All five empty → persist `status='skipped_no_candidates'`,
   `result=NULL`; plain notification (today's `c.lines`, no counts).
4. **Stage B** — one LLM call **per non-empty type**, the 5 calls run with `Promise.all` (bounded:
   ≤5 concurrent per country). Validate, assemble `result`, upsert `status='ok'`.
5. **Build the count-bearing notification message** from validated affected-only counts (§7).

**Isolation (mandatory, not optional):** `runAdvisorAiSdk` **throws** on LLM error, and the whole
notification phase sits inside a try/catch (line ~231) that calls `recordRunStatus("error")` and
**rethrows** — so an unguarded throw here would mark the entire sync failed even though the catalogue
write and other orgs' notifications succeeded. Therefore each per-(org,country) impact analysis is
wrapped in its **own** try/catch: on any failure → log, upsert `status='error'`, `result=NULL`, and
fall back to today's plain notification (org has a key, so **no** nudge line). Continue the loop.

**Cost & latency bounding:** only orgs tracking the changed country, only those with a key, only
non-empty types; ≤5 concurrent LLM calls per (org, country) via `Promise.all`; country detail fetched
once per slug and memoised; cached by hash so re-runs are free. A **per-run safety cap**
(`IMPACT_MAX_ANALYSES_PER_RUN`, default e.g. 200) bounds total LLM calls in one sync; analyses beyond
the cap are skipped (logged), so a feed touching many countries can't fan out unboundedly.

---

## 5. Data model & API

### Table `regulation_impact_analysis` (tenant-scoped)

DDL uses the `verifywise.` prefix; app queries use unqualified names. New migration file (timestamp via
`date +%Y%m%d%H%M%S`).

| Column | Type | Note |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | module convention (explicit surrogate key) |
| `organization_id` | `INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE` | tenant scope |
| `country_slug` | `VARCHAR NOT NULL` | which regulation |
| `regulation_hash` | `VARCHAR NOT NULL` | cache key; analysis is stale once `regulation_countries.hash` moves |
| `result` | `JSONB` (**nullable**) | `{systems:[{id,name,why}], controls:[…], policies:[…], vendors:[…], assessments:[…], generatedAt}`. NULL when `status ≠ ok` — documented exception to the module's NOT-NULL-JSONB norm |
| `status` | `VARCHAR(120) NOT NULL` | free-text like `last_run_status`; values `ok` / `skipped_no_candidates` / `error` |
| `model` | `VARCHAR` | which LLM produced it (out of JSONB for queryability) |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |
| `refreshed_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | bumped on every upsert — "analysis last run" |
| | `UNIQUE (organization_id, country_slug)` | one current analysis per org+country |

Upsert: `INSERT … ON CONFLICT (organization_id, country_slug) DO UPDATE` (set result/status/model/
hash/refreshed_at).

### Endpoints (added to `regulationsTracker.route.ts`)

> **⚠ Route ordering:** `GET /countries/:slug/impact` MUST be registered **before**
> `GET /countries/:slug`, or Express captures `slug="france/impact"` and routes to the wrong handler.

| Method/path | Auth | Behaviour |
|---|---|---|
| `GET /countries/:slug/impact` | any authed user in org | Single JOIN'd query against `regulation_countries` returns `{ result, status, refreshed_at, stale }` where `stale = (stored regulation_hash ≠ current hash)`. Returns `200` with `null` when no analysis row exists (keyless orgs simply have no row — the endpoint does NOT probe key state). Read-only. |
| `POST /countries/:slug/impact/refresh` | **Admin** | Manually re-run analysis against the current hash. Covers "I just set my key" / "I added a system." |

- Admin guard: **first line in the controller**, reuse `isAdmin` helper (`regulationsTracker.ctrl.ts:26`),
  `return res.status(403).json(STATUS_CODE[403]("Admin access required"))`. No route-layer RBAC.
- Rate limiter: a **new** `regulationsTrackerImpactLimiter` (own config block in `RATE_LIMIT_CONFIGS`),
  not the sync limiter — so refresh and sync windows don't couple. Placed after `authenticateJWT`,
  before the controller.
- Response helper: `STATUS_CODE[200](data)` (always 200 for success). Errors `STATUS_CODE[500]((error as Error).message)`.
- The sync job writes rows via the same util the refresh endpoint calls (`runImpactAnalysis(orgId, country)`);
  the GET endpoint only ever reads.

---

## 5a. Settings page additions

Three items are added to the existing Regulations Tracker **Settings** page (admin view). They reuse the
existing tenant settings table `regulation_tracker_settings` and the existing GET/PUT `/settings`
endpoints — no new settings endpoint.

**Schema changes** (migration adds two columns to `regulation_tracker_settings`):
- `impact_enabled BOOLEAN NOT NULL DEFAULT true` — existing rows light up enabled.
- `last_impact_run_at TIMESTAMPTZ` (nullable) — bumped by the sync after an org's impact pass.

**GET `/settings` response gains:**
- `impact_enabled` (boolean) — from the row.
- `last_impact_run_at` (timestamp | null) — from the row.
- `has_llm_key` (boolean) — **computed** at request time via `getLLMKeysWithKeyQuery(org).length > 0`,
  never stored (always reflects reality, no drift).

**PUT `/settings` gains:** an optional `impact_enabled` boolean (Admin only, same endpoint/guard as the
existing recipient updates). Recipients and `impact_enabled` can be saved in the same call.

**The three UI items (admin view):**
1. **Enable/disable toggle** — `Toggle` (from `components/Inputs/Toggle/`, a new pattern on this page),
   bound to `impact_enabled`, auto-saved (debounced) like the existing recipient fields. Default ON.
2. **LLM-key status indicator** — read-only line driven by `has_llm_key`: "Impact analysis: active"
   when true, else "Configure an LLM key to enable impact analysis" with a deep link to LLM key settings.
3. **"Last impact run" status line** — read-only: "Impact analysis last ran: {date}" from
   `last_impact_run_at` (or "Not run yet" when null). Mirrors the existing "Last checked" cadence line.

**Gating interaction:** the toggle gates the sync (`hasKey && impactEnabled`, §4) and the refresh
endpoint (a `POST …/impact/refresh` when `impact_enabled === false` returns `200` with
`status:"disabled"` and does not call the LLM).

---

## 6. LLM contract (Stage B)

Reuses the AI Advisor mechanism (NOT the AI Gateway): `getLLMKeysWithKeyQuery(organizationId)` returns
the org's keys including the decrypted `key`, `name` (provider), `url`, `model`. We pick the first key
(`clients[0]`, matching the advisor's default) and build `AiSdkAdvisorParams`:
`{ apiKey: key, baseURL: url || getLLMProviderUrl(name), model, provider: name, tenant: orgId,
userPrompt, availableTools: {}, toolsDefinition: [] }`. `userId`/`sessionId` omitted (no memory writes
wanted). **No JSON mode exists** — we instruct JSON in the prompt and `JSON.parse` the returned string,
guarded by try/catch. `runAdvisorAiSdk` returns `Promise<string>` and **throws** on any LLM/provider
error — every call is inside the per-(org,country) try/catch from §4.

**One call per entity type** (five types). A type with no Stage-A candidates is skipped. Each type's
prompt uses the same six rules; only the type noun/verb and the closing instruction differ
("controls require review," "policies may be outdated," "vendors impacted," etc.). One type failing
validation drops only that type's line — the rest of the panel still renders (partial-failure resilient).

### System prompt (per type — verb adapted)

> You are a compliance analyst assessing how a specific change to an AI regulation affects a list of an
> organisation's governance entities. You will be given: the regulation's identity and country, the
> **specific change that just occurred** (not the whole regulation), and a numbered list of candidate
> entities, each with a type, id, name and description.
>
> For **each** candidate, decide whether *this specific change* plausibly creates new or altered
> obligations for that entity.
>
> Rules you must follow:
> 1. **Judge the change, not the regulation in general.** An entity is "affected" only if the described
>    change alters what the organisation must do about it. If the entity is subject to the regulation but
>    this particular change doesn't touch it, mark it not affected.
> 2. **Be conservative — when unsure, mark not affected.** A false "affected" wastes the team's time and
>    erodes trust. Only mark affected when the link is clear from the text provided.
> 3. **Use only the information given.** Do not assume facts about an entity beyond its description. Do
>    not infer geography, sector or framework that isn't stated.
> 4. **Only reason about entities in the provided list.** Never introduce an entity, id or name that was
>    not given to you.
> 5. For each affected entity, give **one sentence** stating the concrete reason, citing the specific
>    obligation or change. No generic statements like "this regulation is important."
> 6. If a candidate is not affected, still return it with `affected: false` and a short reason.
>
> Return **only** valid JSON matching the schema. No prose outside the JSON.

### User message (structured)

```
REGULATION: {name} ({type}, {status}) — {country}
THE CHANGE: {history.lastChange.changes[] as bullet lines}
KEY OBLIGATIONS: {obligations[] joined}
MAX PENALTY: {maxPenalty}

CANDIDATE ENTITIES:
[system] id=42 "Resume Ranker" — {description/oneliner}
[system] id=51 "Fraud Scorer" — {…}
...
```

### Output schema (enforced in code)

```json
{ "results": [ { "type": "system", "id": 42, "affected": true, "why": "…" } ] }
```

Validation: every `id` must be one we sent; `type` must match what we sent for that id; `affected`
boolean; `why` non-empty. Drop anything malformed or hallucinated. If the whole response is unusable →
`status='error'`, `result=null`, fall back to plain notification.

---

## 7. Notifications

- **Affected (key present):** the existing per-country deep-linked notification gains the headline
  counts ("4 AI systems affected, 9 controls need review …"), deep-linking to
  `/regulations-tracker/<slug>` where the full panel renders. Built from validated affected-only counts.
- **Keyless org, change affects them:** the per-(org,country) notification `message` (built at
  ~line 294) gains **one appended line** — "Configure an LLM key to see which of your AI systems,
  controls and vendors this affects." — deep-linking to LLM key settings. Gated on the per-org `hasKey`
  flag resolved once at the top of the `byOrg` loop (§4), so the line is appended uniformly to every
  affected country's message for that org. Only appears when there's a real change AND the org has no
  key. No separate notification, no nag flag.
- **Stage B errored (org has a key):** fall back to today's plain notification (`c.lines`) — no counts,
  **no** nudge line (the org has a key; nudging would be wrong).

---

## 8. Frontend

`pages/RegulationsTracker/CountryDetail` gains an **Impact** section (key-configured orgs only):
- Five collapsible lines (systems / controls / policies / vendors / assessments) with counts; each
  expands to the entities + their "why".
- A `stale` banner when the stored analysis predates the current hash, with an admin "Re-analyse" action
  (`POST …/impact/refresh`).
- Keyless orgs: no panel (the appended notification line is the only surface).

`pages/RegulationsTracker/Settings` gains the three items from §5a (toggle + two read-only status lines),
wired through the existing `useSettings`/`useUpdateSettings` hooks (the response just carries the new
fields).

Repository/hook additions mirror the existing `regulationsTracker.repository.ts` / `useRegulationsTracker.ts`
patterns (KEY=`"regulations-tracker"`). i18n: page-level strings de/fr/es (including the new Settings
labels and the impact-panel title/stale banner); inline `Label: {value}` JSX is English-only, consistent
with the rest of the module.

---

## 9. Known V1 limitations (explicit)

- **Country → region is lossy.** Two countries in the same region share Stage-A candidates; Stage B
  disambiguates by reading the country name. Acceptable because the LLM refines.
- **Standalone policies are unmatched.** Only policies linked to an affected control are caught. V2:
  add a `framework_id`/jurisdiction column to `policy_manager` or richer policy linking.
- **No task creation / completion tracking / audit evidence** — these are the "Act" and "Prove" phases,
  deliberately out of V1.
- **Soft-deleted (removed) countries keep their impact rows.** When a country is soft-deleted
  (`is_active=false`), we do NOT delete its `regulation_impact_analysis` rows — they're harmless tenant
  data and the country is already hidden from list/detail queries. The `org→organizations` FK
  `ON DELETE CASCADE` still cleans up when an org is deleted.
- **Per-run cap.** `IMPACT_MAX_ANALYSES_PER_RUN` bounds LLM fan-out in a single sync; over-cap analyses
  are skipped and logged (no row written), and will be picked up on the next change or via admin refresh.

---

## 10. Future work (V2+)

- "Act": one-click remediation task creation into the Tasks module from affected entities.
- "Prove": exportable audit-evidence record tying a regulation change to its remediation.
- Policy precision (schema change above).
- LLM-written rationale could be cached/surfaced in the changelog (Horizon) feed.
- Optional on-demand re-analysis when an org adds a new AI system/vendor (not just on regulation change).
