# Regulations Tracker — session handover (2026-06-28)

> Durable handoff for resuming after `/clear`. Captures branch/PR state, everything
> built this session, and the open items. Pairs with the technical reference at
> `docs/technical/domains/regulations-tracker.md` and the design spec at
> `docs/superpowers/specs/2026-06-27-regulation-impact-analysis-design.md`.

## TL;DR

The Regulations Tracker module (base + impact analysis) plus a large round of UI/UX
improvements, bug fixes, role-permission fixes, and user-guide documentation are
**complete, committed, pushed, and on two open PRs**. Gates are green. Nothing is
mid-flight in code.

## Branches & PRs

| Branch | HEAD | PR | Base | State |
|---|---|---|---|---|
| `feat/regulations-tracker` | `8088a27ff` | **#4198** "Regulations tracker with AI regulation impact analysis" | `develop` | OPEN, fully pushed (0 unpushed) |
| `fix/model-tablename-mismatch` | `f48607235` | **#4199** "Fix tableName mismatch on VendorsProjects and ProjectFrameworks models" | `develop` | OPEN, assigned to **HarshP4585**, pushed |

Current checked-out branch: `feat/regulations-tracker`.

**Uncommitted in the working tree (intentionally NOT part of any PR):**
`Clients/src/presentation/components/IconButton/index.tsx` (a pre-existing PDF-download
fix that was already dirty at session start, unrelated to this feature) and
`.claude/scheduled_tasks.lock` + `.claude/settings.json` (local config). Leave them, or
decide separately where the IconButton fix belongs.

## What shipped this session (on `feat/regulations-tracker`)

