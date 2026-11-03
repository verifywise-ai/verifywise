# Benchmark Evidence Binder

**Issue:** #4687 — VerifyWise Software Layers Benchmark program ("+90" initiative)
**Purpose:** Make the benchmark auditable. Every layer score claimed in the
benchmark must be traceable to a concrete artifact: a CI job run, a dashboard,
a k6 load-test report, or a test-count snapshot. This binder is that trace.

## Layout

```
Software layers analysis/
└── evidence/
    ├── README.md            ← this file
    └── YYYY-MM/             ← one directory per month
        ├── performance-load.md
        ├── reliability-availability.md
        ├── security-verification.md
        └── quality-testing.md
```

One short markdown note **per layer per month**. Each note links:

1. **CI jobs** — workflow file + a link/run reference (GitHub Actions run URL
   or, for pre-merge evidence, the workflow path plus job name).
2. **Dashboards** — Grafana/Prometheus panel or Uptime Kuma monitor backing
   the availability claims.
3. **k6 runs** — load-test script, baseline doc, and the run output or trend.
4. **Test counts** — snapshot of test-file/test-case counts taken with
   `Get-ChildItem`/count commands, dated, so reviewers can re-run the count.

## Tag convention

| Tag | Meaning |
|-----|---------|
| ✅ | **exists** — path was verified on disk (`Test-Path` / `Get-ChildItem`) at the time the note was written |
| 🟡 | **planned-this-cycle** — the path lands in this PR cycle; it was **not** on disk when the note was written and must be re-verified before merge |
| ❌ | **gap** — no artifact exists and none is planned; the layer score must not claim coverage for it |

> **Rule:** never upgrade a 🟡 to ✅ inside the same note after the fact.
> Re-run the verification and write the next month's note instead — the
> month-over-month diff is the audit trail.

## Benchmark scores

Benchmark scores themselves live in **`VerifyWise Software Layers Benchmark.md`**
(issued separately). That file was **not present in the repository** when the
2026-10 notes were written (verified by recursive search, excluding
`node_modules` and virtualenvs — only unrelated benchmark files in
`graphify-out/` and a vendored `BENCHMARKS.md` were found), so the monthly
notes cite artifacts only and intentionally omit scores.

## Current cycle

- [`2026-10/`](./2026-10/) — layers worked in the October 2026 cycle.
