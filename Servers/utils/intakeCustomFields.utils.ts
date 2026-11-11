// Resolves intake answers into custom field values and validates a form's
// custom-field mappings. The resolver is pure: callers load the definitions.
import { Transaction } from "sequelize";
import { IIntakeFormSchema } from "../domain.layer/interfaces/i.intakeForm";
import {
  INTAKE_CUSTOM_FIELD_ENTITY,
  customFieldKeyOf,
  isCompatibleCustomFieldType,
  isCustomFieldMapping,
} from "../services/intakeFormLogic";
import {
  CustomFieldEntityType,
  ICustomFieldDefinition,
  ISO_DATE_PATTERN,
  MAX_CUSTOM_TEXT_LENGTH,
  listCustomFieldDefinitionsQuery,
} from "./customField.utils";
import type { IScoredOption } from "./customFieldScoredSelect.utils";

export interface ResolvedCustomFieldValue {
  definitionId: number;
  fieldKey: string;
  label: string;
  value: unknown;
  displayValue: string;
}

/** `reason` is a stable code: field_removed, type_changed, no_matching_option, invalid_value. */
export interface CustomFieldSkip {
  fieldKey: string;
  label: string;
  reason: string;
}

type QuestionOption = { value: string; label: string };
type Candidate = { stored: string; label: string };
type Outcome = { ok: true; value: unknown; display: string } | { ok: false; reason: string };

const norm = (text: string): string => text.trim().toLowerCase();
const isBlank = (answer: unknown): boolean =>
  answer === undefined ||
  answer === null ||
  (typeof answer === "string" && answer.trim() === "") ||
  (Array.isArray(answer) && answer.length === 0);

const candidatesOf = (def: ICustomFieldDefinition): Candidate[] =>
  (def.options ?? []).map((option) =>
    typeof option === "string"
      ? { stored: option, label: option }
      : { stored: (option as IScoredOption).id, label: (option as IScoredOption).label },
  );

/** Matches one answer against the custom field's options by stored value or label. */
const matchOption = (
  raw: unknown,
  candidates: Candidate[],
  questionOptions: QuestionOption[] = [],
): Candidate | undefined => {
  if (typeof raw !== "string") return undefined;
  const value = raw;
  const texts = [value, questionOptions.find((o) => o.value === value)?.label].filter(
    (t): t is string => typeof t === "string",
  );
  return candidates.find((c) =>
    texts.some((t) => norm(t) === norm(c.stored) || norm(t) === norm(c.label)),
  );
};

const resolveOne = (
  answer: unknown,
  questionOptions: QuestionOption[] | undefined,
  def: ICustomFieldDefinition,
): Outcome => {
  switch (def.field_type) {
    case "number": {
      const n = typeof answer === "number" ? answer : Number(String(answer).trim());
      return Number.isFinite(n)
        ? { ok: true, value: n, display: String(n) }
        : { ok: false, reason: "invalid_value" };
    }
    case "boolean": {
      if (typeof answer !== "boolean") return { ok: false, reason: "invalid_value" };
      return { ok: true, value: answer, display: answer ? "Yes" : "No" };
    }
    case "select":
    case "scored_select": {
      const hit = matchOption(answer, candidatesOf(def), questionOptions);
      return hit
        ? { ok: true, value: hit.stored, display: hit.label }
        : { ok: false, reason: "no_matching_option" };
    }
    case "multiselect": {
      const picked: Candidate[] = [];
      for (const raw of Array.isArray(answer) ? answer : [answer]) {
        const hit = matchOption(raw, candidatesOf(def), questionOptions);
        if (!hit) return { ok: false, reason: "no_matching_option" };
        if (!picked.some((p) => p.stored === hit.stored)) picked.push(hit);
      }
      return {
        ok: true,
        value: picked.map((p) => p.stored),
        display: picked.map((p) => p.label).join(", "),
      };
    }
    case "date": {
      if (
        typeof answer !== "string" ||
        !ISO_DATE_PATTERN.test(answer) ||
        Number.isNaN(Date.parse(answer))
      ) {
        return { ok: false, reason: "invalid_value" };
      }
      return { ok: true, value: answer, display: answer };
    }
    default: {
      if (typeof answer !== "string" || answer.length > MAX_CUSTOM_TEXT_LENGTH) {
        return { ok: false, reason: "invalid_value" };
      }
      return { ok: true, value: answer, display: answer };
    }
  }
};

export function resolveIntakeCustomFieldValues(
  submissionData: Record<string, unknown>,
  schema: IIntakeFormSchema,
  definitions: ICustomFieldDefinition[],
): { values: ResolvedCustomFieldValue[]; skipped: CustomFieldSkip[] } {
  const values: ResolvedCustomFieldValue[] = [];
  const skipped: CustomFieldSkip[] = [];
  for (const field of schema.fields) {
    if (!isCustomFieldMapping(field.entityFieldMapping)) continue;
    const answer = submissionData[field.id];
    if (isBlank(answer)) continue;
    const fieldKey = customFieldKeyOf(field.entityFieldMapping);
    const def = definitions.find((d) => d.field_key === fieldKey);
    if (!def) {
      skipped.push({ fieldKey, label: field.label, reason: "field_removed" });
      continue;
    }
    if (!isCompatibleCustomFieldType(field.type, def.field_type)) {
      skipped.push({ fieldKey, label: def.label, reason: "type_changed" });
      continue;
    }
    const outcome = resolveOne(answer, field.options, def);
    if (outcome.ok === false) {
      skipped.push({ fieldKey, label: def.label, reason: outcome.reason });
    } else {
      values.push({
        definitionId: def.id,
        fieldKey,
        label: def.label,
        value: outcome.value,
        displayValue: outcome.display,
      });
    }
  }
  return { values, skipped };
}

/** Checks each custom-field mapping against the org's current definitions. */
export async function validateFormCustomFieldMappings(
  schema: IIntakeFormSchema,
  intakeEntityType: string,
  organizationId: number,
  transaction?: Transaction,
): Promise<string[]> {
  const mapped = schema.fields.filter((f) => isCustomFieldMapping(f.entityFieldMapping));
  if (mapped.length === 0) return [];
  if (!Object.prototype.hasOwnProperty.call(INTAKE_CUSTOM_FIELD_ENTITY, intakeEntityType))
    return [];
  const entityType =
    INTAKE_CUSTOM_FIELD_ENTITY[intakeEntityType as keyof typeof INTAKE_CUSTOM_FIELD_ENTITY];
  const definitions = await listCustomFieldDefinitionsQuery(
    organizationId,
    entityType as CustomFieldEntityType,
    transaction,
  );
  const errors: string[] = [];
  for (const field of mapped) {
    const key = customFieldKeyOf(field.entityFieldMapping as string);
    const def = definitions.find((d) => d.field_key === key);
    if (!def) errors.push(`Question "${field.label}": custom field "${key}" no longer exists`);
    else if (!isCompatibleCustomFieldType(field.type, def.field_type))
      errors.push(
        `Question "${field.label}": custom field "${key}" cannot store this question type`,
      );
  }
  return errors;
}