The branch was already at a "feature complete, PR open" state at session start
(`7cf5aecc9`/PR #4198). Everything below was added on top:

**Two `/code-review` (high, workflow-backed) passes** — the second one found and fixed
real runtime bugs the mocked unit tests had hidden:
- **Broken SQL: `= ANY(:param)`** — Sequelize expands an array replacement to a comma list,
  so `ANY('a','b')` is a syntax error. Found in the deadlines flag-enrichment AND in 6
  Stage A impact queries (would have crashed `getCandidates` at runtime). All switched to
  `IN (:param)` with empty-array sentinels. Plus a wrong table name
  `project_frameworks` → `projects_frameworks` (DB table is plural).
- A full static SQL audit of all 33 queries in the feature confirmed no remaining broken
  sections. (`820139873`, `99f6f46f1`, and round-2 fixes in `ed2fd94eb`.)
- Round-2 also fixed: runway click-to-jump wrong-row-on-duplicate (identity map);
  `newlyAdded` count never returned by the sync; controller raw SQL moved to utils;
  `getDeadlines` parallelized; `getImpactAnalysis` fail-open settings guard; `formatDate`
  Invalid-Date guard; Frameworks VWLink; STAGE_DELAYS invariant comment.

**Country flags** — the deadlines enrichment was silently broken (the ANY() bug above).
Fixed, plus an idempotent migration `20260628110553-backfill-regulation-country-flags.js`
backfilling `data->>'flag'` into existing `regulation_countries` rows (older installs were
seeded before the snapshot carried flags). Flags now render on Browse, Tracked, Deadlines.

**UI/UX improvements** (all user-requested):
- Deadlines "next 12 months" runway calendar (built with the frontend-design skill):
  horizontal month strip, urgency heat tint for the nearest ~90 days, real VWTooltips on
  the markers, click-a-marker-to-jump-to-row. (`044c8f936`, `6ae747f91`.)
- Status chips colored by content across all pages via a shared `regulationStatusVariant`
  helper (`statusVariant.ts`). (`0ed4ba830`.)
- Frameworks page: 2-column card grid + "Looking for the EU AI Act? Find them in Browse"
  callout (the EU AI Act is a country-level reg, not an international framework). (`9f69debe5`.)
- "Check for updates now": simulated staged progress display (frontend-only). (`00864af35`.)
- Tracked page: per-row metadata line (N regulations / last changed / tracked since). (`28651354e`.)
- Browse row checkboxes: equal-size for tracked vs untracked (replaced the native checkbox
  with a Lucide Square/CheckSquare button so sizes match). (`592537a1a`.)
- Country detail: connected vertical timeline rail replacing disconnected dots. (`7b430828d`.)
- Settings: plain-language help text on the impact toggle (humanized), and an LLM-key status
  indicator showing which provider/model impact analysis will use + manage-keys link.
  (`da9583723`, `da9901690`.)

**Permissions / RBAC** (two user-driven corrections):
- **Editors can now track.** Tracking (track / untrack / bulk) was Admin/SuperAdmin only;
  added a `canTrack` helper allowing **Admin, SuperAdmin, Editor**. Settings, sync, and
  refresh stay Admin-only. Gated the Browse UI (per-row button, checkbox, bulk toolbar) so
  ineligible roles see a read-only catalogue. Updated controller role tests (46 pass).
  (`c4f90979f`.)
- **Super-admins are read-only inside an org.** A super-admin (role_id 5, org-less, enters
  an org via the `X-Organization-Id` header) gets read-only access — the backend
  `superAdminReadOnly` middleware 403s every non-GET. The UI was showing them write
  controls that would fail. Excluded super-admins from `canTrack` (Browse + CountryDetail),
  from the CountryDetail Re-analyse button, and from the Settings editable view, so a
  super-admin sees the whole module read-only. (`8088a27ff`.)

**Documentation** — there were NO user-guide docs for the module (the `helpArticlePath`
ids resolved to an empty drawer). Wrote 6 articles (browse, tracked, horizon, deadlines,
frameworks, settings) in the `ArticleContent` block format, registered them in
`shared/user-guide-content/` (`content/index.ts` + `userGuideConfig.ts` collection), and
ran them through the humanizer (scored "Human"). Verified the in-app help drawer now
renders content. (`59360ecba`, plus the role-doc tweak in `8088a27ff`.)

**Other commits this session that touched cadence/digest/empty-states** (these appear in
the log; if you did not author them in the foreground they came from parallel/background
work — verify before relying on the descriptions): `b7c859772` weekly→daily sync cadence;
`baa3a150c` de-weekly the digest subject; `13382ebfb` friendlier empty states + Deadlines
country drill-down; `b73321b6b` move impact analysis into the email digest.

## Website docs — ACTION REQUIRED (user)

The same 6 article files + the matching `content/index.ts` and `userGuideConfig.ts` edits
were **copied into** `/Users/gorkemcetin/website/verifywise/content/user-guide/` (byte-identical
format). Per the project rule, these were **left uncommitted** — the website repo is the
user's to commit and publish. Files present:
`content/user-guide/content/regulations-tracker/{browse,tracked,horizon,deadlines,frameworks,settings}.ts`.

## Gates (last verified green)

- Backend: `cd Servers && npm run build` clean; `npm run check:api-drift` 683=683;
  `npx jest ... regulationsTracker.ctrl` 46/46; impact + sync suites green.
- Frontend: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npm run build` — all clean.
- **Jest flag gotcha:** the plan's `npm run test -- --testPathPattern=X` is STALE for this
  Jest version (flag renamed; the old one is ignored → runs the whole suite). Use
  `npx jest --testPathIgnorePatterns='/tests/integration/|/helpers/' --forceExit <bare-pattern>`
  from the `Servers` dir.

## Local-environment notes (not code bugs)

- The local dev DB is a legacy multi-schema install (old tenant-hash schemas
  `1HNeOiZeFu` / `a4ayc80OGd` alongside `verifywise`). The org's data is in `verifywise`,
  but `verifywise.controls` is missing locally (the DB has 107 migrations run vs 91 on this
  branch — it's ahead/mixed from other branches). This means `getCandidates` can't fully run
  locally; CI/prod build the full schema correctly. User chose to "leave it."
- Browse/Tracked/Deadlines flags were null locally until the backfill migration ran; they
  now render. New installs get flags from the seed snapshot.

## Open / follow-up items

1. **Two PRs awaiting review/merge:** #4198 (the module — large, two code-review rounds done)
   and #4199 (model fix, assigned to Harsh). Neither merged yet.
2. **Website docs** — uncommitted, user to publish (above).
3. **Shared-model `tableName` bug is fixed on #4199 only** — not in #4198. Keep them separate.
4. **Read-only-super-admin UI gap likely exists in OTHER modules.** This session only fixed
   Regulations Tracker. A super-admin viewing an org may see write buttons elsewhere that
   404/403. Worth a broader audit as a separate task — not done.
5. **Known V1 limits of impact analysis** (documented in the design spec, unchanged): country→
   region mapping is coarse (the LLM refines it); standalone policies only matched via linked
   controls; vendor exposure has no enum value for ISO 42001 / NIST AI RMF (those vendors are
   caught via the project-link path — documented in code, not a bug).
6. **IconButton working-tree change** — pre-existing, unrelated, still uncommitted. Decide
   where it belongs.

## Key files (orientation)

- Backend impact: `Servers/utils/regulationImpact.utils.ts` (Stage A/B, orchestrator),
  `Servers/services/automations/actions/syncRegulationsTracker.ts` (the sync + impact hook),
  `Servers/controllers/regulationsTracker.ctrl.ts` (endpoints + `isAdmin`/`canTrack`),
  `Servers/utils/regulationsTracker.utils.ts` (module CRUD + `enrichWithFlags`).
- Frontend: `Clients/src/presentation/pages/RegulationsTracker/` (Browse, Tracked, Horizon,
  Deadlines, Frameworks, Settings, CountryDetail, CountryRowCard, statusVariant).
- Docs: `shared/user-guide-content/content/regulations-tracker/*` + the two config files.
- Reference: `docs/technical/domains/regulations-tracker.md`.
- Progress ledger (this session's blow-by-blow): `.superpowers/sdd/progress.md`.
