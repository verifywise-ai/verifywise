# ZAP Triage Runbook

**Scope:** Weekly triage of the OWASP ZAP scans and the remediation loop for their findings.
**Tracking:** verifywise-ai/verifywise#4616 (item 7)
**Owner:** application-security-engineer — **Backup:** security-tester, devsecops-engineer
**Last updated:** 2026-11-23

---

## 1. What runs where

| Workflow | Cadence | Target | Type | Gate |
|---|---|---|---|---|
| `.github/workflows/zap-baseline.yml` | Nightly 04:00 UTC + `workflow_dispatch` | Frontend `:5173`, backend `:3000/api` | Passive baseline | Backend **blocking** via `.zap/rules.tsv` FAIL rules; frontend informational (`continue-on-error`) while CSP is report-only |
| `.github/workflows/zap-api-scan.yml` | Nightly 05:00 UTC + `workflow_dispatch` | `Servers/swagger.yaml` against `:3000/api`, authenticated (JWT replacer) | Active API scan | **Blocking** on any High/Critical alert (riskcode ≥ 3) |

Both upload reports as artifacts (`zap-baseline-reports`, `zap-api-scan-report`, 30-day retention) and append an alert table to the job summary.

Operational notes:

- Scheduled runs on this org start several hours late (GitHub queueing) — "nightly" results typically land mid-day UTC.
- The API scan's active phase is bounded by `ascan.maxScanDurationInMins=45`; `-T` only caps startup + passive wait. If the scan step is ever cancelled again, treat it as an infrastructure failure (see §7), not a clean scan.
- The API scan step ends with `|| true` **by design**: gating lives in the separate "Fail on High/Critical alerts" step so the report is always written and uploaded. Do not "fix" the `|| true` without moving the gate.

## 2. Weekly triage ritual (15–30 min)

1. Open the latest **ZAP API Scan** run → read the job summary alert table. If the run is red or the summary says no report was produced, handle immediately (§6/§7).
2. Open the latest **ZAP Baseline Scan** run → read both alert tables (frontend, backend).
3. For every **new** alert (not in the last triage log entry), decide a disposition (§4) and record it in the triage log (§8).
4. If an alert needs the raw evidence, download the artifact: Actions → run → `zap-baseline-reports` / `zap-api-scan-report` → open the HTML, or parse the JSON:

   ```bash
   # High/Critical alerts (same expression the gate uses)
   jq -r '.site[].alerts[] | select((.riskcode | tonumber) >= 3) | "\(.risk) — \(.name) (\(.instances | length) instances)"' zap-reports/api-scan.json
   ```

## 3. Severity classification

| ZAP risk | riskcode | Action |
|---|---|---|
| High / Critical | ≥ 3 | Workflow already fails. Fix or justify-suppress **within the week**; confirmed exploitable → §7 escalation |
| Medium | 2 | Disposition (fix or suppress) within **2 triage cycles** |
| Low / Info | 0–1 | Batch review quarterly; suppress only obvious noise |

## 4. Dispositions

For each finding, exactly one of:

1. **Fix the root cause** — preferred. Route per §5, land a fix PR, verify per §6.
2. **Suppress in `.zap/rules.tsv`** — only with documented justification:
   - Exactly **3 tab-separated tokens** per line: `id<TAB>threshold<TAB>description`. Two-token lines abort the scan with exit code 3.
   - Valid thresholds: `IGNORE | INFO | WARN | FAIL` (`PASS` accepted). `LOW/MEDIUM/HIGH` are **not** valid.
   - `IGNORE` requires a reachability/exploitability rationale in the description (same standard as `dependabot-exceptions.md`), citing the code path that makes it safe.
   - `WARN` is the holding state for triaged-but-unfixed findings.
3. **Promote to `FAIL`** — the default direction once a control is verified working (e.g. a header confirmed set by helmet). Tightening is the goal of the loop; suppressions should shrink over time.

## 5. Root-cause routing

| Finding family | Where to fix |
|---|---|
| Missing security headers (backend: 10020, 10021, 10038) | `Servers/app.ts` (`helmet()`); per-endpoint download headers in `Servers/controllers/fileManager.ctrl.ts`, `reportRun.ctrl.ts` |
| Missing security headers (frontend) | `Clients/nginx.conf` (note: the baseline currently scans the vite dev server, which sets none of these — see §9) |
| Cookie flags (10010, 90033 family) | `Servers/controllers/user.ctrl.ts` (refresh cookie), `Servers/middleware/csrf.middleware.ts` (double-submit CSRF cookie — **intentionally** JS-readable). CI serves plain HTTP with `NODE_ENV=test`, so "Secure flag missing" on CI is expected noise |
| Reflected input / XSS / SQLi (40012/40014/40026/40018) | `Servers/controllers/`, `Servers/routes/`; client-side sanitization (DOMPurify) in `Clients/` |
| Path traversal (6) | `Servers/controllers/fileManager.ctrl.ts` and any file-serving route |
| CSP findings (10038) | Follow `csp-evidence-pack.md`; CSP is report-only pending that triage |
| Application error disclosure (90022) | `Servers/utils/i18n.utils.ts`, `Servers/utils/statusCode.utils.ts` — see §9 |

## 6. Verifying a fix

1. Land the fix (or rules.tsv change) on a branch.
2. Re-run the affected workflow on that branch: Actions → workflow → **Run workflow** → pick the branch (`gh workflow run zap-api-scan.yml --ref <branch>`).
3. The fix PR must link the green run and state the alert-count diff (before → after from the job summaries).
4. Backend baseline FAIL-rule regressions fail the job by design — a red backend baseline on `develop` is a P1: fix or revert same-day.

## 7. Escalation

- **Confirmed exploitable High/Critical** → security incident path and P0 per `docs/technical/security/platform-security-evaluation-2026-07.md`.
- **Scanner/tooling failures** — exit code 3 (rules.tsv format), job-timeout cancellations, missing report files, docker/login failures → devsecops-engineer. A missing report is **never** a clean scan (the API-scan gate fails explicitly in this case).

## 8. Triage log

Append one row per weekly pass (newest first).

| Date | Run(s) | New alerts | Dispositions | rules.tsv change |
|---|---|---|---|---|
| 2026-11-23 | baseline `45020500840` (green); api-scan `45026057163` (cancelled @75 min — infra) | api-scan had never completed (bounded in `631c8e83e2`) | Workflow fixed; first real api-scan report to be triaged on the verification dispatch for this change | 10010 relabelled + justified; 2, 10096 justifications clarified |

## 9. Known follow-ups (backlog)

Found during the 2026-11-23 review; fix in dedicated PRs, then update the relevant rules.tsv thresholds:

1. **500 responses can leak internals** — `translateError` (`Servers/utils/i18n.utils.ts`) falls back to raw `error.message`, and there is no terminal `ErrorRequestHandler` in `Servers/app.ts`, so body-parse failures return Express stack traces when `NODE_ENV != production` (as in these workflows). Fix: generic terminal error handler + generic 500 messages; then add `90022 FAIL` to rules.tsv.
2. **Logout does not clear `csrfToken`** — `Servers/controllers/user.ctrl.ts` clears it with `path: "/api/users"` but sets it with `path: "/"`. Align the paths and add a regression test.
3. **Frontend baseline scans the vite dev server** — production headers live in `Clients/nginx.conf` and are never exercised. Scan the nginx-served build instead; then the frontend `continue-on-error` exemption can be retired and 10020/10021/10038 promoted to FAIL for both targets.
