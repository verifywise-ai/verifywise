# Collection summary — llm-evals
**Date:** 2026-04-29
**Articles audited:** 13
**Verification:** see `_verification.md`

## Verdicts

| Article | Verdict | ❌ | ⚠️ | ❓ |
|---|---|---|---|---|
| bias-audits | ⚠️ minor (1) | 0 | 1 | 0 |
| ci-cd-integration | ⚠️ minor (2) | 1 | 1 | 0 |
| configuration | ✅ clean | 0 | 0 | 0 |
| configuring-scorers | ❌ significant (1) | 1 | 0 | 0 |
| leaderboard | ⚠️ minor (1) | 0 | 1 | 0 |
| llm-arena | ✅ clean | 0 | 0 | 0 |
| llm-evals-overview | ✅ clean | 0 | 0 | 0 |
| managing-datasets | ⚠️ minor (2) | 0 | 2 | 0 |
| models | ⚠️ minor (2) | 0 | 2 | 0 |
| playground | ✅ clean | 0 | 0 | 0 |
| reports | ⚠️ minor (1) | 1 | 0 | 0 |
| running-experiments | ✅ clean | 0 | 0 | 0 |
| settings | ❌ significant (1) | 1 | 0 | 0 |

## Verification

64 verified claims spot-checked across 13 reports; 2 false-positive partials caught (`leaderboard.md` "listed in sidebar but not yet available" — actually commented out so not listed; `models.md` Settings-UI interaction partially confirmed). 62/64 passed = ~97% pass rate, the strongest verification result of any collection so far.

## Assessment

This is the largest collection (13 articles) and produced a coherent picture of the LLM Evals subsystem: 5 ✅ clean, 6 ⚠️ minor, 2 ❌. The ❌ findings are both **enum/list count drift**:
- `configuring-scorers`: doc says "6 built-in scorers" but actual scorer registry has 13 (7 basic + 6 conversational)
- `settings`: doc lists 8 supported providers (Google, xAI, Mistral, Hugging Face + 4 others) but only 4 exist in the code

Same pattern as policies/risk-management/ai-detection: the docs describe enum-like lists that drift behind code without being re-counted.

`reports` ❌ finding is also concrete: history table columns documented don't match the actual ReportTable component.

`leaderboard` is interesting — the doc admits the feature is "listed in the sidebar but not yet available", but the actual code has the sidebar item *commented out*, not present-but-disabled. Wording fix needed; or product decision to uncomment if ready.

One subagent failure: `llm-evals/reports` audit refused with "read-only mode" message; transcribed by the parent thread from the subagent's analytical output. Logged for global summary.

Ready to move on.
