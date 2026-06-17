/**
 * Pure validation / mapping helpers for intake forms.
 *
 * - `validateFormData` enforces type / required / min-max / option constraints
 *   against the form schema at submission time.
 * - `mapToAiRiskClassification` translates form values into the
 *   AiRiskClassification enum.
 * - `buildEntityDataFromSubmission` projects raw submission fields into entity
 *   columns using each field's `entityFieldMapping` from the schema.
 */

import { AiRiskClassification } from "../../domain.layer/enums/ai-risk-classification.enum";
import { IIntakeFormSchema } from "../../domain.layer/interfaces/i.intakeForm";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: unknown): boolean {
  return typeof value === "string" && EMAIL_REGEX.test(value);
}

export function mapToAiRiskClassification(value: string): AiRiskClassification | string {
  const map: Record<string, AiRiskClassification> = {
    minimal: AiRiskClassification.MINIMAL_RISK,
    limited: AiRiskClassification.LIMITED_RISK,
    high: AiRiskClassification.HIGH_RISK,
    unacceptable: AiRiskClassification.PROHIBITED,
    "minimal risk": AiRiskClassification.MINIMAL_RISK,
    "limited risk": AiRiskClassification.LIMITED_RISK,
    "high risk": AiRiskClassification.HIGH_RISK,
    prohibited: AiRiskClassification.PROHIBITED,
  };
  return map[value?.toLowerCase()?.trim()] || value || "";
}

export function buildEntityDataFromSubmission(
  submissionData: Record<string, unknown>,
  formSchema: IIntakeFormSchema,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of formSchema.fields) {
    if (field.entityFieldMapping && submissionData[field.id] !== undefined) {
      result[field.entityFieldMapping] = submissionData[field.id];
    }
  }
  return result;
}

export function validateFormData(
  formData: Record<string, unknown>,
  schema: IIntakeFormSchema,
): string[] {
  const errors: string[] = [];

  for (const field of schema.fields) {
    const value = formData[field.id];
    const isEmpty = value === undefined || value === null || value === "";

    const isRequired = field.required || field.validation?.required;
    if (isRequired && isEmpty) {
      errors.push(`"${field.label}" is required`);
      continue;
    }

    if (isEmpty) continue;

    switch (field.type) {
      case "email": {
        if (!isValidEmail(value)) {
          errors.push(`"${field.label}" must be a valid email address`);
        }
        break;
      }
      case "url": {
        if (typeof value !== "string") {
          errors.push(`"${field.label}" must be a valid URL`);
        } else {
          try {
            new URL(value);
          } catch {
            errors.push(`"${field.label}" must be a valid URL`);
          }
        }
        break;
      }
      case "number": {
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(`"${field.label}" must be a number`);
        } else if (field.validation) {
          if (field.validation.min !== undefined && num < field.validation.min) {
            errors.push(`"${field.label}" must be at least ${field.validation.min}`);
          }
          if (field.validation.max !== undefined && num > field.validation.max) {
            errors.push(`"${field.label}" must be at most ${field.validation.max}`);
          }
        }
        break;
      }
      case "text":
      case "textarea": {
        if (typeof value !== "string") {
          errors.push(`"${field.label}" must be text`);
        } else if (field.validation) {
          if (
            field.validation.minLength !== undefined &&
            value.length < field.validation.minLength
          ) {
            errors.push(
              `"${field.label}" must be at least ${field.validation.minLength} characters`,
            );
          }
          if (
            field.validation.maxLength !== undefined &&
            value.length > field.validation.maxLength
          ) {
            errors.push(
              `"${field.label}" must be at most ${field.validation.maxLength} characters`,
            );
          }
        }
        break;
      }
      case "select": {
        if (typeof value !== "string") {
          errors.push(`"${field.label}" must be a single selection`);
        } else if (field.options && field.options.length > 0) {
          const validValues = field.options.map((o) => o.value);
          if (!validValues.includes(value)) {
            errors.push(`"${field.label}" has an invalid selection`);
          }
        }
        break;
      }
      case "multiselect": {
        if (!Array.isArray(value)) {
          errors.push(`"${field.label}" must be an array of selections`);
        } else if (field.options && field.options.length > 0) {
          const validValues = field.options.map((o) => o.value);
          for (const v of value) {
            if (!validValues.includes(v as string)) {
              errors.push(`"${field.label}" contains an invalid selection`);
              break;
            }
          }
        }
        break;
      }
      case "checkbox": {
        if (typeof value !== "boolean") {
          errors.push(`"${field.label}" must be true or false`);
        }
        break;
      }
      case "date": {
        if (typeof value !== "string" || isNaN(Date.parse(value))) {
          errors.push(`"${field.label}" must be a valid date`);
        }
        break;
      }
    }
  }

  return errors;
}
