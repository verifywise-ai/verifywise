# AI Trust Index module — design spec

> **Status:** Approved design, ready for implementation plan
> **Date:** 2026-06-19
> **Author:** brainstormed with stakeholder (Dr. Gorkem Cetin)

---

## 1. Summary

A new (6th) top-level sidebar module, **AI Trust Index**, that consumes the public AI Trust Index JSON feed published at `https://verifywise.ai/ai-trust-index.json`, lets each organization **browse/search** all assessed AI apps and **track** the ones they actually use, and emails configured recipients **weekly** when a tracked app's risk-material profile changes.

**Product rationale:** Companies don't know the risk of the AI apps they use. The AI Trust Index (public, read-only on verifywise.ai) is the research. This module brings the same data into the VerifyWise app, where a company can select the apps it uses specifically and receive alerts when one of them changes — tying an external risk feed to their own tooling.

**Lean by design:** This is "a simple fetcher." No new dependencies, no new service, no scraping, no LLM. It reuses the existing Node/Express + BullMQ + Sequelize + Postgres + MJML/nodemailer + React/React Query stack already on `develop`.

---

## 2. Scope

### In scope (v1)
- Weekly fetch of the public feed into the app's own Postgres (global mirror).
- Per-org tracking of apps (browse all, track a subset) — per-row toggle **and** bulk multi-select.
- Server-side searchable/filterable/paginated browse (built for up to ~500 apps), default sort **score descending**, 25/page.
- Full-page app detail at `/ai-trust-index/:slug`.
- Per-org configurable email recipients (org users **and** free-text emails), Admin-gated.
- Weekly digest email to recipients when a tracked app's **risk-material** fields change, **or** when a tracked app is **removed from the index** (no longer assessed).
- Documentation: technical reference + end-user guide articles (copied to the website content dir).

### Out of scope (explicit — future extensions, do NOT build now)
- Linking a tracked app to the **AI Apps inventory** module (planned next, separate spec).
- **Auto-creating risks** in the risk register from changes (planned, separate spec).
- **Diff / redline viewer** of what changed.
- **Change-history UI** (week-over-week timeline).
- Self-hosting/proxying app favicons (noted for airgapped deployments; v1 derives icons from `domain` with a graceful fallback).

---

## 3. The data source (feed contract)

**Endpoint:** `GET https://verifywise.ai/ai-trust-index.json` — CORS-enabled, served by the verifywise.ai Next.js site, hourly revalidate. **Read-only; we never write back to the website.**

**Top-level shape:**
```json
{ "feedVersion": 1, "generatedFrom": "...", "meta": {...}, "design": {...}, "count": 37, "apps": [ ... ] }
```

**Per-app shape (verified against live payload, all fields present on all rows today):**
```ts
{
  slug: string;               // "claude" — stable identity / join key
  name: string;               // "Claude"
  vendor: string;             // "Anthropic"
  domain: string;             // "claude.ai" (favicon derives from this)
  category: string;           // "Assistant" | "Image & video" | "Audio" | "Companion" | "Productivity"
  scoreOutOf100: number;      // 0–100
  letterGrade: string;        // A|B|C|D|F
  displayedGrade: string;     // letterGrade, capped at B if dealbreaker flags active (UI renders THIS)
  confidence: string;         // High|Medium|Low
  dealbreakerFlags: string[]; // human-readable violations (often [])
  summary: string;            // free-text headline (editorial; prone to rewording)
  highlights: { label: string; text: string }[]; // ~4 findings
  policyUrl: string;          // link to the actual privacy policy
  policyLastUpdated: string | null; // "YYYY-MM-DD" or null
  modalities: string[];       // ["text"], ["text","image"], ...
  processesBiometrics: boolean;
  iconUrl: string;            // derived: https://icons.duckduckgo.com/ip3/{domain}.ico (cosmetic)
}
```

**Notes from live-payload inspection:**
- `count === apps.length` today → use as an integrity check.
- Arrays (`modalities`, `dealbreakerFlags`, `highlights`) are **not sorted** → must canonicalize before hashing.
- `iconUrl` is 100% a template of `domain` → cosmetic/derived, excluded from hashing.
- `displayedGrade === letterGrade` for all rows today, but the B-cap exists → **UI must render `displayedGrade`**.
- `policyLastUpdated` is nullable (1 null today).
- Per-app payload ≈ 1 KB; ~37 apps now, ≈ 500 KB JSONB total at 500 apps (trivial).

