# Regulations Tracker — technical reference

> **Status:** Built on branch `feat/regulations-tracker` (not yet merged to `develop`). Last updated 2026-06-27. Impact analysis section added 2026-06-27.
> Mirrors the AI Trust Index module pattern. Two `/code-review` passes completed; PR pending.

The Regulations Tracker is a standalone sidebar module that gives every organisation a window into
the public **Global AI Regulations** feed published by the marketing site (`verifywise.ai`). VerifyWise
pulls the feed on a weekly schedule, detects when a country's regulations change (by content hash),
and notifies the organisations tracking that country — in-app and by email. It also surfaces three
global reference feeds (changelog, deadlines, international frameworks). No scraping, no LLM, no new
external service; VerifyWise never writes back to the website.

---

## 1. Data source — the feed contract

Base: `https://verifywise.ai/api/regulations`. Public, CORS-open, CDN-cached, `feedVersion: 1`.
Read-only.

| Endpoint | Used for |
|---|---|
| `GET /api/regulations` | **Manifest** — per-country `{slug, name, region, regulationCount, hash, history, url}`. The weekly diff trigger. |
| `GET /api/regulations/country/<slug>` | **Detail** — `{ feedVersion, meta, country }` where `country` nests `{regulations[], timeline[], oneLiner, executiveSummary, practicalTakeaway, flag, hash, history}`. **Detail is nested under `country`, NOT flat** (a recurring review trip-hazard). |
| `GET /api/regulations/horizon` | Curated dated changelog: `{ changes: [{date, countrySlug, countryName, countryFlag, type, description, detail}] }`. |
| `GET /api/regulations/deadlines` | `{ deadlines: [...], unscheduled: [...] }` — effective-date milestones. |
| `GET /api/regulations/snapshot` | Everything; we read `.frameworks` (11 international frameworks). |

**Change detection** relies on the per-country `hash` (a key-sorted SHA-256 of the full country
record — changes iff content changes). Structured diff detail lives ONLY in
`history.lastChange.changes[]`; `history.hashHistory[]` entries carry `{date, hash, regulationCount}`
only (no per-step diff). So intermediate changes between our runs can be **counted** (and dated) but
their specifics aren't available — only the latest change's detail is.

`regulation` field set: `name, type, status, effectiveDate, effectiveDateISO, dateConfidence, scope,
obligations[], maxPenalty, industryTags[], sourceUrl, lastVerified`.

---

## 2. Data model (4 tables, mirrors AI Trust Index)

Global reference data → global tables; tracking + settings → tenant tables.

