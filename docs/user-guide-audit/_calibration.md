# Calibration memo — Phase 1 results

**Date:** 2026-04-29
**Spec:** docs/superpowers/specs/2026-04-29-user-guide-truthfulness-audit-design.md
**Plan:** docs/superpowers/plans/2026-04-29-user-guide-audit-phase1-calibration.md

## Sample summary

| # | Collection | Article | Verdict | ❌ | ⚠️ | ❓ | Browser? | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | ai-gateway | guardrails | ✅ clean | 0 | 0 | 0 | no | Parent flagged 3 weak verifications (see Quality concerns) |
| 2 | ai-gateway | endpoints | ✅ clean | 0 | 0 | 0 | no | Solid evidence cited (file:line throughout) |
| 3 | getting-started | quick-start | ⚠️ minor (1) | 1 | 0 | 0 | no | Real finding: doc references non-existent "Controls hub" sidebar item |
| 4 | compliance | eu-ai-act | ⚠️ minor (1) | 0 | 1 | 0 | no | Real finding: status values "Waiting" vs "Not started" — should be ❌ not ⚠️ |
| 5 | ai-detection | scanning | ⚠️ minor (1) | 1 | 0 | 0 | no | Real finding: doc says "100+ patterns", code has 83 |
| 6 | settings | role-configuration | ✅ clean | 0 | 0 | 0 | no | Roles match memory; one piece of weak permission evidence |

**Totals:** 3 real findings across 6 articles. 0% required browser escalation. All findings are high-confidence and concrete.

## Method evaluation

### Did the report template capture what we needed?

Mostly yes. The template is workable: every report rendered cleanly, the verdict-at-top works as a directory dashboard, and the "Verified claims" section successfully forced auditors to show proof-of-work. Three issues surfaced:

1. **No standard place to log "weak evidence I'm accepting anyway."** When a subagent isn't fully sure but doesn't want to mark ❓, it tends to either inflate to ✅ or skip. The template should add a "Caveats" line per claim, OR the parent should explicitly review each Verified claim's evidence (which is what happened here, manually).

2. **Status classification is fuzzy on the line between ❌ and ⚠️.** Article 4 (eu-ai-act) found a clear concrete contradiction ("Waiting" vs "Not started") and called it ⚠️ partial — should be ❌. Subagents seem to default toward gentler statuses. Need to spell out in the prompt: clear contradiction = ❌, missing-detail-or-nuance = ⚠️.

3. **"Skipped" vs "❓ unverifiable" is being conflated.** Article 5 punted an OWASP Top 10 LLM pipeline claim to Skipped because it couldn't verify the implementation — that should have been a ❓ finding (a behavior claim that can't be confirmed), not a skip (which is for opinion/motivation). The prompt needs to say: if you cannot verify a verifiable-type claim, that's a ❓ finding, not a skip.

### Were claim types over- or under-flagged?

- **UI claims** — well-handled. Subagents grep for exact strings and cite file:line. Article 3's "Controls hub" finding is exemplary.
- **Quantitative claims** — mostly handled, one regression. Article 1 rationalized "HTTP 422 is standard REST convention" without finding the actual `raise HTTPException(status_code=422)`. Articles 2-6 cited actual lines. The fix in article 2's prompt ("DO NOT rationalize from 'standard REST convention'") seemed to stick for the rest.
- **Compliance claims** — handled correctly across the board. Bulk went to Skipped per the low-confidence rule, which is the right outcome.
- **Negative claims** — handled inconsistently. Article 1 marked "no data leaves your network" as ✅ based on local Presidio package presence — that's the failure mode the spec warned about. Articles 2-6 either avoided negative claims or handled them better. Need to tighten the prompt: presence of a feature does NOT prove absence of related behavior; require a request-handler code-path trace.
- **Cross-doc claims** — handled correctly. Articles 2 and 4 explicitly verified referenced articles exist.
- **Example claims** — under-checked. Article 1 marked the Turkish TCKN example "12345678901" as verified by the entity name's existence in the catalog, but didn't check the example value passes Presidio's actual TR_TCKN recognizer (which has a checksum). Need: examples in tables must be tested against the recognizer/parser, not just confirmed that the entity type exists.

### Was browser escalation calibrated?

Zero browser escalations across 6 articles. That's appropriate for this sample — none of the claims required rendered-output verification. But the calibration of "when to escalate" wasn't really tested. Step-by-step articles like quick-start could have benefited from one walk-through (would have caught Controls hub via the sidebar UI, though the code-grep caught it too). For Phase 2, recommend keeping browser as escalation-only and not forcing it.

### Did the cluster check pay off?

Mixed. Article 4's status-values finding is a cluster (block 13 AND block 14 both wrong) — the auditor caught both. Article 3's Controls hub finding was isolated, no cluster to find. The check is cheap and worth keeping.

### Cost feasibility for full rollout

Each subagent run completed in roughly 2-5 minutes wall-clock. Token usage isn't directly measurable from this side, but reports were ~30 lines each (compact). Extrapolation to 91 articles:

