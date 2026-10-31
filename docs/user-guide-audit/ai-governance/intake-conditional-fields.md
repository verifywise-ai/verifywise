# Audit: ai-governance/intake-conditional-fields
**Article path:** shared/user-guide-content/content/ai-governance/intake-conditional-fields.ts
**Audited:** 2026-10-29
**Auditor:** code review of PR #5183 (issue #5170)
**Verdict:** ✅ clean

## Summary
New article on show/hide conditions per field type, all/any matching, hidden answers and publish checks. Review found no mismatches.

## Verified claims (sampled)
- Conditions per field type and matching rules (case and outer spaces ignored; unanswered is false except "is empty" / "is not checked") — `intakeFormLogic/conditions.ts`, `evaluate.ts`.
- Up to 20 conditions, all/any — `intakeFormLogic/types.ts`, `VisibilityEditor.tsx`.
- Hidden answers not sent and dropped by the server — `PublicIntakeForm/index.tsx`, `intakeForm.ctrl.ts`.
- Fields mapped to use case name, goal or model name can't have conditions — `intakeFormSchema.validation.ts`.

## Skipped / non-verifiable
- "Conditions work best on questions above the field" is advice, not a code fact.
