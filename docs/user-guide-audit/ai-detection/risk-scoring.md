# Audit: ai-detection/risk-scoring
**Article path:** shared/user-guide-content/content/ai-detection/risk-scoring.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
Article claims are verified against implementation code. All quantitative thresholds (80+, 60-79, below 60 for risk labels; 70 threshold for "dimensions at risk"; A-F grades), dimension count (5), penalty starting point (100), dimension weights (0.25, 0.20, 0.20, 0.15, 0.20), and behavioral descriptions match the actual UI component and types definitions. Article is factually accurate.

## Findings
None identified.

## Verified claims (sampled)
- Claim: "Score from 0 to 100 with a risk label: Low risk (80+), Moderate risk (60 to 79), or High risk (below 60)" (block 5) — verified at `Clients/src/presentation/pages/AIDetection/components/RiskScoreCard.tsx:93-95` (UI ternary: `score >= 80 ? "Low risk" : score >= 60 ? "Moderate risk" : "High risk"`)
- Claim: "Letter grade from A (Excellent) to F (Critical)" (block 5) — verified at `Clients/src/domain/ai-detection/riskScoringTypes.ts:122-129` (getGradeLabel: A→"Excellent", F→"Critical")
- Claim: "Count of dimensions scoring below the 70-point threshold" (block 5) — verified at `Clients/src/presentation/pages/AIDetection/components/RiskScoreCard.tsx:100` (dimensionsAtRisk computed as DIMENSION_ORDER.filter(k => (details.dimensions[k]?.score ?? 100) < 70).length)
- Claim: "The score is made up of 5 weighted dimensions" (block 7) — verified at `Clients/src/domain/ai-detection/riskScoringTypes.ts:108-112` (DIMENSION_ORDER has exactly 5 entries: data_sovereignty, transparency, security, autonomy, supply_chain)
- Claim: "Each starts at 100 and gets penalties" (block 7) — verified at `Clients/src/presentation/pages/AIDetection/components/RiskScoreCard.tsx:100` (score initialization: ?? 100)
- Claim: dimension weights at 0.25, 0.20, 0.20, 0.15, 0.20 — verified at `Clients/src/domain/ai-detection/riskScoringTypes.ts:115-120` (exact weights match DEFAULT_DIMENSION_WEIGHTS)

## Skipped / non-verifiable
- "Turn on LLM-enhanced analysis for written summaries" (block 2) — reason: UI feature description; requires live app interaction or code path trace to detailed LLM integration (not quantitative; documented in UI props `llm_enhanced`)
- "Inventory items only penalize when they're medium or high risk; low-risk ones are informational" (block 7) — reason: behavioral rule; no penalty calculation code found in types layer; would require finding the scoring engine that implements this filtering (suspected in backend or utility)
- Specific penalty weights per severity (Critical, High, Medium, Low) — reason: claimed as "determines penalty weight" but actual enum or penalty map not located in presented evidence; block 8 Security dimension