---

## 4. Architecture

```
  verifywise.ai (Next.js, public)
    GET /ai-trust-index.json  ──────────────┐  weekly fetch (BullMQ cron, UTC)
                                            ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ VerifyWise Servers (Express + BullMQ + Sequelize)             │
  │                                                              │
  │ Weekly job "ai_trust_index_sync":                            │
  │   sanity-gate feed → upsert apps (canonical hashing) →       │
  │   soft-delete missing → (first run = silent seed) →          │
  │   email orgs tracking a risk-material change                 │
  │                                                              │
  │ REST API /api/ai-trust-index/*  (server-paginated)           │
  └───────────┬──────────────────────────────────────────────────┘
              │
   ┌──────────┼───────────────┬─────────────────────────┐
   ▼          ▼               ▼                         ▼
 ai_trust_index_apps   ai_trust_index_tracked_apps   ai_trust_index_settings
 (GLOBAL, no org_id)   (per-org, slug link, no FK)   (per-org recipients)
              │
              ▼
  ┌──────────────────────────────────────────┐
  │ React: pages/AITrustIndex/               │
  │  Browse · Tracked · Settings · AppDetail │
  └──────────────────────────────────────────┘
```

**Two deliberate convention exceptions, both justified:**
1. `ai_trust_index_apps` has **no `organization_id`** — the feed is identical for every org (public research). Storing per-org would duplicate identical bytes N times. Tenancy is enforced only on the tracked/settings tables. (Documented in the migration.)
2. The tracking table links to apps by **`app_slug` string with no FK** — the feed is an external, churning source; the slug is its stable identity, while our local `id` is vulnerable to re-imports/soft-deletes. Decoupling means a feed re-import can never cascade-delete durable user tracking.

---

## 5. Data model (3 tables, `verifywise` schema)

Migration: raw SQL via `queryInterface.sequelize.query` with explicit `verifywise.` prefix, 14-digit timestamp filename (e.g. `20260619HHMMSS-create-ai-trust-index-tables.js`). Models: decorator-based `@Table` classes under `Servers/domain.layer/models/aiTrustIndex/`.

### 5.1 `ai_trust_index_apps` — global feed mirror (no `organization_id`)
| column | type | notes |
|---|---|---|
| `id` | SERIAL PK | local id (not used as a cross-table link) |
| `slug` | VARCHAR(120) UNIQUE NOT NULL | normalized lowercase/trim; the join key |
| `name` | VARCHAR(255) NOT NULL | **promoted** for search |
| `vendor` | VARCHAR(255) | **promoted** for search |
| `category` | VARCHAR(100) | **promoted** for filter |
| `letter_grade` | VARCHAR(2) | **promoted** for filter |
| `score_out_of_100` | SMALLINT | **promoted** for sort |
| `data` | JSONB NOT NULL | the full feed app object; UI renders everything else from here |
| `material_hash` | CHAR(64) NOT NULL | SHA-256 over canonicalized **risk-material** fields → **drives emails** |
| `full_hash` | CHAR(64) NOT NULL | SHA-256 over canonicalized full object (minus `iconUrl`) → drives `data` refresh / `last_changed_at` |
| `is_active` | BOOLEAN DEFAULT true | false = no longer present in the feed (soft delete) |
| `removed_at` | TIMESTAMPTZ | set on active→inactive transition; cleared on reappearance; one-shot guard for the "removed" email |
| `last_changed_at` | TIMESTAMPTZ | when `full_hash` last changed |
| `last_fetched_at` | TIMESTAMPTZ | last weekly run that saw this app |

Indexes: `UNIQUE(slug)`, `(is_active, category)`, `(is_active, letter_grade)`, `(name)`, `(vendor)`.

### 5.2 `ai_trust_index_tracked_apps` — per-org tracking
| column | type | notes |
|---|---|---|
| `id` | SERIAL PK | |
| `organization_id` | INT NOT NULL | REFERENCES `verifywise.organizations(id)` ON DELETE CASCADE |
| `app_slug` | VARCHAR(120) NOT NULL | normalized; joins `ai_trust_index_apps.slug` (no FK) |
| `tracked_by` | INT | REFERENCES `verifywise.users(id)` — who tracked it |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

