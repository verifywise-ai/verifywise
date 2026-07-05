# Session handover — 2026-07-05

Context for resuming after `/clear`. This session ran a long MRM (Model Risk
Management) push: shipped the feature's follow-on fixes, then built a three-phase
metric **simulator** that found and fixed several real production bugs.

## TL;DR state

- **11 PRs this session; 10 merged, 1 open.** Only **#4229** (auth 401 hardening)
  is still open.
- The **MRM metric simulator** (`tools/mrm-simulator/`) is fully built and merged
  to develop: v1 (scenario CLI + gap-finder), v2a (real Python compute + config
  fleet), v2b (live web dashboard).
- The simulator found and fixed **three real production MRM bugs** (see below).
- A parked "in-app demo ingest" idea was **evaluated and dropped** (the simulator
  covers demos better than static seeding). See
  `memory/idea-in-app-demo-ingest.md`.

## What shipped (merged to develop)

| PR | What |
|----|------|
| #4228 | MRM feature itself (tiering, validation, findings, monitoring/ingestion, revalidation, attestation) — merged early in the session. |
| #4230 | fix(mrm): attestation summary `ANY(:array)` → `IN(:array)` (was a 500). |
| #4231 | docs(mrm): in-app user-guide article (help panel). |
| #4232 | feat(mrm): route the six MRM sub-tabs + settings sections; new reusable `components/SectionNav`. Also fixed a pre-existing infinite render loop in the settings Roles section. |
| #4233 | fix(mrm): persist `external_key` on model **update** (PATCH silently dropped it → ingestion 404'd). |
| #4234 | feat: MRM simulator v1 (scenario-driven scripted metrics, gap-finder). |
| #4235 | feat: make `external_key` settable at model **create** + UI field + 409 on duplicate. |
| #4236 | feat: simulator v2a — real Python metric compute + config-driven fleet. |
| #4237 | fix(mrm): batch metric ingestion SAVEPOINT (500 on any re-run with a duplicate point). |
| #4238 | feat: simulator v2b — live web dashboard. |

## Still open

- **PR #4229** — `fix(auth): return 401 when a valid token references a missing
  user`. Branch `fix/auth-401-missing-user`. Real hardening: `auth.middleware.ts`
  threw a 500 (dereferencing `user.role_id` when `getUserByIdQuery` returned
  undefined) — now returns 401. Assigned MuhammadKhalilzadeh. Reviewed clean,
  gates green. **Just needs merge.**

## The three production bugs the simulator found

1. **`external_key` not persisted on update** (#4233) — the model PATCH accepted
   the field but dropped it (missing from the controller allow-list, the model
   method, and the UPDATE SQL). Ingestion resolves models by `external_key`, so
   MRM monitoring was unusable. Fixed across all three layers.
2. **`external_key` not settable on create / not returned by serializers**
   (#4235) — same class on the create path + `toSafeJSON`/`toJSON` omitted it +
   no UI field. Fixed; added a 409 on duplicate keys.
3. **Batch ingestion SAVEPOINT bug** (#4237) — `ingestPointQuery` caught the
   idempotency 23505 in JS but a failed INSERT aborts the whole Postgres
   transaction, so a duplicate point poisoned the rest of a batch → 500 on every
   re-run. Fixed by wrapping the insert in a SAVEPOINT (RELEASE on success,
   ROLLBACK TO on 23505).

## The simulator (now on develop)

`tools/mrm-simulator/` — a **dev-only CLI** that impersonates a model-monitoring
platform (Evidently/Arize style) feeding VerifyWise MRM. See the full reference:
`docs/technical/domains/mrm-simulator.md`.

- **v2a compute:** a Python module (`compute/`, pandas/numpy/sklearn/scipy)
  computes real PSI/AUC/gini/KS/fairness from four bundled CSV datasets with
  embedded drift. The TS engine shells out to it per model/period.
- **Config-driven:** `config.yaml` defines the fleet.
- **v2b dashboard:** `sim dashboard` starts a local HTTP+WebSocket server that
  drives the sim and streams computed metrics/breaches/pushes to a
  VerifyWise-styled four-panel page.

**Gotchas to remember (documented in the simulator README + doc):**
- Needs a Python venv: `cd tools/mrm-simulator/compute && python3 -m venv venv &&
  ./venv/bin/pip install -r requirements.txt`.
- Datasets are fixed-date (2026-06-01 onward) → backfill/dashboard need
  `--start-date 2026-06-01`.
- `npm run sim` strips flags → use `npm run sim -- <cmd> --flags` or
  `npx tsx src/cli.ts <cmd>`.
- The Python compute CLI is invoked as `python __main__.py` from `compute/`
  (not `python -m compute`).

## Local dev environment notes

- Backend was run via `cd Servers && npm run watch` (tsc-watch + nodemon). A
  recurring friction: running `npm run build` in `Servers/` kills the watch
  process on :3000 — restart it after any manual build.
- Dev auto-bootstrap is enabled in `Servers/.env` (`DEV_AUTO_BOOTSTRAP=true`,
  admin `gorkem.cetin@verifywise.ai` / `Verifywise#1`, org "Acme Dev"). The
  password is quoted in `.env` because the `#` would otherwise be treated as an
  inline comment.
- Sim models occupy model_inventory ids ~5-8 with external_keys
  `credit-scoring-v3`, `fraud-detector-v2`, `loan-approval-v1`,
  `churn-propensity-v1`.

## Suggested next steps

1. **Merge #4229** (the last open PR) when ready.
2. Optionally run the dashboard for a demo:
   `cd tools/mrm-simulator && npx tsx src/cli.ts dashboard --start-date 2026-06-01 --days 30`.
3. The in-app demo-ingest feature is **dropped** — revive only if *customer*
   self-serve (no terminal) becomes a real need.

## Working state at handover

- On branch `docs/mrm-simulator-handover` (this doc + the simulator technical doc
  + a CLAUDE.md update). Everything else is merged.
- Working tree otherwise clean apart from long-standing untracked scratch files
  (screenshots, `.json` snapshots) in the repo root — not part of any work.
