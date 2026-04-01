import { useState, useCallback, useMemo, useRef, useEffect } from "react";

/**
 * A validator function for a single field.
 * Receives the field value and the full form values (for cross-field checks).
 * Returns an error string, or "" if valid.
 */
export type FieldValidator<TValues> = (
  value: unknown,
  values: TValues
) => string;

/**
 * Map of field keys to their validator functions.
 * Each entry is optional — fields without a validator are always valid.
 */
export type FieldValidators<TValues extends object> = {
  [K in keyof TValues]?: FieldValidator<TValues>;
};

/**
 * Return type of useFormValidation.
 * Export this to type props or context that forward hook results.
 */
export interface UseFormValidationReturn<TValues extends object> {
  /** Per-field error messages. Empty string means no error for that field. */
  errors: Partial<Record<keyof TValues, string>>;
  /**
   * Validates a single field and updates errors state.
   * Pass the full current form values so cross-field validators can compare fields.
   * Returns the error string (empty string if valid).
   */
  validateField: (
    field: keyof TValues,
    value: unknown,
    values: TValues
  ) => string;
  /**
   * Clears the error for a single field.
   * Call this when the user starts editing a field.
   */
  clearFieldError: (field: keyof TValues) => void;
  /**
   * Runs all validators against the provided values, updates errors state,
   * and returns true if the form is valid (no errors).
   * Use the return value to gate form submission.
   */
  validateAll: (values: TValues) => boolean;
  /** True if any field currently has an error. */
  hasErrors: boolean;
  /** True when there are no current errors — use to enable the submit button. */
  canSubmit: boolean;
  /** Resets all field errors to empty. Call when the form is closed or reset. */
  resetErrors: () => void;
}

/**
 * Generic form validation hook.
 *
 * Usage:
 *   const { errors, validateAll, validateField, clearFieldError, hasErrors } =
 *     useFormValidation({
 *       name: (v) => checkStringValidation("Name", v as string, 2, 50).message || "",
 *       type: (v) => selectValidation("Type", v as number).accepted ? "" : selectValidation("Type", v as number).message,
 *       confirmPassword: (v, all) => v !== all.password ? "Passwords must match." : "",
 *     });
 */
export function useFormValidation<TValues extends object>(
  validators: FieldValidators<TValues>
): UseFormValidationReturn<TValues> {
  const [errors, setErrors] = useState<Partial<Record<keyof TValues, string>>>(
    {}
  );

  // Keep a stable ref to the latest validators so callbacks never need to be
  // recreated when the caller passes an inline object literal (new ref each render).
  const validatorsRef = useRef(validators);
  useEffect(() => {
    validatorsRef.current = validators;
  }, [validators]);

  const validateField = useCallback(
    (field: keyof TValues, value: unknown, values: TValues): string => {
      const validator = validatorsRef.current[field];
      const error = validator ? validator(value, values) : "";
      setErrors((prev) => ({ ...prev, [field]: error }));
      return error;
    },
    []
  );

  const clearFieldError = useCallback((field: keyof TValues) => {
    setErrors((prev) => ({ ...prev, [field]: "" }));
  }, []);

  const validateAll = useCallback((values: TValues): boolean => {
    const newErrors: Partial<Record<keyof TValues, string>> = {};
    let valid = true;
    for (const field of Object.keys(validatorsRef.current) as (keyof TValues)[]) {
      const validator = validatorsRef.current[field];
      const error = validator ? validator(values[field], values) : "";
      newErrors[field] = error;
      if (error) valid = false;
    }
    setErrors(newErrors);
    return valid;
  }, []);

  const hasErrors = useMemo(
    () => Object.values(errors).some(Boolean),
    [errors]
  );

  const canSubmit = useMemo(() => !hasErrors, [hasErrors]);

  const resetErrors = useCallback(() => setErrors({}), []);

  return { errors, validateField, clearFieldError, validateAll, hasErrors, canSubmit, resetErrors };
}