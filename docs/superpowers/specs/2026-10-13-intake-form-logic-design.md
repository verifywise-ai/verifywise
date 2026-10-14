# Intake forms: calculated fields, show/hide rules and risk dimension tags

> **Date:** 2026-10-13
> **Status:** Design approved section by section; two detailed review passes folded in; awaiting written-spec approval
> **Scope:** Intake form builder, public intake form, intake submission API, intake risk scoring

## Problem

Intake forms have no logic. Every field is always shown, nothing can be computed from answers, and the automatic risk score is noisy:

- Field types are `text`, `textarea`, `select`, `multiselect`, `checkbox`, `date`, `email`, `url` and `number` (`Clients/src/presentation/pages/IntakeFormBuilder/types.ts:7`). A `number` field only stores a value.
- There is no show/hide logic for custom fields. Only the built-in EU AI Act questionnaire has it (`Servers/services/euAiActClassification/visibility.ts`).
- The risk scorer (`Servers/services/intakeRiskScoring.service.ts`) matches keywords with `String.includes`, so "name" hits "renamed" and "tool" hits "toolkit". Every dimension scans every answer.
- The scorer's `fieldMappings` (`data_type`, `autonomy_level`, `domain`, …) are compared to a field's `entityFieldMapping`. The mappable entity fields (`name`, `description`, `goal`, `geography`, …, `types.ts:173`) never match those names, so field mapping has never affected the score.

## Goals

1. **Calculated fields** that show the submitter a live result computed from number fields, and store it with the submission.
2. **Show/hide rules** on any field, built from one or more conditions on earlier fields, combined with all or any.
3. **Risk dimension tags**: a form author can say which answers feed which risk dimension, and keyword matching works from the start of a word.

Calculations are used by few form authors, so they stay out of the way: the calculated field type and the logic settings sit in collapsed sections.

## Non-goals

- Functions (`round`, `min`, `max`, …), conditionals or select-option values inside formulas. Formulas are arithmetic only.
- Show/hide for groups or sections of fields.
- Conditions that refer to later fields.
- Conditions on the EU AI Act risk step's answers or result; the step keeps its own logic.
- Calculated values feeding entity mapping, the risk tier or the EU AI Act step.
- Configurable keyword lists or dimension weights (`riskAssessmentConfig` stays unused).
- Re-scoring submissions made before this ships.

## Decisions

| Decision | Choice |
|---|---|
| Where calculated values are seen | Live to the submitter, stored with the submission, shown to reviewers |
| Formula language | `+ − * /`, parentheses, unary minus, numeric constants, references to number and calculated fields above it |
| Show/hide rule shape | Several conditions per field, `match: "all" \| "any"` |
| Risk dimension input | Optional `riskDimension` tag per field |
| Where the logic lives | One pure module mirrored in `Servers` and `Clients`, kept identical by a shared test-case file; the server is authoritative |
| Builder placement | Calculated field type in a collapsed "Advanced" palette section; show/hide and risk scoring in collapsed editor sections |

## 1. Schema

All new properties are optional. Existing forms are valid unchanged and need no migration; the schema is stored as JSONB in `intake_forms.schema`. Both `IIntakeFormField` (`Servers/domain.layer/interfaces/i.intakeForm.ts`) and `FormField` (`Clients/.../IntakeFormBuilder/types.ts`) gain the same properties.

### 1.1 Calculated field

New field type `"calculated"` with:

- `formula: string`, for example `{monthly_cost} * 12` or `({users} + {contractors}) / {sites}`. `{…}` holds a field id. The builder shows labels; the schema stores ids.
- `decimals?: number`, integer 0–6, default 2. Used to round the stored value and to format the displayed one.
- `prefix?: string` and `suffix?: string`, each at most 10 characters, display only (`€ 14,400.00`, `1,200 people`). The stored value is the plain number.

A formula may reference `number` and `calculated` fields that come earlier in the form, never itself or a later field. A total therefore always sits below its inputs, and evaluation is one top-to-bottom pass. (Allowing later fields would let a formula and a show/hide rule depend on each other in a loop the save check could not see.) A calculated field has no `validation`, `placeholder`, `options`, `entityFieldMapping` or `riskDimension`, and is never required.

