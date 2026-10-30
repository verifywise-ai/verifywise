# Audit: ai-governance/intake-calculated-values
**Article path:** shared/user-guide-content/content/ai-governance/intake-calculated-values.ts
**Audited:** 2026-10-29
**Auditor:** code review of PR #5183 (issue #5170)
**Verdict:** ✅ clean (1 finding fixed before merge)

## Summary
New article on formula syntax, limits, decimals, rounding, prefix/suffix, the "—" result and server-side recalculation.

## Findings (fixed)

### Finding 1 — 500-character limit read as visible length
- **Status:** ✅ fixed
- **Reality:** `parseFormula` checks the stored formula, where each field chip is a ~30-character `{field_<timestamp>_<rand>}` token, so about 15 fields hit the limit.
- **Fix:** Article explains the limit counts the stored formula and gives the practical field count.

## Verified claims (sampled)
- Operators, precedence, parentheses, leading minus, no functions; 20 nesting levels — `intakeFormLogic/formula.ts`.
- Decimals 0–6 (default 2), rounding half away from zero, prefix/suffix up to 10 characters — `intakeFormLogic`, `FieldEditor.tsx`.
- Recalculated on submit and checked at publish — `intakeFormSchema.validation.ts`, `intakeForm.ctrl.ts`.

## Skipped / non-verifiable
- Worked examples were checked by hand, not by running the evaluator.
