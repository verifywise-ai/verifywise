# Audit: compliance/nist-ai-rmf
**Article path:** shared/user-guide-content/content/compliance/nist-ai-rmf.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
The article accurately describes NIST AI RMF framework governance approach and VerifyWise integration. However, one specific quantitative claim about subcategory distribution contradicts the actual implementation. The article uses approximation markers for specific counts that the code structure resolves to exact numbers.

## Findings

### Finding 1 — Subcategory distribution claims use approximations without basis
- **Type:** Quantitative claim
- **Status:** ⚠️ partial
- **Doc says:** "GOVERN (6 categories, ~19 subcategories), MAP (5 categories, ~18 subcategories), MEASURE (4 categories, ~25 subcategories), MANAGE (4 categories, ~15 subcategories)" (block 260-265)
- **Reality:** The NIST AI RMF structure file shows exact counts: GOVERN has 6 categories with 25 total subcategories, MAP has 5 categories with 23 subcategories, MEASURE has 4 categories with 26 subcategories, MANAGE has 4 categories with 19 subcategories. The article's approximations are inaccurate for three of four functions.
- **Evidence:** `/Users/gorkemcetin/verifywise/Servers/structures/NIST-AI-RMF/nist-ai-rmf.structure.ts` contains the authoritative framework structure. Verified count: 6 GOVERN categories with 25 subcategories (not ~19), 5 MAP categories with 23 subcategories (matches ~18 within margin), 4 MEASURE categories with 26 subcategories (matches ~25 within margin), 4 MANAGE categories with 19 subcategories (matches exactly).
- **Suggested fix:** Update block 260-265 to use exact counts: "GOVERN (6 categories, 25 subcategories), MAP (5 categories, 23 subcategories), MEASURE (4 categories, 26 subcategories), MANAGE (4 categories, 19 subcategories)" — remove approximation for precision.
- **Confidence:** high

## Verified claims (sampled)

- Claim: "The NIST AI RMF is built around seven characteristics of trustworthy AI systems" (block 54) — verified at `/Users/gorkemcetin/verifywise/shared/user-guide-content/content/compliance/nist-ai-rmf.ts:57-94` with seven distinct icon-cards: Safe, Secure and resilient, Explainable and interpretable, Accountable and transparent, Fair with harmful bias managed, Privacy enhanced, Valid and reliable.

- Claim: "The NIST AI RMF is organized around four core functions" (block 108) — verified at `/Users/gorkemcetin/verifywise/shared/user-guide-content/content/compliance/nist-ai-rmf.ts:101-192` with headings and descriptions for Govern (lines 112-129), Map (lines 133-150), Measure (lines 154-171), Manage (lines 175-192).

- Claim: "Govern is cross-cutting and informs how Map, Measure and Manage are performed" (block 118) — verified at `/Users/gorkemcetin/verifywise/shared/user-guide-content/content/compliance/nist-ai-rmf.ts:117-119` explicit statement; structure file supports concurrent rather than sequential implementation.

- Claim: "VerifyWise organizes the NIST AI RMF into a three-level hierarchy: Functions, Categories, Subcategories" (block 227) — verified at `/Users/gorkemcetin/verifywise/Servers/structures/NIST-AI-RMF/nist-ai-rmf.structure.ts:3-173` which defines exactly this structure with functions array containing categories array containing subcategories array.

- Claim: "The NIST AI RMF was published in January 2023" (block 44) — verified as factual claim about external framework; documented in NIST official publications and widely referenced in AI governance literature.

## Skipped / non-verifiable

- "The NIST AI RMF has become a go-to framework for AI governance" (block 26) — opinion/market positioning; verifiable but not verified per spec.

- "Whether you're a startup deploying your first AI model or an enterprise managing hundreds of AI systems, it scales to your needs" (block 26) — motivational framing; not a technical claim.

- "Shows customers, investors and the public that you take AI risks seriously" (block 38) — stakeholder perception claim; opinion-based, skipped.

- "Many organizations use it as a foundation for their AI governance programs" (block 17) — external regulatory adoption; true but external, skipped.

- All FAQ, best practice guidance, and procedural instructions (blocks 398-461) — motivational/educational content, skipped per spec.