### 1.2 Visibility

New property on any field type:

```ts
visibility?: {
  match: "all" | "any";
  conditions: Array<{ fieldId: string; operator: Operator; value?: string | number | string[] }>;
};
```

`fieldId` must point to a field earlier in the form (lower `order`). With no `visibility` (or an empty `conditions` list) the field is always shown, as today.

Operators by the referenced field's type:

| Referenced field | Operators | `value` |
|---|---|---|
| `select` | `equals`, `not_equals`, `one_of` | option value; `one_of` takes an array |
| `multiselect` | `equals` (contains this option), `not_equals` (does not contain it), `one_of` (contains any of these) | option value or array |
| `checkbox` | `is_checked`, `is_not_checked` | none (the answer is a boolean; unchecked and unanswered both count as not checked) |
| `text`, `textarea`, `email`, `url` | `equals`, `contains` | non-empty string; both case-insensitive, trimmed |
| `number`, `calculated` | `eq`, `neq`, `gt`, `gte`, `lt`, `lte` | finite number |
| `date` | none in this release beyond the empty checks | |
| any type except `checkbox` | `is_empty`, `is_not_empty` | none |

When the referenced answer is empty, every operator except `is_empty` (and `is_not_checked` for a checkbox) is false, including `not_equals` and `neq`. A dependent field therefore stays hidden until the earlier question is answered (same as the EU AI Act step).

A hidden field's answer counts as empty when later conditions read it. So if B is hidden, a C that depends on B being non-empty is hidden too (same rule as the EU AI Act step's `visibleQuestions`).

### 1.3 Risk dimension tag

New property `riskDimension?: string` (any number of fields may share one dimension) on `text`, `textarea`, `select`, `multiselect` and `checkbox` fields. Allowed values are the six dimension keys in `intakeRiskScoring.service.ts`: `data_sensitivity`, `autonomy_level`, `impact_scope`, `transparency`, `human_oversight`, `domain_criticality`.

### 1.4 Save-time checks

