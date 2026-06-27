# Regulations Tracker — session handover (2026-06-27)

Quick-start for picking this up after `/clear`. Full technical reference:
`docs/technical/domains/regulations-tracker.md`. Original spec/plan (base module only):
`docs/superpowers/specs/2026-06-26-regulations-tracker-design.md`,
`docs/superpowers/plans/2026-06-26-regulations-tracker.md`.

## State
- **Branch:** `feat/regulations-tracker` — pushed, in sync, ~33 commits. **NO PR opened** (holding for explicit go-ahead).
- **Gates (last verified):** Servers build OK; ~53 RT backend tests pass; API drift 0 (681 ops);
  Clients typecheck + i18n (100%, de/fr/es) + format-check all clean.
- **Local DB:** migrated + seeded with full per-country detail (60 countries) + global feeds
  (horizon 24, deadlines 3, frameworks 11). A real sync run was exercised (changed:0, baselined).

## What was built this session (beyond the base module)
1. **Full-detail storage + detail-page fix** — catalog stores `{...country, meta}` (not summary),
   so detail pages render offline; controller normalizes live + stale to one flat shape.
2. **UI polish** — country flag emojis on rows + detail header; green tick for tracked rows; 8px row
   gap; `VWLink` (with new `alwaysShowIcon` prop) for source links; timeline newest-first.
3. **Field completeness** — render `lastVerified`, `dateConfidence`, framework `namedDocuments`,
   plus the narrative Overview (oneLiner/executiveSummary/practicalTakeaway).
4. **Three global-feed tabs** — Horizon (changelog), Deadlines, Frameworks. Backend feed fetchers +
   `getGlobalFeed`/`setGlobalFeeds` on the meta singleton + 3 endpoints + 3 pages + sidebar/routes.
5. **Update-workflow improvements (the "(b)" backlog):**
   - Deep-linked per-country in-app notifications with the actual change detail.
   - `last_run_at`/`last_run_status` observability + "Last checked" in Settings.
   - Multi-change note via `countChangesSince` (hashHistory).
   - New-country admin alerts (`getAllOrgAdmins`).
   - Admin-only, rate-limited `POST /sync` "Check for updates now" + button.
6. **Two `/code-review` passes (high effort, workflow-backed), all findings resolved** — incl. the
   blocking weekly-job enum crash, stale-detail blank page, bulk-track DoS guards (pass 1), and the
   stale-watermark-on-failure, last_good_count=valid, swallowed-error, concurrency guard,
   empty-200 fallback (pass 2). Several "flat feed shape" findings adjudicated as false positives
   (feed IS nested under `country`; the test mock was fixed).

## Earlier in the same session (separate, already shipped/handled)
- **Bug 2 — file-content JSON-buffer corruption:** root-caused + data-repair migration
  `20260626043929-repair-files-content-json-buffer-corruption.js` (JS, not SQL — SQL per-byte
  approach blew 30GB tmp). Ran locally, 41/41 rows fixed. See
  `memory/bug-file-content-json-buffer-corruption.md`.

## To resume / finish
- **Open the PR** when told (summary-only body, no test-plan section, sentence case — per user conventions).
  Run pre-PR gates first: `cd Servers && npm run build`; `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`.
- Possible follow-ups (all optional, noted in the domain doc §7): refactor the `getStoredHashes`
  double-query; frontend component tests; confirm the feed legal disclaimer is finalised before GA.