Constraints/indexes: `UNIQUE(organization_id, app_slug)`, `(organization_id)`, `(app_slug)`.

### 5.3 `ai_trust_index_settings` — per-org recipients
| column | type | notes |
|---|---|---|
| `organization_id` | INT PK | REFERENCES `verifywise.organizations(id)` ON DELETE CASCADE |
| `recipient_user_ids` | JSONB DEFAULT '[]' | array of user ids; emails resolved at send time (validated as current org members) |
| `recipient_emails` | JSONB DEFAULT '[]' | free-text emails (format-validated only) |
| `updated_by` | INT | REFERENCES `verifywise.users(id)` |
| `updated_at` | TIMESTAMPTZ DEFAULT now() | |

### 5.4 Seed marker
A single persisted marker, `seeded_at TIMESTAMPTZ`, recording that the first full feed seed completed successfully. Stored as a one-row meta table `ai_trust_index_meta (seeded_at, last_good_count, last_run_week)` (single global row). Set **inside** the first successful upsert transaction. Emails are gated on `seeded_at IS NOT NULL`.

---

## 6. Change detection (the core correctness logic)

> This section encodes the blockers found in adversarial review. Get this right or week-2 produces mass false-positive emails.

### 6.1 Canonical hashing — REQUIRED
- Compute hashes over the **incoming parsed feed object** for each app. **Never** re-derive a hash from the stored `data` JSONB column — Postgres normalizes/reorders JSONB keys, so a re-derived hash would differ and flip 100% of apps as "changed."
- Before hashing, **deep-canonicalize**: recursively sort object keys, and sort semantically-unordered arrays:
  - `modalities` → sort ascending.
  - `dealbreakerFlags` → sort ascending.
  - `highlights` (array of objects) → sort by `label`, then `text`.
- Use a stable stringify (sorted keys) for the hash input.

### 6.2 Two hashes — REQUIRED (alert-fatigue control)
- **`material_hash`** = SHA-256 over the canonicalized subset:
  `{ scoreOutOf100, letterGrade, displayedGrade, dealbreakerFlags, policyLastUpdated, processesBiometrics }`.
  A change here is what **triggers a digest email**.
- **`full_hash`** = SHA-256 over the canonicalized full app object **minus `iconUrl`** (derived/cosmetic). A change here refreshes the stored `data` and bumps `last_changed_at`, but does **not** by itself email.
- Effect: a reworded `summary`, a `confidence` flip, or a `modalities` reorder updates the UI copy without spamming. Only governance-material change emails.
- `policyUrl` is **normalized** (strip query string + fragment) before inclusion in `full_hash`, so a vendor's `?v=2` cache-buster doesn't churn it. (`policyLastUpdated` is the real freshness signal and is in the material set.)

### 6.3 Per-app upsert (inside one transaction)
For each app in the (sanity-gated) feed:
1. normalize `slug` (lowercase/trim).
2. compute `material_hash`, `full_hash` from the incoming object.
3. `UPSERT ... ON CONFLICT (slug)`:
   - if existing `material_hash` differs → collect `slug` into `materialChanged[]`.
   - if existing `full_hash` differs → set `last_changed_at = now()`, refresh promoted columns + `data`.
   - always: `is_active = true`, `last_fetched_at = now()`, **`removed_at = NULL`** (re-appearance clears the removed marker).
4. After the loop: any currently-active app **not** seen in this feed → set `is_active = false`, `removed_at = now()`, and collect its `slug` into `newlyRemoved[]` (only apps that were active *before* this run — an app already removed in a prior run is not re-collected). Soft delete only ever happens within a sane feed (see §7).

**`removed_at` column** is added to `ai_trust_index_apps` (TIMESTAMPTZ, nullable) — set when an app transitions active→inactive, cleared on reappearance. It is the one-shot guard so a removed-app email fires **once**, not every week the app stays gone.

---

## 7. Feed sanity gates (abort-write-nothing) — REQUIRED

Before **any** write to the apps table, validate the fetched feed. On **any** failure: abort the entire run, write nothing, send no email, log an ops-visible error, and keep last-known-good state.

