# Collection summary — ai-gateway
**Date:** 2026-04-29
**Articles audited:** 17 (1 from Phase 1 reused: endpoints; guardrails re-audited under v2)
**Verification:** see `_verification.md`

## Verdicts

| Article | Verdict | ❌ | ⚠️ | ❓ |
|---|---|---|---|---|
| analytics | ⚠️ minor (1) | 0 | 1 | 0 |
| endpoints (P1) | ✅ clean | 0 | 0 | 0 |
| getting-started | ⚠️ minor (1) | 0 | 1 | 0 |
| guardrails (re-audit) | ❌ significant (3) | 2 | 0 | 1 |
| logs | ❌ significant (1) | 1 | 0 | 0 |
| mcp-agent-keys | ✅ clean | 0 | 0 | 0 |
| mcp-approvals | ✅ clean | 0 | 0 | 0 |
| mcp-audit | ✅ clean | 0 | 0 | 0 |
| mcp-guardrails | ⚠️ minor (2) | 0 | 0 | 2 |
| mcp-overview | ✅ clean | 0 | 0 | 0 |
| mcp-servers | ⚠️ minor (1) | 0 | 1 | 0 |
| mcp-tools | ✅ clean | 0 | 0 | 0 |
| models | ✅ clean | 0 | 0 | 0 |
| playground | ✅ clean | 0 | 0 | 0 |
| prompts | ✅ clean | 0 | 0 | 0 |
| settings | ✅ clean | 0 | 0 | 0 |
| virtual-keys | ✅ clean | 0 | 0 | 0 |

## Verification

24 spot-checks across 17 reports, 17 passed = 71% pass rate. The verifier flagged 7 weak verifications, mostly evidence-citation quality issues (incomplete paths, grep patterns vs exact line numbers) rather than factually-wrong verifications. Lower than other collections (compliance 14/16, llm-evals 62/64), but not catastrophic — the underlying claims appear correct, the audit's evidence trail is just less precise.

## Assessment

This is the largest single-product collection (17 articles) and produced 11 ✅ clean, 4 ⚠️ minor, 2 ❌. The ❌ findings are concentrated:

**guardrails (re-audit)** validated the v2 prompt's value: Phase 1's "✅ clean" verdict was wrong. The re-audit caught all 3 weak verifications:
- HTTP status code is **400, not 422** (Phase 1 rationalized "422 is REST convention")
- Turkish TCKN example "12345678901" **fails the checksum** (Phase 1 only checked entity name existed)
- "No data leaves your network" claim correctly downgraded to **❓** (not provable without full network trace)

This is the strongest evidence yet that the v2 prompt tweaks worked. Phase 1's lazy verifications would have polluted the fix-pass with false confidence.

**logs** has a real ❌: the article claims log rows display latency, but latency only appears in the expanded detail panel (not the collapsed row).

**MCP articles** (8 of 17) skewed clean: 5 ✅, 2 ⚠️ minor, 1 with 2 ❓. MCP code is well-organized (clear router/CRUD/service split) which makes auditing easier.

Audit complete. Ready for global summary.
