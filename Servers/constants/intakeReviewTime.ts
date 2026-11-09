/**
 * An intake form's agreed review time in business days
 * (intake_forms.review_days). The migration's CHECK constraint and DEFAULT
 * use the same numbers.
 */
export const DEFAULT_REVIEW_DAYS = 3;
export const MIN_REVIEW_DAYS = 1;
export const MAX_REVIEW_DAYS = 30;
