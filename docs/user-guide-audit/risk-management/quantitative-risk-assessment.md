# Audit: risk-management/quantitative-risk-assessment
**Article path:** shared/user-guide-content/content/risk-management/quantitative-risk-assessment.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
All verifiable claims in the quantitative risk assessment article are accurate. FAIR formula implementations match the documented equations exactly: PERT (min + 4×likely + max)/6, ALE = frequency PERT × total loss, residual ALE uses 100% minus control effectiveness. Four loss categories (regulatory, operational, litigation, reputational) are confirmed in code. UI claims about admin-only toggle and Quantitative tab are verified in Settings and form components.

## Findings
No significant issues found.

## Verified claims (sampled)

- **PERT formula:** "Takes your min, most likely, and max values and produces a weighted average: (min + 4 x likely + max) / 6." (block 11) — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/tools/fairCalculator.ts:6-14`. Tests confirm implementation in `fairCalculator.test.ts:18-28`.

- **ALE calculation:** "Multiply the PERT of your event frequency by the total PERT loss across all four categories." (block 11) — verified at `fairCalculator.ts:42-51`. Test `fairCalculator.test.ts:55-66` confirms `frequency PERT * totalLoss`.

- **Residual ALE formula:** "If you rate your controls at 70% effective, residual ALE drops to 30% of the original." (block 11) — verified at `fairCalculator.ts:53-60` with formula `ale * (1 - controlEffectiveness / 100)`. Test case at `fairCalculator.test.ts:72-73`: `computeResidualALE(100, 70)` returns 30.

- **Four loss categories:** "loss estimates across four categories" (block 2), enumerated as regulatory, operational, litigation, reputational in QuantitativeRiskForm (block 11) — verified in `/Users/gorkemcetin/verifywise/Clients/src/domain/interfaces/i.quantitativeRisk.ts` which defines exactly 4 loss category groups: `loss_regulatory_*`, `loss_operational_*`, `loss_litigation_*`, `loss_reputational_*` (12 fields total × 3 min/likely/max = 36 references). Form component renders all 4 rows at `QuantitativeRiskForm/index.tsx`.

- **Admin-only toggle permission:** "Only admins can change this setting. Other roles can see the toggle but can't switch it." (block 8, warning callout) — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/SettingsPage/Features/index.tsx` which checks `!isAdmin` and displays "Only admins can change this setting" message, disabling the toggle for non-admin roles.

- **ROI formula:** "The formula is ((ALE minus Residual ALE) minus mitigation cost) / mitigation cost x 100." (block 11) — verified at `fairCalculator.ts:62-69` with exact implementation. Test at `fairCalculator.test.ts:81` confirms `((10000 - 4000) - 2000) / 2000 * 100 = 200`.

- **Example claim:** "A frequency of min 0.1, most likely 0.3, max 0.8 means you expect the event roughly once every three years on average, with a range from once in ten years to about once every fifteen months." (block 19) — mathematically verified: PERT = (0.1 + 4×0.3 + 0.8)/6 ≈ 0.317 (≈ once in 3.2 years, ≈ once every 3 years ✓); min 0.1 = once in 10 years ✓; max 0.8 ≈ once in 1.25 years (between once per year and once per 18 months, roughly once per 15 months ✓).

## Skipped / non-verifiable
- "Qualitative labels like 'high' or 'low' tell you something about a risk, but they don't tell you what it could actually cost." (block 1) — opinion/motivation only; non-verifiable.
- "You get both views on every risk." (block 4) — motivational framing; not a verifiable claim about implementation.
- "Benchmarks give you a calibrated starting point, not a finished assessment." (block 17) — advice/guidance, not verifiable.
