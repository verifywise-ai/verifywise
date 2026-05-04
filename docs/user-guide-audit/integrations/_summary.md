# Collection summary — integrations
**Date:** 2026-04-29
**Articles audited:** 5
**Verification:** see `_verification.md`

## Verdicts

| Article | Verdict | ❌ | ⚠️ | ❓ |
|---|---|---|---|---|
| api-access | ⚠️ minor (1) | 0 | 1 | 0 |
| automations | ✅ clean | 0 | 0 | 0 |
| integration-overview | ⚠️ minor (1) | 0 | 1 | 0 |
| plugins | ⚠️ minor (2) | 1 | 1 | 0 |
| slack-integration | ⚠️ minor (1) | 1 | 0 | 0 |

## Verification

10/10 spot-checks passed. No false-positive verifications detected.

## Assessment

Findings cluster around **enum/categorical drift**: slack notification types listed in doc don't match the `SlackNotificationRoutingType` enum; plugins article doesn't mention the Frameworks tab structure. These are the same family of drift seen in policy-templates and ai-detection/settings — the docs describe enum-like lists (notification types, vulnerability types, categories) that have evolved in code without doc sync.

`automations` first audit attempt erroneously refused to write (claimed "read-only mode"). Second attempt produced a ✅ clean verdict that diverged from the first attempt's findings (button label, list columns, role-check) — a notable inconsistency in subagent quality. Verification subagent's spot-check on the second attempt passed, but this is a method-quality concern: same input, different audit verdict. Logging for global summary.

`plugins` article references a separate `plugin-marketplace` repo (per CLAUDE.md). Reference claims to that external repo were appropriately flagged as not auditable from this codebase.

Ready to move on.
