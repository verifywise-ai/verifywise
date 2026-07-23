/**
 * Utilities for accessible form validation UX: blur validation helpers
 * and focusing the first invalid field after a failed submit.
 */

const FOCUSABLE_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([aria-disabled="true"])';

/**
 * Moves keyboard focus to a form control by its root element id.
 * Falls back to the first focusable child when the id is on a wrapper.
 */
export function focusFormFieldById(fieldId: string): void {
  requestAnimationFrame(() => {
    const root = document.getElementById(fieldId);
    if (!root) return;

    const focusable =
      root instanceof HTMLInputElement ||
      root instanceof HTMLSelectElement ||
      root instanceof HTMLTextAreaElement ||
      root instanceof HTMLButtonElement
        ? root
        : root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);

    if (!focusable) return;

    focusable.focus({ preventScroll: false });
    focusable.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

/**
 * Finds the first field key that currently has an error message.
 */
export function getFirstInvalidField<T extends PropertyKey>(
  errors: Partial<Record<T, string>>,
  fieldOrder: T[],
): T | undefined {
  return fieldOrder.find((field) => Boolean(errors[field]));
}

/**
 * Focuses the first invalid field using a stable visual field order and id map.
 */
export function focusFirstInvalidField<T extends PropertyKey>(
  errors: Partial<Record<T, string>>,
  fieldOrder: T[],
  fieldIdMap: Partial<Record<T, string>>,
): void {
  const firstInvalid = getFirstInvalidField(errors, fieldOrder);
  if (!firstInvalid) return;

  const fieldId = fieldIdMap[firstInvalid];
  if (fieldId) {
    focusFormFieldById(fieldId);
  }
}

/**
 * Creates a blur handler that validates a single field with the latest form values.
 */
export function createFieldBlurHandler<T extends object>(
  field: keyof T,
  getValues: () => T,
  validateField: (field: keyof T, value: unknown, values: T) => string,
): () => void {
  return () => {
    const currentValues = getValues();
    validateField(field, currentValues[field], currentValues);
  };
}