`Servers/utils/intakeFormSchema.validation.ts` (which today checks labels) also runs `validateSchemaLogic` (§2) on create and update when the form will be active after the save (a draft may hold unfinished logic, such as a new calculated field's empty formula; publishing it runs the check). An update that changes none of the schema, entity type or status skips it, so an unrelated edit is never blocked by a stored problem. A form is rejected with 400 when:

- a condition or formula references a field id that does not exist;
- a condition references a field at the same or a later position;
- a condition's option value is no longer one of the referenced select or multiselect field's options;
- a field has more than 20 conditions;
- a field mapped to an entity field that the entity requires (`REQUIRED_ENTITY_FIELDS`, §2.1; e.g. the use case title) has conditions — hiding it would approve into an entity with that value empty;
- an operator is not allowed for the referenced field's type, or `value` has the wrong shape;
- a formula fails to parse, references a field that is not `number` or `calculated`, or references a field at the same or a later position;
- `decimals` is outside 0–6;
- `riskDimension` is not one of the six keys, or is set on a field type that cannot take it.
- two fields share an id (the later one is reported).
- a calculated field's `prefix` or `suffix` is not text.
- a select or multiselect field that a show/hide condition uses has an option with a blank value, or two options sharing a value (rules match options by value). Fields no rule uses are not checked, so older forms with duplicate values from the previous option editor stay saveable.

A `null` optional property (`riskDimension`, `visibility`, `decimals`, `prefix`, `suffix`) means not set, as at runtime. The public form endpoints return the schema without `riskDimension`.

Each error names the field label, like the existing label errors, and carries the field id so the builder can show it on that field. The builder runs the client copy of `validateSchemaLogic` as the author edits, so errors appear before saving; the server check is the backstop for API callers.

## 2. Logic module

The same pure module exists twice:

- `Servers/services/intakeFormLogic/`
- `Clients/src/application/utils/intakeFormLogic/`

It has no I/O and no framework imports. This follows the existing EU AI Act step, which keeps `visibility.ts` on the server and `euAiActQuestionnaire.ts` on the client. A single module under `shared/` was rejected: the server has never imported from `shared/`, and changing its `rootDir` moves the `dist/` layout that migrations `require()`. Server-only evaluation behind a preview endpoint was rejected because the public form would call a rate-limited, CAPTCHA-protected endpoint on every keystroke.

### 2.1 Functions

| Function | Behaviour |
|---|---|
| `parseFormula(src)` | Tokenizes and parses to an AST. Accepts number literals (digits with an optional single dot decimal: `12`, `0.5`, `.5`; no commas, exponents or thousands separators), `{fieldId}` (id characters `A-Z a-z 0-9 _ -`; builder ids look like `field_1697040000000_ab12cd3`), `+ - * /`, parentheses, unary minus, whitespace. No `eval`, no `Function`. Rejects input over 500 characters or nested deeper than 20. Returns `{ ok: true, ast, refs }` or `{ ok: false, error, position }`. |
| `evaluateFormula(ast, values, decimals)` | Returns a number rounded half away from zero to `decimals` (`-0` becomes `0`), or `null` when a referenced value is missing or null, on division by zero, or when the result is not finite. |
| `evaluateForm(schema, answers)` | Returns `{ visibleIds, calculated, effectiveAnswers }`. See §2.2. |
| `validateSchemaLogic(schema, entityType)` | Returns a list of errors for the checks in §1.4. |
| `REQUIRED_ENTITY_FIELDS` | Per entity type, the entity fields that must not be hidden (today: the fields with `entityRequired` in the client's `ENTITY_FIELD_MAPPINGS`). The server has no such list today; this constant gives it one. A client test asserts the client copy equals the `entityRequired` fields of `ENTITY_FIELD_MAPPINGS`, so the two cannot drift. |

### 2.2 Evaluation order

1. Sort fields by `order` (ties keep array order). "Earlier" everywhere in this spec means earlier in this sorted list.
2. Walk fields in that order once. A field is visible when it has no conditions, or when all (or any) conditions hold against `effectiveAnswers` built so far. Conditions only read earlier fields, so one pass settles visibility.
3. A visible input field adds its answer to `effectiveAnswers`. A hidden field adds nothing.
4. A visible calculated field's value is computed from `effectiveAnswers` and the calculated values already produced above it, then added to `effectiveAnswers` so later conditions and formulas can read it. A hidden calculated field is `null`.

Number answers arrive as numbers or numeric strings (the public form's number input yields strings such as `"12"`; the server already accepts both via `Number(value)`). A trimmed string that `Number()` turns into a finite number is used as that number; `""`, whitespace and non-numeric strings count as missing.

Evaluation never throws on bad answer data: a value of the wrong type makes its condition false and its formula input missing. If a stored formula fails to parse at submit time (should be impossible after §1.4), the server logs it and the field's value is `null`. Malformed show/hide rules are treated as absent (field shown).

### 2.3 Parity

`Servers/services/intakeFormLogic/__fixtures__/intakeFormLogic.cases.json` holds input/expected-output cases: parse successes and errors with positions, every operator per field type, chained hiding, any vs all, null formula results, rounding, `-0`, number literals, rejection of forward references in conditions and formulas, and the required-entity-field rule.

- There is one file. Jest (`Servers`) runs it against the server module; the Vitest test reads the same file from `Servers/services/intakeFormLogic/__fixtures__/` with `fs`, resolving the path from the repo root (precedent: `Clients/src/i18n/__tests__/euAiActQuestionnaire.translations.test.ts` already reads `Servers/services/euAiActClassification` this way) and runs it against the client module. No copy and no compare script: backend CI only triggers on `Servers/**`, so a copied file edited under `Clients` alone would escape a backend-side check.

## 3. Server: submit and resubmit

In `Servers/controllers/intakeForm.ctrl.ts`, before `validateFormData` at both the submit (`~1858`) and resubmit (`~2208`) call sites:

1. Run `evaluateForm(schema, formData)`.
2. Remove answers to hidden fields. Remove any value the client sent for a calculated field.
3. Set each visible calculated field to the server's value. A visible calculated field without a result is stored as `null`; a hidden one is left out. This lets reviewers tell "—" (no result) from "not shown" and from submissions made before the field existed.
4. `validateFormData` validates visible fields only, so a hidden required field never blocks a submit. Calculated fields are skipped by it.
5. Store, score and notify with the cleaned data.

Risk scoring, `buildEntityDataFromSubmission`, the review dialog and the EU AI Act step all see only cleaned data.

## 4. Builder UI

Uses house components (`Select`, `Field`, `CustomizableButton`, the existing chevron + `Collapse` pattern in `FieldPalette.tsx`). Sentence case, theme values, 30px controls. Every new string gets de/fr/es entries so `i18n:audit:strict` passes.

### 4.1 Palette

"Calculated" is not in the main field-type list. It sits in a new **Advanced** section at the bottom of the palette, collapsed by default. Adding it creates a calculated field on the canvas like any other field.

### 4.2 Field editor

Two collapsed sections below the existing settings:

- **Show this field only if…** (all field types). Collapsed header reads "Always shown", "Shown when all conditions match" or "Shown when any condition matches" (fixed strings, so they can be translated). Expanded: a "Match all / any" select and condition rows of *field* → *operator* → *value*. The field picker lists only earlier fields. The operator list follows the chosen field's type, worded for authors: select "is", "is not", "is one of"; multiselect "includes", "does not include", "includes any of"; checkbox "is checked", "is not checked"; text "is", "contains"; number and calculated = ≠ > ≥ < ≤; every type except checkbox "is empty", "is not empty"; the value input follows it too (option select, number input or text input). "Add condition" and a remove button per row.
- **Risk scoring** (text, textarea, select, multiselect, checkbox). One select: "Risk dimension" with "None" and the six dimension labels.

A field card with rules shows a small "Conditional" chip on the canvas. A calculated field's card shows a "Calculated" chip and its readable formula ("= Monthly cost × 12").

When a field has rules, the "Required field" checkbox reads "Required when shown", since a hidden field never blocks a submit.

Duplicating a field copies its rules, formula and risk dimension; the copy is placed after the original, so its conditions still point to earlier fields.

### 4.3 Calculated field editor

Shows label, help text, formula, decimals, prefix and suffix. Required, placeholder, validation and entity mapping are hidden. In the formula input, typing `{` opens a picker of number and calculated fields that inserts `{field_id}`; the input stays plain text, and a line below it reads the formula with labels ("= Monthly cost × 12"). Parse errors show under the input ("Unexpected ')' at position 14"). A preview line shows the result with every referenced input set to 1.

### 4.4 Broken references

If a referenced field is deleted or changes type, or a move puts a field above a field its rule depends on, the change is allowed and saving is blocked by §1.4 until it is fixed ("Depends on Data type, which is now below it"). The affected field shows the error in its editor ("Field 'Monthly cost' was removed: update this formula") and its canvas card gets an error outline.

## 5. Public form

In `Clients/src/presentation/pages/PublicIntakeForm/` (`index.tsx`, `FormFieldRenderer`):

- Each answer change runs `evaluateForm`. The builder's Preview button opens this same public page, so authors test logic there with no extra work. Hidden fields are not rendered and their validation errors are skipped.
- Answers to fields that become hidden stay in local state, so toggling a condition back restores them; they are left out of the submitted payload.
- Calculated fields render read-only with label, help text and the value, formatted with `Intl.NumberFormat(navigator.language)` with fixed `decimals`, plus prefix and suffix. The value region is `aria-live="polite"`. The formula itself is not shown. A `null` value shows "—"; when an input is missing, a hint names the first missing visible input ("Fill in Monthly cost to calculate"). If every missing input is hidden, or the cause is division by zero, only "—" shows.
- Showing and hiding uses a short (~150 ms) height and opacity transition.
- Resubmission pre-fills from stored data and runs the same evaluation.

## 6. Review screens

The review dialog (`SubmissionPreviewModal`) today shows only answers mapped to entity fields. It gains a collapsed "Other answers (N)" section listing the unmapped answers, including calculated values, so reviewers see everything before approving. Both it and the use case's `IntakeSubmissionCard` show the stored cleaned data: hidden fields do not appear; calculated values appear as read-only rows with the field label, formatted as in §5 (browser locale here too). A calculated field that was visible but had no result shows "—"; one the submission never stored (hidden, or added to the form later) shows nothing. The by-entity submission endpoint adds an `answered` flag and the calculated display settings to each field for this. Editing entity data before approval (`confirmedEntityData`) is unchanged; calculated fields cannot be mapped to entities.

## 7. Risk scoring

Changes in `Servers/services/intakeRiskScoring.service.ts`:

- Input is the cleaned submission, so hidden answers never count.
- Answers are turned into text before matching: `select` and `multiselect` values are replaced by their option labels (stored values default to `option1`, `option2`, … so today's scoring of selects mostly sees meaningless values); a checked `checkbox` contributes its field label ("Uses biometric data"), an unchecked one contributes nothing; other text types contribute their answer.
- Per dimension: tagged answers decide when they match any of the dimension's keywords; when nothing is tagged, every tagged field is hidden or unanswered, or the tagged answers match no keyword, all visible `text`, `textarea`, `email`, `url`, `select`, `multiselect` and `checkbox` answers are scored. `number`, `date` and `calculated` values are never scored. High-risk keywords in the untagged answers set a floor: the dimension never scores below what those keywords alone would give. The tagged answers' own keywords are not part of the floor, so tagging a field never changes that field's own score (an untagged "aggregated, anonymous health statistics" and the same answer tagged both score 40). (Changed after review: a tag must never hide risk found in other answers.)
- Keywords match at the start of a word, case-insensitive, with regex special characters escaped: "biometric" matches "biometrics", "health" matches "healthcare", "no human" matches as a phrase, and "name" does not match "renamed". (Changed after review from whole words, which missed plurals and compounds.) A keyword inside a word does not match, so the common health compounds ("telehealth", "telemedicine", "biomedical") are listed as high-risk keywords in their own right.
- The `fieldMappings` / `entityFieldMapping` substring check is removed.
- Signals name the field: `High-risk signal: "biometric" (Data collected)`.
- The score formula, weights, tier thresholds and LLM adjustment are unchanged. The LLM adjustment prompt lists visible answers including calculated values, since it already lists every answered field by label.

Submissions created before this ships keep their stored scores.

## 8. Error handling

- Invalid logic on saving an active form or publishing: 400 with per-field messages; the builder maps them onto fields. A draft saves with its errors still highlighted and a "Draft saved. Fix the highlighted fields before publishing" warning.
- Submit-time evaluation never throws on answer data (§2.2).
- Formula size and depth limits (§2.1) bound work on the public endpoint.
- A client that sends answers for hidden fields or values for calculated fields has them dropped, not rejected.

## 9. Testing

- **Parity cases** (§2.3): one file, run by Jest and Vitest.
- **Server:** schema save rejects forward references in conditions and formulas, rules on required-entity-mapped fields, stale option values, wrong operators, bad `riskDimension`; submit and resubmit drop hidden answers and client calculated values and store server values; hidden required fields don't block; scoring uses tagged fields when present, falls back otherwise, excludes number/date/calculated values, matches whole words and phrases, and names fields in signals.
- **Client:** public form hides and shows fields, keeps hidden answers in state but omits them on submit, renders calculated values live and "—" when incomplete; builder adds a condition and a calculated field, shows formula errors, keeps the Advanced section collapsed by default.
- **Gates:** `cd Servers && npm run build && npm run format-check && npm run test && npm run check:api-drift`; `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npx vitest run`.

## 10. Documentation

- User guide `shared/user-guide-content/content/ai-governance/intake-forms.ts`: conditional fields, calculated fields and risk dimension tags; fix "a score from 1 to 10" (line ~471) to 0–100. Mirror to `~/website/verifywise/content/user-guide/`.
- `docs/technical/domains/use-cases.md`: short section on intake form logic, the mirrored module and the fixture check.