- **Time:** ~3-7 hours of subagent wall-clock if serial. Could be faster with parallel dispatch (3-4 subagents at once) since they don't share state — bringing it to ~1-2 hours.
- **Tokens:** rough estimate, well within practical limits for an audit of this size.
- **Calendar:** review-gate-per-collection (per spec) means ~13 user reviews; even at 5 minutes each that's an hour of your time across the rollout, spread over days.

**Verdict on feasibility: feasible.** The bottleneck is review attention, not compute.

## Quality concerns

The biggest quality concern is **subagent over-confidence on weak evidence**. Two specific patterns:

1. **Negative claims marked ✅ on indirect evidence.** Article 1 is the example. Spec already calls this out; the prompt needs sharper teeth.

2. **Quantitative claims rationalized from "convention".** Article 1, "HTTP 422 is standard REST convention" — the auditor didn't find the actual line. This was caught and corrected for articles 2-6 by adding "DO NOT rationalize" to the prompt.

3. **Real findings being marked ⚠️ instead of ❌.** Article 4 flagged a concrete contradiction as ⚠️ partial. The spec language was insufficient to prevent this; the prompt needs explicit examples.

A second concern: **the "Verified claims" section can't catch its own errors.** A subagent that cites "verified at file:line" is trusted by the parent unless the parent re-checks. In this calibration, I (parent) spot-checked a few — but doing that for 91 articles defeats the purpose of subagents. For Phase 2, I propose a **lightweight verification subagent** that re-checks 2-3 random Verified claims per report. Adds a bit of cost but catches false-positive verifications.

## Recommendation

**Tweak the method, then proceed to Phase 2 without re-sampling.**

The method works. The issues found are concrete and addressable in the prompt. Re-sampling 6 more articles would mostly re-confirm what we already know.

**Specific tweaks to the subagent prompt before Phase 2:**

1. **Stronger negative-claim rule.** Add: "Presence of a local package, or absence of one specific external call, is NOT sufficient to verify a negative claim. You must trace the actual request-handling code path. If the code path is too long to trace, mark ❓."

2. **Stronger quantitative-claim rule.** Already partially in (added mid-calibration after article 1). Keep it: "Cite the actual code line. 'Standard REST convention' or 'common pattern' is NOT verification."

3. **Status classification examples.** Add: "❌ wrong = doc says one specific thing, code says a different specific thing (e.g., 'Click Save' but the button is labeled 'Submit'; doc says '100+' but code has 83). ⚠️ partial = doc is mostly right but missing detail or has minor mismatch (e.g., doc lists 5 of 6 fields)."

4. **Example-claim rule.** Add: "For examples in tables/code (e.g., '12345678901' as a TCKN example), verify the example actually works against the recognizer/parser. The existence of the entity type in the catalog is NOT sufficient."

5. **Skip vs ❓ rule.** Add: "If a claim is verifiable in principle (UI/Behavior/Quantitative/Reference) but you cannot verify it with available tools or in reasonable time, that is a ❓ finding, not a Skip. Skip is reserved for opinion, motivation, and external regulatory definitions."

6. **(Optional) Add a verification subagent for Phase 2.** Per-collection, after audit subagents complete, dispatch one Explore subagent to spot-check 2-3 Verified claims per report. Catches false-positive verifications without parent attention. Cost is low (single subagent per collection vs N audit subagents).

**Phase 2 collection ordering proposal** (smallest/cheapest first to validate tweaked prompt):

1. `getting-started` (4 articles, 1 already done) — finish remaining 3
2. `settings` (5 articles, 1 already done) — finish remaining 4
3. `ai-gateway` (~12 articles, 2 already done) — finish remaining ~10; this collection has high-density technical claims so it's a real test of the tweaks
4. `ai-detection` (~10 articles, 1 already done) — finish remaining ~9; high-churn, drift likely
5. `compliance` (8 articles, 1 already done) — finish remaining 7; compliance-claim heavy
6. Then everything else (`ai-governance`, `integrations`, `llm-evals`, `policies`, `reporting`, `risk-management`, `shadow-ai`, `training`)

The Phase 1 reports for the 6 sampled articles are reused — no need to re-audit them.

## Open questions for the user

1. **Re-audit ai-gateway/guardrails?** That report has 3 known weak verifications (negative claim, quantitative claim, example claim) marked ✅. Options: (a) leave it and add a note to the report; (b) re-dispatch with the tweaked prompt now; (c) re-audit it as part of the ai-gateway collection in Phase 2 batch. Recommendation: (c) — it'll get audited anyway.

2. **Add the verification subagent (item 6 above)?** Adds modest cost, catches false-positives. Yes/no?

3. **Phase 2 collection order:** the order proposed above is "smallest first." Alternative: highest-risk-first (start with compliance and ai-detection where drift is most consequential). Preference?

## Phase 1 outcome (2026-04-29)

**User decision: Proceed to Phase 2 with all 5 prompt tweaks (option A).**

Open question answers:
1. Re-audit `ai-gateway/guardrails` as part of the Phase 2 ai-gateway batch.
2. Add the verification subagent — yes.
3. Smallest-first collection order — yes.

**Next action:** Write Phase 2 plan covering: tweaked subagent prompt, verification subagent, smallest-first collection order, re-audit of `ai-gateway/guardrails`.