| Table | Scope | Purpose |
|---|---|---|
| `regulation_countries` | **global** | Catalog. `slug` PK, `data` JSONB (full detail `{...country, meta}`), `hash`, `region`, `name`, `regulation_count`, `is_active`, `removed_at`, `last_changed_at`, `last_fetched_at`. The `data->>'flag'` is surfaced in list queries. |
| `regulation_tracked_countries` | **tenant** (`organization_id`) | What each org tracks. `UNIQUE(organization_id, country_slug)`, **no FK** to the catalog (so feed re-imports can't cascade-delete tracking). |
| `regulation_tracker_settings` | **tenant** (`organization_id` PK) | `recipient_user_ids` JSONB, `recipient_emails` JSONB. |
| `regulation_tracker_meta` | **singleton** (`id=1 CHECK`) | `seeded_at`, `last_good_count`, `last_run_week`, `last_run_at`, `last_run_status`, and the three cached global-feed blobs `horizon`/`deadlines`/`frameworks` (JSONB). |

Migrations (all on the branch):
`*-create-regulations-tracker-tables.js`, `*-seed-regulations-tracker-snapshot.js`,
`*-add-regulations-tracker-notification-enum-values.js` (adds `regulations_tracker` to
`enum_notification_type` and `regulation_country` to `enum_notification_entity_type`),
`*-add-regulations-tracker-global-feeds.js`, `*-add-regulations-tracker-run-status.js`.

**Seed:** `database/seeds/regulations-tracker-snapshot.json` holds the **full** per-country detail
(60 countries) so a fresh install renders complete content day-one with no external call. The seed
migration is idempotent (skips if the catalog is non-empty) and baselines `meta` so the first weekly
run notifies nobody.

---

## 3. Backend layers

```
routes/regulationsTracker.route.ts        9 endpoints, all authenticateJWT
controllers/regulationsTracker.ctrl.ts    thin controllers; isAdmin = inline arrow (role==="Admin"||"SuperAdmin")
utils/regulationsTracker.utils.ts         CRUD, upsertFeedTx, recipient resolution, global-feed get/set, run-status, countChangesSince
utils/regulationsTrackerFeed.ts           fetchManifest/validateManifest/fetchCountryDetail/fetchHorizon/fetchDeadlines/fetchSnapshot
services/automations/actions/syncRegulationsTracker.ts   the weekly job
templates/regulations-tracker-digest.mjml email digest
middleware/rateLimit.middleware.ts        regulationsTrackerSyncLimiter (5 req / 5 min)
```

### Endpoints (`/api/regulations-tracker`)
| Method/path | Auth | |
|---|---|---|
| `GET /countries` | any | catalog list (incl. `flag`, `is_tracked` via org-scoped LEFT JOIN) |
| `GET /countries/:slug` | any | detail proxy: live feed → flatten `country`+`meta` to root; fall back to stored `data` with `stale:true` on fetch failure **or empty 200** |
| `GET /tracked` | any | org's tracked countries (`country_slug AS slug`, `flag`) |
| `POST /tracked` | Admin | track (`ON CONFLICT DO NOTHING`) |
| `POST /tracked/bulk` | Admin | track many (400 on empty array / >200 slugs) |
| `DELETE /tracked/:slug` | Admin | untrack (idempotent) |
| `GET /settings` | Admin | recipients + merged global `last_run_at`/`last_run_status` |
| `PUT /settings` | Admin | update recipients |
| `GET /horizon` `GET /deadlines` `GET /frameworks` | any | live-or-stored global feeds |
| `POST /sync` | Admin | rate-limited on-demand "check for updates now" |

---

## 4. The update workflow (end to end)

```
WEBSITE: researcher edits a regulation → site recomputes the country hash + appends
         history.lastChange.changes[]. The feed now serves the new hash + structured diff.

WEEKLY JOB  (BullMQ "regulations_tracker_sync", Mondays 06:00 UTC; or admin POST /sync)
 1. In-process syncInProgress guard (no concurrent runs). Then week-idempotency guard
    (last_run_week === currentIsoWeek, OUR clock) — admin /sync clears last_run_week first.
 2. Fetch manifest. Validate: feedVersion===1, counts match, ≥20 VALID countries, ≥50% of
    last_good_count (gated on VALID count). Any failure → recordRunStatus + return, no writes.
 3. For new/hash-changed countries, fetch full detail (normalized slug) and store {...country, meta}.
 4. upsertFeedTx (one txn, meta row FOR UPDATE): insert new / update changed (bump last_changed_at) /
    soft-delete (is_active=false) any active slug not in upserted∪presentSlugs. Returns
    {changed (with changeCount+changeDates from countChangesSince), newlyAdded, newlyRemoved, wasFirstSeed}.
    Stores last_good_count = VALID count.
 5. Refresh horizon/deadlines/frameworks blobs (best-effort).
 6. wasFirstSeed → suppress ALL notifications, return.
 7. Notification phase (wrapped in try/catch → on failure recordRunStatus "error" + rethrow):
    - changed/removed → only orgs TRACKING those slugs. Per affected country, ONE deep-linked in-app
      notification per recipient (admins ∪ configured recipient_user_ids), message = change lines
      (+ "changed N times since last check: dates" when changeCount>1; cosmetic hash move → "Updated").
      Email digest (MJML, escapeHtml on all feed strings) to configured recipients only — NO admin fallback.
    - newlyAdded → notify EVERY org's admins (getAllOrgAdmins), deep-linked, since nobody tracks them yet.
 8. recordRunStatus("ok: N changed, M removed"); update last_run_week.
```

Notifications use the `notifications` table's `action_url` (deep link `/regulations-tracker/<slug>`)
and `entity_name`. `entity_id` is omitted (it's numeric; our key is a slug).

---

## 5. Frontend

`pages/RegulationsTracker/` — Browse, Tracked, Settings, CountryDetail, Horizon, Deadlines,
Frameworks + sidebar/context. Repository `regulationsTracker.repository.ts`, hooks
`useRegulationsTracker.ts` (KEY=`"regulations-tracker"`). Routes + AppSwitcher entry ("Regulations
tracker", Scale icon) + ContextSidebar case wired like AI Trust Index.

- Browse/Tracked rows show the country **flag** emoji (globe fallback); tracked rows show a green
  check; 8px row gap. Browse uses a Box/Stack card layout (same as AI Trust Index Browse — NOT a
  shared table; this is intentional, a review false-positive otherwise).
- CountryDetail: Overview (oneLiner/executiveSummary/practicalTakeaway), full regulation cards
  (type, effective date + confidence, scope, obligations, maxPenalty, industry tags, source via
  `VWLink alwaysShowIcon`), timeline (newest-first), change history, verbatim feed disclaimer,
  stale banner.
- Settings: recipient pickers + "Last checked" status + admin "Check for updates now" button.
- `VWLink` gained an `alwaysShowIcon` prop (persistent external-link arrow; default off).

**i18n note:** inline `Label: {value}` JSX and `text={...}` button labels in this module are
English-only — the i18n extractor doesn't flag them, consistent with AI Trust Index. Page
titles/descriptions/empty-states ARE translated (de/fr/es).

---

## 6. Key decisions & gotchas

- **Feed detail is nested under `country`** — flatten to root in both the controller live path and
  the sync's detail store. The controller test mock must use the nested shape.
- **Notification enum values require a migration** — `as unknown as` casts compile but the DB rejects
  unknown enum values at runtime; the enum-values migration is mandatory.
- **last_good_count = valid count, not raw** — else a malformed-but-large feed inflates the watermark
  and later rejects a valid smaller feed.
- **BullMQ:** `scheduleRegulationsTrackerSync` does NOT call `obliterate` and is registered AFTER the
  obliterating schedulers in `addAllJobs` (next to `scheduleAiTrustIndexSync`).
- **Detail-page blank bug (fixed):** the catalog must store FULL detail, not the manifest summary,
  or the page is blank when the live feed is slow/down.

---

## 7. Impact analysis

The module includes an optional **Regulation Impact Analysis** layer that, when enabled, automatically
detects which of an organization's AI systems, controls, policies, vendors, and assessments are
affected by a regulation change — and provides concise "why" reasoning for each.

### Data model

New table `regulation_impact_analysis`:
- `id` SERIAL PK
- `organization_id` FK (CASCADE)
- `country_slug` VARCHAR(120)
- `regulation_hash` VARCHAR(120) — the source regulation's hash; used to detect stale results
- `result` JSONB (nullable) — structured verdict: `{ systems: [{id, name, why}], controls: [...], policies: [...], vendors: [...], assessments: [...], generatedAt }`
- `status` VARCHAR(120) — `"ok"`, `"no_key"`, `"skipped_no_candidates"`, `"error"`
- `model` VARCHAR(255) — which LLM model executed the analysis (null if skipped/error)
- `created_at`, `refreshed_at` TIMESTAMPTZ
- **UNIQUE** on `(organization_id, country_slug)` — one analysis row per org+country pair

New `regulation_tracker_settings` columns:
- `impact_enabled` BOOLEAN (default true) — org can toggle analysis on/off
- `last_impact_run_at` TIMESTAMPTZ (nullable) — when the last analysis ran for this org (populated across all countries)

### Endpoints

| Method/path | Auth | Limiter |
|---|---|---|
| `GET /countries/:slug/impact` | any | — | Returns `{result, status, refreshed_at, stale}` or null if no analysis exists. Computed `stale` flag = true if the cached `regulation_hash` differs from the live feed hash. **Route must be registered BEFORE `/countries/:slug`** to avoid Express greedy-match. Returns 200 with null body if no LLM key is configured for the org. |
| `POST /countries/:slug/impact/refresh` | Admin | `regulationsTrackerImpactLimiter` | Triggers on-demand analysis for a specific country. Returns the same shape. |

### `/settings` additions

`GET /settings` (Admin) returns:
- `impact_enabled` — org's toggle state
- `last_impact_run_at` — when analysis last ran (nullable; across all countries tracked by this org)
- `has_llm_key` (computed, read-only) — boolean; true if the org has at least one configured LLM key

`PUT /settings` (Admin) accepts `impact_enabled` (boolean, optional); other fields (recipient lists) unchanged.

### Analysis funnel (Stage A + Stage B)

**Stage A — Deterministic candidate queries (over-inclusive, no LLM):**
- Region map: country name → numeric region code (Europe=2, North America=3, etc.)
- Framework inference: regulation type → framework (EU AI Act, ISO 42001, NIST AI RMF, etc.); EU-bloc countries imply EU AI Act
- Candidate queries per entity type:
  - **Systems (projects)**: WHERE `geography = :region` OR linked frameworks match
  - **Controls**: WHERE `framework_id` matches inferred frameworks
  - **Policies**: WHERE `framework_id` matches AND linked to an affected control
  - **Vendors**: WHERE linked to an affected system/policy
  - **Assessments**: WHERE linked to an affected system/control

Stage A result = `Candidate[]` per entity type (over-inclusive by design).

**Stage B — LLM filter-and-annotate (specific verdicts only):**
- One call per entity type (5 parallel calls if all candidate lists non-empty)
- LLM receives: regulation identity + change diff, candidate entity list, key obligations + penalties
- **LLM contract:** responds with JSON `{results: [{type, id, affected, why}, ...]}` where:
  - `affected` is boolean (true = impacted by this change)
  - `why` is a concise reason string (1–2 sentences)
  - LLM can ONLY filter candidates and annotate; cannot invent new entities
- `validateVerdicts()` enforces: only returned entities that were in the sent candidate list are accepted; any unknown entities are dropped
- Result `ImpactResult` = filtered + annotated systems/controls/policies/vendors/assessments

### LLM-key gating

- Orgs without a configured LLM key: `runImpactAnalysis()` returns `{status: "no_key", result: null}`. The endpoint returns 200/null; no panel rendered in the UI.
- When a change notification is sent for a keyless org, a one-line nudge is appended: *"Configure an LLM key to see how this regulation affects your organization."*
- Orgs with `impact_enabled = false`: analysis is skipped; no panel, no nudge (Settings shows the toggle state + "not run yet" if never run).

### Sync hook integration

Impact analysis runs **synchronously per-(org, country) during the notification phase** of the weekly sync (or on-demand admin `/sync`). Isolated in a try/catch so a per-country analysis failure never breaks the overall sync.

Result caching: analysis is cached by `(organizationId, country_slug, regulation_hash)`. If the regulation hash has not changed since the last run, the cached result is returned without re-invoking the LLM.

Failure mode: if LLM call fails for a country, the sync continues and records impact status = `"error"`; the notification for that country includes no impact suffix.

### V1 limitations

- **Country→region mapping coarse:** the region lookup table contains ~30 country names. The LLM is expected to refine boundaries (e.g., "EU Digital Services Act" affects Austria, not just Germany). Standalone policies (not linked to a control) are unmatched.
- **Policies unlinked to controls:** Stage A only catches policies that are directly linked via `policy_frameworks` to a framework that matched. Orphaned policies are excluded.
- **Per-run cap deferred:** V1 has no global cap on parallel LLM calls per sync (`IMPACT_MAX_ANALYSES_PER_RUN`). Stage A already bounds cost per-(org,country) and the weekly cadence limits fan-out; the cap will be added in a later iteration if large feeds prove slow.

---

## 8. Not yet done / open

- **PR not opened** (branch `feat/regulations-tracker`, ~33 commits). Awaiting go-ahead.
- Open review items left as acceptable: `getStoredHashes` duplicates upsertFeedTx's internal prefetch
  (minor double query); `countChangesSince` returns count 1 when the new hash isn't yet in
  hashHistory (benign under-count); notification volume is one-per-country-per-user (by design).
- No frontend component tests (module-wide; AI Trust Index has none either).
- Confirm with the web team that the feed `meta.disclaimer`/`scopeStatement` legal text is finalised
  before GA (currently marked DRAFT on the website).
