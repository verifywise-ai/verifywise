import { IIntakeFormField, IIntakeFormSchema } from "../domain.layer/interfaces/i.intakeForm";

/**
 * Accessibility validation for intake-form schemas.
 *
 * The public intake form is rendered entirely from backend-supplied field
 * definitions, so the backend decides whether the resulting page has labelled
 * controls. `IIntakeFormField.label` is typed `string` and therefore required,
 * but the type does not stop `""` — and an empty label renders an input with no
 * accessible name at all. The same goes for a select whose options carry empty
 * text: the user sees a list of blank rows.
 *
 * These checks reject that at the API boundary rather than leaving it to be
 * discovered by an axe scan, or not discovered at all.
 */

/** Field types whose options become the rendered choice text. */
const OPTION_BEARING_TYPES = new Set(["select", "multiselect"]);

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function validateField(field: IIntakeFormField, index: number): string[] {
  const errors: string[] = [];
  // Fall back to the position when the id is unusable, so the message still
  // points at a specific field.
  const where = isBlank(field?.id) ? `Field ${index + 1}` : `Field "${field.id}"`;

  if (!field || typeof field !== "object") {
    return [`Field ${index + 1} is not a valid field definition`];
  }

  // The rendered label is tied to the input through this id; without it the
  // association cannot be made at all.
  if (isBlank(field.id)) {
    errors.push(`${where} must have a non-empty id`);
  }

  if (isBlank(field.label)) {
    errors.push(`${where} must have a non-empty label`);
  }

  if (OPTION_BEARING_TYPES.has(field.type)) {
    if (!Array.isArray(field.options) || field.options.length === 0) {
      errors.push(`${where} is a ${field.type} and must have at least one option`);
    } else {
      field.options.forEach((option, optionIndex) => {
        if (!option || typeof option !== "object" || isBlank(option.label)) {
          errors.push(`${where} option ${optionIndex + 1} must have a non-empty label`);
        }
      });
    }
  }

  return errors;
}

/**
 * Validates a form schema for the label data the rendered page depends on.
 *
 * Returns an array of error messages, empty when the schema is acceptable.
 * An absent schema is allowed — a form may be created before its fields are
 * designed — but a schema that is present must be well-formed.
 */
export function validateIntakeFormSchemaLabels(schema: unknown): string[] {
  if (schema === undefined || schema === null) {
    return [];
  }

  if (typeof schema !== "object" || Array.isArray(schema)) {
    return ["Form schema must be an object"];
  }

  const { fields } = schema as Partial<IIntakeFormSchema>;

  if (fields === undefined) {
    return [];
  }

  if (!Array.isArray(fields)) {
    return ["Form schema fields must be an array"];
  }

  return fields.flatMap((field, index) => validateField(field as IIntakeFormField, index));
}
