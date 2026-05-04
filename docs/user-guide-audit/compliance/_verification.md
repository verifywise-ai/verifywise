# Verification spot-checks — compliance
**Date:** 2026-04-29
**Reports spot-checked:** 8
**Claims re-verified:** 16
**Failed spot-checks:** 2

## Per-report results

### assessments.md
- ✅ Claim 1: Assessment system enables compliance tracking workflow — **PASS** (AssessmentEU model verified with projects_frameworks_id linkage)
- ✅ Claim 2: 14 assessment subtopics with unified UI pattern — **PASS** (verified in assessments.tsx)

### ce-marking.md
- ✅ Claim 1: 7 conformity steps — **PASS** (DEFAULT_CONFORMITY_STEPS array contains exactly 7 entries)
- ✅ Claim 2: Status enum has "Not started, In progress, Completed or Not needed" — **PASS** (ConformityStepStatus verified with correct Title Case)

### eu-ai-act.md
- ✅ Claim 1: Subcontrols with question tracking and notes — **PASS** (EUAIActQuestionDrawerDialog NotesTab verified at lines 1686-1689)
- ✅ Claim 2: Evidence Hub file linking for eu_ai_act framework — **PASS** (evidenceHub.repository.ts and EUAIActQuestionDrawerDialog verified)

### fria.md
- ✅ Claim 1: FRIA is an 8-section assessment — **PASS** (verified in technical documentation)
- ⚠️ Claim 2: Risk score formula "flagged right = (severity × 15) + (confidence × 5)" — **UNVERIFIABLE** (formula NOT found in docs/technical/domains/fria.md; useFria.ts only shows 500ms debounce, no formula calculation)

### iso-27001.md
- ✅ Claim 1: ISO 27001 is leading international ISMS standard — **PASS** (factual framework context, FRAMEWORK_IDS.ISO_27001: 3 verified)
- ✅ Claim 2: Training data poisoning and adversarial attacks are documented threats — **PASS** (accurate AI security taxonomy)

### iso-42001.md
- ✅ Claim 1: Published December 2023, first AI-specific global standard — **PASS** (ISO 42001:2023 by ISO/IEC JTC 1/SC 42 is factually accurate)
- ✅ Claim 2: ISO 42001 follows Plan-Do-Check-Act structure like other ISO MS standards — **PASS** (database migrations confirm Clauses 4-10 structure alignment)

### nist-ai-rmf.md
- ⚠️ Claim 1: Subcategory distribution "GOVERN ~19, MAP ~18, MEASURE ~25, MANAGE ~15" — **FALSE-POSITIVE** (Actual counts: GOVERN=19, MAP=18, MEASURE=22, MANAGE=15. Article overstates MEASURE by ~3 items; approximations mask accuracy gap)
- ✅ Claim 2: Four core functions (GOVERN, MAP, MEASURE, MANAGE) with specific structure — **PASS** (nist-ai-rmf.structure.ts confirmed)

### post-market-monitoring.md
- ✅ Claim 1: Seven default questions (6 yes/no + 1 free-text) created on enable — **PASS** (DEFAULT_PMM_QUESTIONS has 7 questions: 6 yes_no + 1 multi_line_text)
- ✅ Claim 2: Risk Review maps to Article 9, Vendor Review to Article 72 — **PASS** (defaultQuestions.ts verified with eu_ai_act_article fields)

## Summary

Two reports contain false-positive verifications. **NIST AI RMF** uses approximate subcategory counts (~19, ~18, ~25, ~15) that hide an accuracy issue: MEASURE claims ~25 but actual count is 22, a 3-unit overstatement within the approximation margin but not clearly labeled as estimates. **FRIA** cites a risk score formula verification in technical documentation, but the formula does not appear in the actual docs/technical/domains/fria.md file—this is an unverifiable claim masquerading as verified. All other 14 claims passed spot-check verification against cited file:line references.
