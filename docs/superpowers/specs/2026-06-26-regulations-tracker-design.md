# Regulations Tracker — design

> **Date:** 2026-06-26
> **Status:** approved-pending-implementation
> **Mirrors:** the AI Trust Index module (`2026-06-19-ai-trust-index-design.md`)

## 1. Summary

A new VerifyWise app module that watches the public **Global AI Regulations** feed
served by the marketing site (`https://verifywise.ai/api/regulations`), detects when
a country's regulations change (via a per-country content hash), and notifies the
organizations that track that country — in-app and by email. It also ships a frontend
(Browse / Tracked / Settings / Detail) mirroring the AI Trust Index UI.

The marketing site is the **data source**; the app is the **consumer**. Nothing on the
website side changes.

This is built natively in the VerifyWise stack (Express + Sequelize + BullMQ +
React/React-Query). The reference files in
`website/verifywise/docs/regulations-tracker-integration/` (Vercel/Next style) supply
only the algorithm; we re-implement it in our conventions.

## 2. Source feed evaluation (done before design)

The website data model was reviewed against its actual source
(`lib/regulations-feed.ts`, `regulations-pipeline/history-lib.ts`, the API routes). It
is sound to build on:

- **Stable `slug`** join key (pure function, `assertUniqueSlugs` guards collisions).
- **Deterministic content hash** — `hashRecord` sorts object keys recursively before
  SHA-256, so the hash changes iff content changes. Our change detection depends on
  this and it is implemented correctly.
- **Hash covers the full country** (regulations, scope, obligations, penalties,
  timeline) → no meaningful change is missed.
- **Precomputed structured diffs** (`history.lastChange.changes[]`) → no NLP needed.
- **Versioned + additive-safe** (`feedVersion: 1`).

Three caveats baked into this design:

1. **`generatedAt` is build/revalidation time** (routes are `force-static`,
   `revalidate=3600`), not a real-time clock. We use our OWN clock for the
   week-idempotency guard; the feed date is only a coarse fallback for a change date.
2. **Hash is sensitive to cosmetic edits.** A copy-edit moves the country hash but
   yields an empty `changes[]` (`computeChanges` diffs only name/status/effectiveDate).
   This "hash moved, empty diff" case is real and MUST be handled (see §6, the
   `unstructured` path) — notify as "Updated — see source," never drop it.
3. **History is file-based and pipeline-driven.** `lastChange` reflects only the most
   recent pipeline-detected change; `hashHistory[]` has the full trail. Fine at weekly
   cadence.

The feed `disclaimer`/`scopeStatement` are marked "DRAFT pending legal review" on the
website. We display them verbatim; confirm finalization with the web team before GA.

## 3. Feed contract consumed

- `GET /api/regulations` (manifest) — entry point. Per-country `{ slug, name, region,
  regulationCount, hash, history, url }`, plus `feedVersion`, `counts`, `generatedAt`.
  This is the only call the weekly job needs.
- `GET /api/regulations/country/<slug>` (detail) — full regulation list + timeline +
  the same `hash`/`history`. Used by the Detail UI (proxied through our backend).

`history.lastChange.changes[]` variants (rendered with no NLP):

| `field` | extra keys | line rendered |
|---|---|---|
| `regulation.status` | `regulation, from, to` | `{regulation}: status {from} → {to}` |
| `regulation.effectiveDate` | `regulation, from, to` | `{regulation}: effective date {from} → {to}` |
| `regulation` (added) | `change:"added", value` | `Added: {value}` |
| `regulation` (removed) | `change:"removed", value` | `Removed: {value}` |
| `regulationCount` | `from, to` | usually skipped (implied by add/remove) |

## 4. Data model (4 tables, mirrors AI Trust Index)

Global reference data → global tables; tracking + settings → tenant tables.

