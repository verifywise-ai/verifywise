# Audit: ai-governance/intake-form-fields
**Article path:** shared/user-guide-content/content/ai-governance/intake-form-fields.ts
**Audited:** 2026-10-29
**Auditor:** code review of PR #5183 (issue #5170)
**Verdict:** ✅ clean (3 findings fixed before merge)

## Summary
New article covering the 10 intake field types, their settings, submit checks and how answers show to reviewers. Review found three overstated claims; all were corrected in the article, and the two that pointed at product gaps were fixed in code (`fix/intake-guide-followups`).

## Findings (fixed)

### Finding 1 — Placeholder shown on every field type
- **Status:** ✅ fixed
- **Doc said:** Placeholder applies to every type except Calculated.
- **Reality:** The public form renders it only for short text, long text, email, URL and number (`PublicIntakeForm/FormFieldRenderer.tsx`); dropdowns always show "Select an option".
- **Fix:** Article states where it shows. The builder now offers the setting only for those types.

### Finding 2 — URL check described as "web address"
- **Status:** ✅ fixed
- **Reality:** The server only ran `new URL(value)`, which accepts `javascript:`, `mailto:` and other schemes.
- **Fix:** Server now requires http or https (`Servers/utils/validations/url.utils.ts`). Article updated.

### Finding 3 — Unanswered fields always show a dash
- **Status:** ✅ fixed
- **Reality:** An empty multi-select and whitespace-only text showed blank (`intakeAnswerFormat.ts` `formatAnswer`).
- **Fix:** `formatAnswer` now shows "—" for both.

## Verified claims (sampled)
- The 10 field types and their palette defaults — `IntakeFormBuilder/types.ts`, `FieldPalette.tsx`.
- Required, min/max and email checks on submit — `intakeForm.ctrl.ts` `validateFormData`.
- Option label vs stored value, and how reviewers see each type — `intakeAnswerFormat.ts`.

## Skipped / non-verifiable
- Rendering in the help drawer — checked against `ContentRenderer.tsx` only, not in a browser.
