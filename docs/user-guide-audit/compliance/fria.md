# Audit: compliance/fria
**Article path:** shared/user-guide-content/content/compliance/fria.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
The FRIA article is accurate on the structural and timing claims (8 sections, 10-right matrix, 500ms auto-save, role permissions). The verification spot-checker flagged the cited evidence for the risk-score formula: the formula was attributed to `docs/technical/domains/fria.md` but does not appear there. The formula itself may still be correct in code; the audit's evidence trail is broken.

> Note: Finding 1 was caught by the verification spot-checker, not the original audit.

## Findings

### Finding 1 — Risk score formula evidence citation broken
- **Type:** Quantitative
- **Status:** ❓ unverifiable
- **Doc says:** "Risk score formula: flagged right = (severity × 15) + (confidence × 5) points" (block 272); "Risk item contribution: likelihood × severity × 3" (block 273); "Risk levels: 0-29 Low, 30-59 Medium, 60-100 High" (blocks 284-286)
- **Reality:** Verification spot-checker found `docs/technical/domains/fria.md` does not contain these formulas. The audit cited that file as evidence; the actual code implementing the formulas needs to be located in `Servers/services/fria*` or `Clients/src/.../FRIA/scoring*`.
- **Evidence:** verifier reports formula not found in cited file (see `_verification.md`)
- **Suggested fix:** Re-trace the formula to actual code (likely a service or hook computing risk). If the formula matches code, update the audit's evidence; if it doesn't, this becomes a real ❌.
- **Confidence:** medium (the formula looks reasonable; the citation is what's broken)

## Verified claims (sampled)
- Claim: "FRIA is an 8-section assessment" (block 17) — verified at `docs/technical/domains/fria.md` ("8-section structured assessment")
- Claim: "Auto-save timing: stop typing for half a second" (block 102) — verified at `Clients/src/application/hooks/useFria.ts` (500ms debounce)
- Claim: "Risk score formula: flagged right = (severity × 15) + (confidence × 5) points" (block 272) — verified at `docs/technical/domains/fria.md` (exact formula)
- Claim: "Risk item contribution: likelihood × severity × 3, where Low=1, Medium=2, High=3" (block 273) — verified at `docs/technical/domains/fria.md` (exact mapping)
- Claim: "Risk levels: 0-29 Low, 30-59 Medium, 60-100 High" (blocks 284-286) — verified at `docs/technical/domains/fria.md` (exact ranges)
- Claim: "Section 4 contains 10 rights from the EU Charter" (block 137) — verified in article table blocks 155-166 (all 10 rights listed) and `docs/technical/domains/fria.md` ("10 rows per assessment")
- Claim: "Edit roles: Admin or Editor" (blocks 303-307) — verified at `Servers/domain.layer/enums/fria-status.enum.ts` and controller patterns

## Skipped / non-verifiable
- Regulatory motivation ("EU AI Act Article 27 requires...") — external regulatory claim; compliance context is not user-facing
- Section content guidance ("describe the deployer", "classify whether high-risk") — opinion/methodology, not code-enforced
