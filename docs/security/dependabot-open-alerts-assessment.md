# Dependabot open alerts — risk assessment (2026-10-12, re-verified 2026-10-19)

Two Dependabot alerts are open against `Servers/package-lock.json`. For
**both**, the latest version published to npm still falls inside the
vulnerable range — there is no patched release to upgrade to. This document
records the chains, the exploitability analysis for this codebase, the
exposure minimization applied in this branch, and the recommended dismissal
justification so the alerts can be closed correctly (and re-opened if a fix
ever ships).

> **2026-10-19 consolidation re-verification.** During the consolidated
> dependency-update sweep (superseding Dependabot PRs #5016–#5033), both
> alerts were re-checked: `braces` newest on npm is still 3.0.3 and
> `sprintf-js` newest is still 1.1.3 — both remain inside their vulnerable
> ranges and Dependabot still reports no `first_patched_version`. The
> analysis below stands; the `sprintf-js` override (1.1.3) is still in
> place in `Servers/package.json`. Dismissal in the Security tab remains
> the only way to close these two alerts.

- #651 (HIGH) — `braces` — GHSA-vfj7-8cjw-p6xm — "stack-exhaustion denial of
  service through deeply nested patterns" — vulnerable range `<= 3.0.3`.
- #659 (MEDIUM) — `sprintf-js` — GHSA-hp3w-g68c-fv3c — "denial of service
  through unbounded precision specifiers" — vulnerable range `<= 1.1.3`.

## braces (#651)

- **No fix exists.** npm's newest `braces` is 3.0.3 (checked 2026-10-12);
  Dependabot's `first_patched_version` is null.
- **How it reaches us.** Exclusively transitive: `micromatch ^3.0.3` ←
  `fast-glob`, `http-proxy-middleware` (a **production** dependency of the
  Express backend), `@jest`/`chokidar` tooling (dev). The lockfile pins
  3.0.3.
- **Exploitability here.** The vulnerable path expands glob patterns; it is
  reachable only with attacker-controlled *patterns* (not attacker-controlled
  file names against fixed patterns). Every pattern that reaches `braces` in
  this repo is operator-authored config: `http-proxy-middleware` route
  matchers from our own route table, jest `testMatch`/`watchPathIgnorePatterns`,
  build/glob scripts. No request input is interpolated into a glob pattern.
  Worst realistic case: a malformed operator config string makes a dev tool
  or the proxy worker crash-loop — availability of tooling, not data
  disclosure or RCE.
- **Compensating controls.** Lockfile integrity (`npm ci`, sha512), the CI
  security stack (CodeQL, Semgrep, ZAP, Trivy, secret scanning), and
  Dependabot continuing to watch for a fixed release.
- **Recommended action.** Dismiss as "vulnerable code is not actually used" /
  "no patched version available", linked to this document; revisit if a
  `braces` > 3.0.3 is ever published (then bump via the existing
  `overrides` block in `Servers/package.json`).

## sprintf-js (#659)

- **No fix exists.** npm's newest `sprintf-js` is 1.1.3 (checked
  2026-10-12), which is itself inside the vulnerable range
  (`<= 1.1.3`); Dependabot's `first_patched_version` is null.
- **How it reaches us.** Transitive via `argparse@1.x`: the hoisted copy
  serves `js-yaml@3.x` (pinned by `@istanbuljs/load-nyc-config ^3.13.1`,
  coverage tooling), `mammoth ~1.0.3` and `yamljs ^1.0.7` (both only
  imported by `Servers/scripts/*` dev tooling). The lockfile pinned 1.0.3.
- **Exposure minimization applied.** An `overrides` entry pins
  `sprintf-js` to **1.1.3** (the newest, least-vulnerable available line),
  upgrading the tree from 1.0.3. This reduces exposure but cannot close the
  alert — the advisory covers every published version.
- **Exploitability here.** The vulnerable path is `sprintf`-style format
  parsing with unbounded precision/width specifiers. In our tree
  `sprintf-js` is used by `argparse` for usage-string formatting, fed
  entirely by argument-parser definitions in dev/config tooling — no
  request input reaches it. The vulnerable DoS requires an attacker to
  supply a format string; none of our call sites accept one.
- **Compensating controls.** Same stack as above; additionally the only
  runtime-adjacent consumer (`js-yaml` via nyc config loading) parses
  files authored by operators, not users.
- **Recommended action.** Dismiss as "no patched version available",
  linked to this document; revisit on any `sprintf-js` > 1.1.3 release.

## Summary

| Alert | Severity | Fix available | In prod tree | Attacker-controlled input reaches it | Action |
|---|---|---|---|---|---|
| #651 braces | High | No (latest = 3.0.3, still vulnerable) | Yes (via http-proxy-middleware) | No — patterns are operator config | Dismiss w/ justification; bump when a fix ships |
| #659 sprintf-js | Medium | No (latest = 1.1.3, still vulnerable) | No (dev tooling only) | No — format strings are code-authored | Dismiss w/ justification; override applied to minimize |