Gates:
1. HTTP 200 and body parses as valid JSON.
2. `feedVersion === 1`. An unknown/newer version → **abort + ops alert** ("feed schema bumped, job paused pending code update"). Never best-effort-parse an unknown schema.
3. `Array.isArray(apps)` and `apps.length === count`.
4. **Floor:** abort if `apps.length < 10`, **or** if `apps.length < 50%` of `ai_trust_index_meta.last_good_count` (when a prior good count exists). Prevents a transient short/empty feed from flapping every app `is_active=false`.
5. Per-app required-field validation: if an individual app is missing a required field, **skip that app + warn** (don't crash the whole run). Required fields = the promoted columns + the material-hash inputs.

On a fully successful run, update `last_good_count = apps.length` and `last_run_week`.

---

## 8. The weekly job

Registered as **one** BullMQ repeatable job in the existing automation registry.

### 8.1 Scheduling
- Producer: add `scheduleAiTrustIndexSync()` in `Servers/services/automations/automationProducer.ts`.
  - **MUST NOT** call `automationQueue.obliterate()` (existing schedulers do; ordering is load-bearing). Use only `automationQueue.add(...)` with `{ removeOnComplete: true, removeOnFail: false }`.
  - Append the call **last** in `Servers/jobs/producer.ts` so its repeat job isn't wiped by a later obliterate.
  - Cron: `"0 6 * * 1"` — **Monday 06:00 UTC** (pin TZ explicitly).
- **Idempotent singleton:** set BullMQ `jobId` keyed to the ISO week (e.g. `trust-index-2026-W25`) so a duplicate enqueue (redeploy/restart) is deduped. Wrap the run body in `pg_advisory_xact_lock` so two workers can't run concurrently. If `ai_trust_index_meta.last_run_week` already equals this ISO week, no-op.

### 8.2 Worker handler
- Add one branch `else if (name === "ai_trust_index_sync") { await syncAiTrustIndex(); }` in `Servers/services/automations/automationWorker.ts`.
- Handler is a **single global invocation** that iterates orgs internally (matching how existing automation handlers work — they take no org argument). New file `Servers/services/automations/actions/syncAiTrustIndex.ts`.

### 8.3 Handler flow
```
1. acquire advisory lock; if last_run_week == thisWeek → no-op + release.
2. fetch feed (axios, timeout + small retry).
3. sanity-gate (§7). Fail → abort, write nothing, no email, ops log.
4. BEGIN TRANSACTION
     upsert all apps (§6.3); collect materialChanged[] and newlyRemoved[]; soft-delete missing.
     if seeded_at IS NULL → set seeded_at = now()  (first seed)
     update last_good_count, last_run_week
   COMMIT
5. EMAIL PHASE (skipped entirely if this run set seeded_at — first seed is silent):
     changedSlugs = materialChanged ∪ newlyRemoved      // both drive a digest
     snapshot tracked-apps + settings at phase start (consistent read).
     affected = SELECT DISTINCT organization_id, app_slug
                FROM ai_trust_index_tracked_apps
                WHERE app_slug = ANY(changedSlugs);
     group by organization_id.
     for each org:
        recipients = resolveRecipients(org)   // §9
        if recipients empty → skip (fallback handled in resolveRecipients)
        build digest with two sections for that org's tracked apps:
           - "Changed": apps in materialChanged → old→new grade/score
           - "No longer assessed": apps in newlyRemoved → left the index
        render MJML, send via existing send_email action (sendAutomationEmail)
6. log summary { fetched, materialChanged, newlyRemoved, orgsEmailed }; release lock.
```

The `newlyRemoved[]` one-shot guard (`removed_at`, §6.3) ensures a removed tracked app emails **once**, not every subsequent week.

**Crash-safety:** the upsert + seed-marker + meta update are one atomic transaction; a crash rolls back to last-known-good. The email phase is after commit (an email failure never corrupts data; re-send risk is bounded by the weekly singleton).

---

## 9. Email recipients

`resolveRecipients(organizationId)`:
1. `settings = SELECT * FROM ai_trust_index_settings WHERE organization_id = :org`.
2. `userEmails = ` emails of `settings.recipient_user_ids` that are **current members of this org** (JOIN `users` filtered by `organization_id`; drop ids that no longer belong).
3. `freeText = settings.recipient_emails` (already format-validated on write).
4. `recipients = unique(lowercase(userEmails ∪ freeText))`.
5. **Fallback:** if `recipients` is empty (no settings row, or cleared) → resolve **Admins + SuperAdmins of this org** via the role-name JOIN:
   ```sql
   SELECT u.email FROM users u JOIN roles r ON u.role_id = r.id
   WHERE u.organization_id = :org AND r.name IN ('Admin','SuperAdmin')
   ```
   A tracked app's risk changing must never silently reach no one.

**Tenancy guarantee:** every recipient query is filtered by `organization_id`; the changed-slug fan-out is grouped per org and never crosses orgs. The Admin fallback resolves admins of that org only.

**Email shape:** one digest per org per run, only if that org tracks ≥1 app that materially changed **or was newly removed** from the index. Template `Servers/templates/ai-trust-index-digest.mjml`, rendered following the existing PMM templated-email pattern, sent through `sendAutomationEmail`. Two sections: **Changed** (each app with old→new grade/score + link into the module) and **No longer assessed** (apps that left the index). Recipients = Admin **selection** (users + free-text), fallback to org Admins.

---

## 10. REST API

Base `/api/ai-trust-index`, mounted in `Servers/app.ts`, every route behind `authenticateJWT`. Thin controller (`Servers/controllers/aiTrustIndex.ctrl.ts`) → utils (`Servers/utils/aiTrustIndex.utils.ts`). Responses via `STATUS_CODE[200](data)`. Logging via `logProcessing/logSuccess/logFailure`. `organizationId/userId/role` read from `req`.

| method + path | purpose | notes |
|---|---|---|
| `GET /apps` | paginated browse | query: `search, category, grade, page, pageSize, sort(score\|name)`. Server-side LIMIT/OFFSET + parallel COUNT (mirror `getScansListQuery`). Each row includes `isTracked` for the caller's org via **LEFT JOIN** tracked. Returns `{ apps, total, page, pageSize, categories }`. Only `is_active = true`. |
| `GET /apps/:slug` | one app detail | full `data` JSONB + `isTracked`. If slug not active but the org tracks it → return with a `noLongerInIndex` flag (don't 404 a tracked-but-removed app). |
| `GET /tracked` | this org's tracked apps | **LEFT JOIN** tracked→apps so removed-but-tracked rows still appear with a `noLongerInIndex` flag (never INNER-JOIN them away). |
| `POST /tracked` | track an app | body `{ slug }`. Normalize slug; validate it exists and `is_active`; insert `(org, slug, tracked_by=userId)`. Idempotent via `UNIQUE(org, slug)`. |
| `POST /tracked/bulk` | track many at once | body `{ slugs: string[] }` (bulk select). Normalize + validate each; insert all in one transaction; skip slugs already tracked or not active. Returns `{ tracked: string[], skipped: string[] }`. Cap list length (e.g. ≤200) to bound the request. |
| `DELETE /tracked/:slug` | untrack | scoped to caller's org. |
| `GET /settings` | recipients for the org | returns `{ recipientUserIds, recipientEmails }`. |
| `PUT /settings` | update recipients | **Admin/SuperAdmin only** (role guard). Validate emails (format) + that `recipientUserIds` belong to the org. Upsert the settings row. |

---

## 11. Frontend

Clean-architecture layers (Page → Hook → Repository → Axios). No new UI tech.

### 11.1 Module registration
- Add an entry to the module rail array in `Clients/src/presentation/components/AppSwitcher/index.tsx`:
  `{ id: "ai-trust-index", icon: <Gauge size={16} strokeWidth={1.5} />, label: "AI Trust Index", description: "Browse AI app risk scores and track the apps you use" }`.
  (`Gauge` — no collision with Shield/FlaskConical/ScanSearch/Eye/Router/Crown.)

### 11.2 Sidebar
- New `Clients/src/application/contexts/AITrustIndexSidebar.context.tsx` (active tab + tracked count), mirroring `AIDetectionSidebar.context.tsx`.
- New sidebar component rendering `SidebarShell` with `flatItems`: **Browse**, **Tracked** (with count), **Settings** (Settings disabled/hidden for non-Admin). `isItemActive`/`onItemClick` per the AIDetection pattern.

### 11.3 Routes (`Clients/src/application/config/routes.tsx`)
```
/ai-trust-index            → <Navigate to="/ai-trust-index/browse" replace />
/ai-trust-index/browse     → AITrustIndexBrowse   (Suspense + lazy)
/ai-trust-index/tracked    → AITrustIndexTracked
/ai-trust-index/settings   → AITrustIndexSettings
/ai-trust-index/:slug      → AITrustIndexDetail
```
All inside the dashboard shell so the sidebar persists.

### 11.4 Pages (`Clients/src/presentation/pages/AITrustIndex/`)
- `index.tsx` — shell + tab routing.
- `Browse/index.tsx` — `SearchBox` (debounced) + category/grade filters (`CustomSelect`) + sort (default **score descending**, 25/page); **server-paginated** `CustomizableBasicTable`; columns: **row checkbox (bulk select)**, favicon+name, vendor, category, **grade chip (renders `displayedGrade`)**, score, Track toggle. Bulk-select state + a **"Track selected (N)"** action bar that calls `POST /tracked/bulk`; clears selection + invalidates queries on success. Row click (outside checkbox/toggle) → `navigate('/ai-trust-index/:slug')`. `EmptyState` for empty/error.
- `Tracked/index.tsx` — same table filtered to tracked; inline untrack; **"No longer in index"** badge for `noLongerInIndex` rows.
- `Settings/index.tsx` — Admin-only; user multi-select + free-text email `ChipInput`; auto-save on change (Policy Radar pattern); read-only/hidden for non-admins.
- `AppDetail/index.tsx` — full page: `PageBreadcrumbs` (AI Trust Index → app name), header (favicon + name + vendor + **displayedGrade** chip + score + Track/Untrack), sections: Summary, Highlights (`{label,text}` cards), Dealbreaker flags (if any), Policy details (policy URL link, `policyLastUpdated`, modalities, biometrics). Handles `noLongerInIndex` and not-found.
- `shared.ts` — TS types mirroring feed shape, grade→theme-color map (our theme, **not** the feed's `design` block), constants.

### 11.5 Favicon
- Derive from `domain` (`https://icons.duckduckgo.com/ip3/{domain}.ico`) rather than depending on the feed's `iconUrl`; render a letter-grade/initial fallback on image load error. (Self-hosting/proxy is a future item for airgapped deployments.)

### 11.6 Repository + hooks
- `Clients/src/application/repository/aiTrustIndex.repository.ts` — CustomAxios wrappers: `getApps(filters)`, `getApp(slug)`, `getTracked()`, `trackApp(slug)`, `trackAppsBulk(slugs)`, `untrackApp(slug)`, `getSettings()`, `updateSettings(body)`.
- `Clients/src/application/hooks/useAiTrustIndex.ts` — React Query: `useApps(filters)`, `useApp(slug)`, `useTracked()`, `useTrackApp()`/`useTrackAppsBulk()`/`useUntrackApp()` (optimistic; invalidate `apps` + `tracked` so sidebar count refreshes), `useSettings()`/`useUpdateSettings()`.

### 11.7 i18n
- Every new user-facing string (tab labels, table headers, buttons, aria-labels, "No longer in index", settings copy, empty states) gets **de/fr/es** entries in `Clients/src/i18n/translations.ts` (English string is the key). Must pass `npm run i18n:audit:strict`.

---

## 12. Testing

- **Backend (Jest):**
  - Canonical hashing: same object with reordered keys/arrays → **same** hash (regression guard for B1/B2).
  - Material vs full hash: reworded `summary` → `full_hash` changes, `material_hash` unchanged → **no** email candidate; grade change → material change → email candidate.
  - Sanity gates: empty feed / `count` mismatch / `feedVersion: 2` / below-floor count → abort, no writes.
  - First-seed: empty meta → seeds + sets `seeded_at`, **no** emails sent.
  - Soft delete: app missing from a sane feed → `is_active=false`, `removed_at` set, `newlyRemoved` collected; reappears → `is_active=true`, `removed_at` cleared.
  - Removed-app email once-only: app removed → in `newlyRemoved` this run; next run while still gone → **not** re-collected (no repeat email).
  - Bulk track: `POST /tracked/bulk` inserts new slugs, skips already-tracked + inactive, returns `{tracked, skipped}`; over-cap list rejected.
  - Recipient resolution: users ∪ free-text; empty → Admin fallback; cross-org isolation (org B's change never emails org A).
  - Pagination/search util: filter + LIMIT/OFFSET + total count.
- **Frontend (Vitest):** Browse renders + filters call the API with params; Track toggle optimistic + invalidation; Settings Admin-gating; AppDetail renders `displayedGrade` and `noLongerInIndex` state.

---

## 13. Risks & mitigations (from adversarial review)

| # | Risk | Mitigation (in spec) |
|---|---|---|
| B1/B2 | Hash over raw/stored JSONB or unsorted arrays → mass false-positive emails week 2 | §6.1 canonical hashing; hash the **incoming** object, deep-sort keys+arrays; never re-hash stored JSONB |
| B3/S4 | Transient empty / `feedVersion` bump corrupts state, flaps `is_active` | §7 sanity gates: version + count + floor → abort-write-nothing |
| S1/S2 | Non-crash-safe first seed; tracking before seed → spurious first-delta email | §5.4/§8.3 transactional `seeded_at`; first seed always email-silent; whole upsert atomic |
| S3 | Editorial churn (`summary`) → alert fatigue | §6.2 two hashes; only material change emails |
| S5 | Cron double-run on redeploy → double-send | §8.1 UTC, weekly `jobId`, advisory lock, `last_run_week` no-op |
| S6 | Tracking/recipient edit mid-run | §8.3 snapshot at email-phase start; changes apply next run |
| N6 | Favicon hotlink / airgap leak | §11.5 derive from domain + fallback; self-host = future |
| N7/N8 | Orphan slug; cross-org email leak | normalized slug; LEFT-JOIN read; §9 per-org recipient queries + same-org Admin fallback |
| Removed-app spam | A removed tracked app could email every week it stays gone | §6.3 `removed_at` one-shot guard; `newlyRemoved` only collects active→inactive transitions |

---

## 14. File inventory

**Backend (new unless noted):**
- `Servers/database/migrations/20260619HHMMSS-create-ai-trust-index-tables.js`
- `Servers/domain.layer/models/aiTrustIndex/aiTrustIndexApp.model.ts`, `aiTrustIndexTrackedApp.model.ts`, `aiTrustIndexSettings.model.ts`, `aiTrustIndexMeta.model.ts`
- `Servers/utils/aiTrustIndex.utils.ts` (queries, canonical hashing, sanity gates)
- `Servers/controllers/aiTrustIndex.ctrl.ts`
- `Servers/routes/aiTrustIndex.route.ts`
- `Servers/services/automations/actions/syncAiTrustIndex.ts`
- `Servers/templates/ai-trust-index-digest.mjml`
- *edit* `Servers/services/automations/automationProducer.ts` (add scheduler, no obliterate)
- *edit* `Servers/services/automations/automationWorker.ts` (add dispatch branch)
- *edit* `Servers/jobs/producer.ts` (call scheduler last)
- *edit* `Servers/app.ts` (mount route)

**Frontend (new unless noted):**
- `Clients/src/presentation/pages/AITrustIndex/{index,Browse/index,Tracked/index,Settings/index,AppDetail/index}.tsx`, `shared.ts`
- `Clients/src/presentation/pages/AITrustIndex/AITrustIndexSidebar.tsx`
- `Clients/src/application/contexts/AITrustIndexSidebar.context.tsx`
- `Clients/src/application/repository/aiTrustIndex.repository.ts`
- `Clients/src/application/hooks/useAiTrustIndex.ts`
- *edit* `Clients/src/presentation/components/AppSwitcher/index.tsx` (add module)
- *edit* `Clients/src/application/config/routes.tsx` (add routes)
- *edit* `Clients/src/i18n/translations.ts` (de/fr/es strings)

**Docs (full docs in v1):**
- `docs/technical/domains/ai-trust-index.md` — technical module reference (architecture, schema, change-detection, cron).
- *edit* root `CLAUDE.md` Detailed-References table — add a row pointing to the new domain doc.
- User-guide articles under `shared/user-guide-content/content/ai-trust-index/`: `dashboard.ts` (overview), `browse.ts`, `tracked.ts`, `settings.ts` (TypeScript `ArticleContent` exports).
- *edit* `shared/user-guide-content/content/index.ts` (imports + map) and `shared/user-guide-content/userGuideConfig.ts` (collection + articles + search).
- **Per the documentation workflow:** copy the changed user-guide files to the website dir `/Users/gorkemcetin/website/verifywise/content/user-guide/` too (both config files updated in both locations). Do **not** commit to the website repo — the user handles that.

---

## 15. Pre-PR gates (per repo conventions)
- `cd Servers && npm run build`
- `cd Clients && npm run build`
- `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`
- `cd Servers && npm run format-check` (format if needed)
- Backend Jest + frontend Vitest for the new code.