| Table | Scope | Mirrors | Columns |
|---|---|---|---|
| `regulation_countries` | **global** | `ai_trust_index_apps` | `slug` PK, `data` JSONB (full FeedCountry), `hash` text, `regulation_count` int, `region` text, `name` text, `is_active` bool default true, `removed_at` timestamptz null, `last_changed_at` timestamptz null, `last_fetched_at` timestamptz |
| `regulation_tracked_countries` | **tenant** | `ai_trust_index_tracked_apps` | `organization_id` FK, `country_slug` text, `tracked_by` int, `created_at` timestamptz. `UNIQUE(organization_id, country_slug)`. **No FK** to `regulation_countries.slug` (so feed re-imports can't cascade-delete tracking rows) |
| `regulation_tracker_settings` | **tenant** | `ai_trust_index_settings` | `organization_id` PK FK, `recipient_user_ids` JSONB default `[]`, `recipient_emails` JSONB default `[]`, `updated_by` int, `updated_at` timestamptz |
| `regulation_tracker_meta` | **singleton** | `ai_trust_index_meta` | `id` PK `CHECK (id=1)`, `seeded_at`, `last_good_count` int, `last_run_week` text |

Migration DDL uses `verifywise.` prefix; app code uses unqualified names. `timestamps:
false` on all models (explicit columns), matching AI Trust Index.

### Seed
`database/seeds/regulations-tracker-snapshot.json` — committed snapshot of the manifest
countries, loaded by a seed migration on first install (idempotent: skip if
`regulation_countries` non-empty). Establishes the baseline so the first weekly run
notifies nothing.

## 5. Backend layers (mirror AI Trust Index file-for-file)

```
routes/regulationsTracker.route.ts                 ← aiTrustIndex.route.ts
controllers/regulationsTracker.ctrl.ts             ← aiTrustIndex.ctrl.ts
utils/regulationsTracker.utils.ts                  ← aiTrustIndex.utils.ts (CRUD, upsertFeedTx, resolveRecipients, getAffectedOrgsBySlugs, currentIsoWeek, getMetaQuery)
utils/regulationsTrackerFeed.ts                    ← aiTrustIndexFeed.ts (fetchFeed, validateFeed)
domain.layer/models/regulationsTracker/*.model.ts  ← aiTrustIndex/*.model.ts (4 models)
domain.layer/interfaces/i.regulationsTracker.ts    ← i.aiTrustIndex.ts
services/automations/actions/syncRegulationsTracker.ts ← syncAiTrustIndex.ts
templates/regulations-tracker-digest.mjml          ← ai-trust-index-digest.mjml
database/migrations/<ts>-create-regulations-tracker-tables.js
database/migrations/<ts>-seed-regulations-tracker-snapshot.js
database/seeds/regulations-tracker-snapshot.json
```

### Endpoints (8, all `authenticateJWT`)
| Method/path | Auth | Purpose |
|---|---|---|
| `GET /api/regulations-tracker/countries` | any | Browse catalog (from `regulation_countries`) |
| `GET /api/regulations-tracker/countries/:slug` | any | Detail (proxy live feed, fall back to stored `data`) |
| `GET /api/regulations-tracker/tracked` | any | Org's tracked countries |
| `POST /api/regulations-tracker/tracked` | Admin | Track one (`ON CONFLICT DO NOTHING`) |
| `POST /api/regulations-tracker/tracked/bulk` | Admin | Track many (partial-dup safe) |
| `DELETE /api/regulations-tracker/tracked/:slug` | Admin | Untrack (no-op if absent) |
| `GET /api/regulations-tracker/settings` | Admin | Get recipients |
| `PUT /api/regulations-tracker/settings` | Admin | Update recipients |

Controllers stay thin: `logProcessing`/`logSuccess`/`logFailure`, `STATUS_CODE[xxx](...)`,
`req.organizationId!`/`req.userId!`, admin gate `if (!isAdmin(req.role)) return
res.status(403)...`. Registered in `app.ts`:
`app.use("/api/regulations-tracker", regulationsTrackerRoutes)`.

## 6. Weekly job — `syncRegulationsTracker` (BullMQ)

Job name `regulations_tracker_sync`, schedule `0 6 * * 1` UTC (Mondays 06:00). Mirrors
`syncAiTrustIndex` step-for-step:

```
1. meta = getMetaQuery(); if meta.last_run_week === currentIsoWeek(new Date()) → return {skipped}
   (OUR clock, not the feed's)
2. raw = fetchFeed() with timeout; on throw → log + return {skipped:"fetch failed"} (no writes)
3. validated = validateFeed(raw, meta.last_good_count):
     - feedVersion === 1 (else reject)
     - counts.countries === countries.length (else reject)
     - countries.length >= 20 (absolute floor) (else reject)
     - last_good_count != null && countries.length < last_good_count*0.5 → reject
     - presentSlugs = ALL slugs present in raw (even malformed rows), so a
       present-but-malformed country is NOT treated as removed
     - valid = rows with required keys {slug, name, hash, region}
     on !ok → log + return {skipped:reason} (no writes)
4. {materialChanged, newlyRemoved, wasFirstSeed} = upsertFeedTx(valid, presentSlugs, rawCount):
     - upsert each country (data, hash, region, name, regulation_count, last_fetched_at;
       set last_changed_at when hash moved); compute changes from history.lastChange
     - countries in catalog but NOT in presentSlugs → is_active=false, removed_at=now (soft delete)
     - wasFirstSeed = catalog was empty before this run
     - all in ONE transaction
5. if wasFirstSeed → log, suppress ALL notifications, return
6. changedSlugs = unique(materialChanged.slug ∪ newlyRemoved)
7. affected = getAffectedOrgsBySlugs(changedSlugs)  // only orgs TRACKING those slugs
8. group by org → { changed: DigestItem[], removed: DigestItem[] }
     - DigestItem detail = rendered changes joined; if changes empty (cosmetic hash
       move) → detail = "Updated — see source"  (the `unstructured` path)
9. per org:
     - EMAIL: recipients = resolveRecipients(orgId) (configured recipient_user_ids
       resolved to emails ∪ recipient_emails); NO admin fallback; empty → log + skip email
     - IN-APP: via `notification.utils.ts` (one row per user: organization_id,
       user_id, type, title, message, entity_type="regulation_country",
       entity_id=slug-or-null). Recipients = org Admins ∪ configured
       recipient_user_ids (deduped). Sent always, even if email is skipped.
10. update meta.last_run_week = thisWeek, last_good_count = rawCount
```

### Security
`escapeHtml()` every feed-derived string (country name, slug, change values) before
injecting into the MJML digest. Feed is first-party but this is defense-in-depth,
matching `syncAiTrustIndex`.

### BullMQ registration hazard
Several existing schedulers call `automationQueue.obliterate({ force: true })`, which
wipes ALL repeatable jobs in the shared `automation-actions` queue. `scheduleRegulationsTrackerSync()`
MUST: (a) NOT call obliterate, and (b) be registered in `addAllJobs()` AFTER every
obliterating scheduler (i.e. near the end, alongside `scheduleAiTrustIndexSync`).

## 7. Detail proxy (`GET /countries/:slug`)

1. Fetch `https://verifywise.ai/api/regulations/country/<slug>` with a short timeout.
2. On success → return it.
3. On feed failure/timeout → fall back to the stored `regulation_countries.data` JSONB
   (we always have the last-known snapshot) with a `stale: true` flag.
4. Unknown slug not in our catalog → 404.

Never block the page on a slow external call.

## 8. Frontend (mirror AI Trust Index)

```
application/repository/regulationsTracker.repository.ts
application/hooks/useRegulationsTracker.ts          (React-Query, KEY="regulations-tracker", keepPreviousData)
application/contexts/RegulationsTrackerSidebar.context.tsx
presentation/pages/RegulationsTracker/index.tsx
  ├─ Browse/index.tsx     (all countries + track button; world-region grouping)
  ├─ Tracked/index.tsx    (org's tracked countries)
  ├─ Settings/index.tsx   (recipient_user_ids + recipient_emails)
  └─ CountryDetail/index.tsx (regulations, timeline, change history; via proxy)
presentation/pages/RegulationsTracker/RegulationsTrackerSidebar.tsx
config/routes.tsx         (lazy imports + <Route> registrations; bare path → Browse)
```

Use VerifyWise components (CustomizableButton, CustomizableBasicTable, Chip, SearchBox,
EmptyState, PageHeader, TabBar). Display the feed disclaimer verbatim on Browse/Detail.

## 9. Edge cases (consolidated)

| # | Edge case | Handling |
|---|---|---|
| A | Truncated/partial feed | floor 20 + 50%-of-last-good guard → reject, no writes |
| B | Present-but-malformed country | counted in `presentSlugs`, excluded from valid → NOT marked removed (no false alert) |
| C | First install run | seed migration baselines; `wasFirstSeed` suppresses all notifications |
| D | Hash moved, empty `changes[]` (cosmetic) | `unstructured` → "Updated — see source" |
| E | Digest HTML injection | `escapeHtml` all feed strings |
| F | Org with no configured email recipients | email skipped + logged; in-app still sent to admins |
| G | BullMQ obliterate wipes repeatables | our scheduler never obliterates + registered last |
| H | Live detail feed down | fall back to stored `data` JSONB, `stale:true` |
| I | Re-track / partial bulk dup | `ON CONFLICT (organization_id, country_slug) DO NOTHING` |
| J | Untrack non-tracked | no-op, 200 |
| K | Country removed from feed then returns | `is_active=true`, `removed_at=null` on re-appear |
| L | Two changes between polls | `lastChange` = latest; acceptable at weekly cadence |
| M | feed `generatedAt` is stale build time | week guard uses our clock; feed date only fallback |

## 10. Testing

- **Unit:** `validateFeed` (version/floor/50%/count/presentSlugs), `renderChangeLine`
  (all variants + unstructured), `escapeHtml`, `currentIsoWeek`, recipient resolution
  (no-fallback), `upsertFeedTx` (change detection, soft-delete by presentSlugs,
  wasFirstSeed, re-appear).
- **Integration:** track/untrack/bulk idempotency, settings round-trip, detail proxy
  fallback, admin-gate 403s, tenant isolation (org A cannot see org B tracking).
- Mirror AI Trust Index test files where they exist.

## 11. What is NOT in scope
- Researching/verifying regulation changes (website pipeline does this).
- Computing diffs (feed precomputes `changes[]`).
- Hosting/auth/caching the feed (public, CORS-open, CDN-cached).
- Translations of regulation content (feed serves English; localize UI chrome only).
