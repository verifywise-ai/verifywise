// Resolves intake answers into custom field values (#5262), writes them on
// approval, previews them for review and validates a form's custom-field
// mappings. The resolver is pure: callers load the definitions.
import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import { IIntakeFormSchema } from "../domain.layer/interfaces/i.intakeForm";
import {
  INTAKE_CUSTOM_FIELD_ENTITY,
  customFieldKeyOf,
  customFieldOptionTexts,
  isCompatibleCustomFieldType,
  isCustomFieldMapping,
  isEmptyAnswer,
  matchCustomFieldOption,
  unmatchedCustomFieldOptions,
  type CustomFieldOptionText,
} from "../services/intakeFormLogic";
import {
  CustomFieldEntityType,
  ICustomFieldDefinition,
  ISO_DATE_PATTERN,
  MAX_CUSTOM_TEXT_LENGTH,
  listCustomFieldDefinitionsQuery,
  setCustomFieldValueQuery,
} from "./customField.utils";
import logger from "./logger/fileLogger";

/** What a preview shows for a value: text as is, or a yes or no the caller translates. */
export type CustomFieldDisplay = string | boolean;

export interface ResolvedCustomFieldValue {
  definitionId: number;
  fieldKey: string;
  label: string;
  value: unknown;
  displayValue: CustomFieldDisplay;
}

/** `reason` is a stable code: field_removed, type_changed, no_matching_option, invalid_value. */
export interface CustomFieldSkip {
  fieldKey: string;
  label: string;
  reason: string;
}

/** One mapped, answered question's outcome, in question order. */
export type CustomFieldResult =
  | ({ status: "value" } & ResolvedCustomFieldValue)
  | ({ status: "skipped"; answerDisplay: CustomFieldDisplay } & CustomFieldSkip);

type QuestionOption = { value: string; label: string };
type Outcome =
  { ok: true; value: unknown; display: CustomFieldDisplay } | { ok: false; reason: string };

/** The custom field entity type for an intake entity type, or null for an unknown one. */
export function customFieldEntityOf(intakeEntityType: string): CustomFieldEntityType | null {
  return Object.prototype.hasOwnProperty.call(INTAKE_CUSTOM_FIELD_ENTITY, intakeEntityType)
    ? (INTAKE_CUSTOM_FIELD_ENTITY[
        intakeEntityType as keyof typeof INTAKE_CUSTOM_FIELD_ENTITY
      ] as CustomFieldEntityType)
    : null;
}

export function hasCustomFieldMappings(schema: IIntakeFormSchema | undefined | null): boolean {
  return (
    Array.isArray(schema?.fields) &&
    schema!.fields.some((f) => isCustomFieldMapping(f.entityFieldMapping))
  );
}

/** Matches one answer, and the label of the question option it names, against the field's options. */
const matchOption = (
  raw: unknown,
  candidates: CustomFieldOptionText[],
  questionOptions: QuestionOption[] = [],
): CustomFieldOptionText | undefined => {
  if (typeof raw !== "string") return undefined;
  return matchCustomFieldOption(
    [raw, questionOptions.find((o) => o.value === raw)?.label],
    candidates,
  );
};

/** The answer as the submitter gave it: option labels for choices, yes or no for a checkbox. */
const answerDisplayOf = (
  answer: unknown,
  questionOptions: QuestionOption[] = [],
): CustomFieldDisplay => {
  const labelOf = (raw: unknown): string =>
    questionOptions.find((o) => o.value === raw)?.label ?? String(raw);
  if (typeof answer === "boolean") return answer;
  if (Array.isArray(answer)) return answer.map(labelOf).join(", ");
  return labelOf(answer);
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
      return { ok: true, value: answer, display: answer };
    }
    case "select":
    case "scored_select": {
      const hit = matchOption(answer, customFieldOptionTexts(def.options), questionOptions);
      return hit
        ? { ok: true, value: hit.stored, display: hit.label }
        : { ok: false, reason: "no_matching_option" };
    }
    case "multiselect": {
      const candidates = customFieldOptionTexts(def.options);
      const picked: CustomFieldOptionText[] = [];
      for (const raw of Array.isArray(answer) ? answer : [answer]) {
        const hit = matchOption(raw, candidates, questionOptions);
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

/**
 * The custom field value each mapped, answered question resolves to, or why
 * it is skipped. `results` keeps question order; `values` and `skipped` are
 * its two halves.
 */
export function resolveIntakeCustomFieldValues(
  submissionData: Record<string, unknown>,
  schema: IIntakeFormSchema,
  definitions: ICustomFieldDefinition[],
): {
  values: ResolvedCustomFieldValue[];
  skipped: CustomFieldSkip[];
  results: CustomFieldResult[];
} {
  const results: CustomFieldResult[] = [];
  for (const field of schema.fields) {
    if (!isCustomFieldMapping(field.entityFieldMapping)) continue;
    const answer = submissionData[field.id];
    if (isEmptyAnswer(answer)) continue;
    const fieldKey = customFieldKeyOf(field.entityFieldMapping);
    const skip = (label: string, reason: string) =>
      results.push({
        status: "skipped",
        fieldKey,
        label,
        reason,
        answerDisplay: answerDisplayOf(answer, field.options),
      });
    const def = definitions.find((d) => d.field_key === fieldKey);
    if (!def) {
      skip(field.label, "field_removed");
      continue;
    }
    if (!isCompatibleCustomFieldType(field.type, def.field_type)) {
      skip(def.label, "type_changed");
      continue;
    }
    const outcome = resolveOne(answer, field.options, def);
    if (outcome.ok === false) {
      skip(def.label, outcome.reason);
    } else {
      results.push({
        status: "value",
        definitionId: def.id,
        fieldKey,
        label: def.label,
        value: outcome.value,
        displayValue: outcome.display,
      });
    }
  }
  const values: ResolvedCustomFieldValue[] = [];
  const skipped: CustomFieldSkip[] = [];
  for (const result of results) {
    if (result.status === "value") {
      const { status: _status, ...value } = result;
      values.push(value);
    } else {
      skipped.push({ fieldKey: result.fieldKey, label: result.label, reason: result.reason });
    }
  }
  return { values, skipped, results };
}

/**
 * Writes the custom field values an approved submission's answers resolve to,
 * each in its own savepoint. A value the write refuses (the field was removed,
 * its options changed, the entity is not found) is skipped and reported; any
 * other error fails the approval.
 */
export async function writeIntakeCustomFields(
  intakeEntityType: string,
  answers: Record<string, unknown>,
  schema: IIntakeFormSchema,
  entityId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<CustomFieldSkip[]> {
  const target = customFieldEntityOf(intakeEntityType);
  if (!target || !hasCustomFieldMappings(schema)) return [];
  const definitions = await listCustomFieldDefinitionsQuery(organizationId, target, transaction);
  const { values, skipped } = resolveIntakeCustomFieldValues(answers, schema, definitions);
  const skips = [...skipped];
  for (const value of values) {
    const savepoint = await sequelize.transaction({ transaction });
    try {
      await setCustomFieldValueQuery(
        { definition_id: value.definitionId, entity_id: entityId, value: value.value },
        organizationId,
        savepoint,
      );
      await savepoint.commit();
    } catch (error) {
      await savepoint.rollback();
      if (
        error instanceof NotFoundException &&
        error.metadata?.resource === "custom_field_definition"
      ) {
        skips.push({ fieldKey: value.fieldKey, label: value.label, reason: "field_removed" });
      } else if (
        error instanceof NotFoundException ||
        error instanceof ValidationException ||
        error instanceof ForbiddenException
      ) {
        skips.push({ fieldKey: value.fieldKey, label: value.label, reason: "invalid_value" });
      } else {
        throw error;
      }
    }
  }
  return skips;
}

/** A preview row: the value approval would save, or the answer as given and why it is skipped. */
export interface CustomFieldPreviewRow {
  label: string;
  display: CustomFieldDisplay;
  /** Skip reason code, as in CustomFieldSkip. */
  skipReason?: string;
}

/**
 * The custom field values an approval would write, in question order, skipped
 * ones marked. Null when the definitions cannot be read: the preview is
 * advisory and must not block review.
 */
export async function previewIntakeCustomFields(
  intakeEntityType: string,
  answers: Record<string, unknown>,
  schema: IIntakeFormSchema,
  organizationId: number,
): Promise<CustomFieldPreviewRow[] | null> {
  const target = customFieldEntityOf(intakeEntityType);
  if (!target || !hasCustomFieldMappings(schema)) return [];
  let definitions: ICustomFieldDefinition[];
  try {
    definitions = await listCustomFieldDefinitionsQuery(organizationId, target);
  } catch (error) {
    logger.warn(`Custom field preview unavailable: ${(error as Error).message}`);
    return null;
  }
  return resolveIntakeCustomFieldValues(answers, schema, definitions).results.map((result) =>
    result.status === "value"
      ? { label: result.label, display: result.displayValue }
      : { label: result.label, display: result.answerDisplay, skipReason: result.reason },
  );
}

/** A question whose custom-field mapping can't be published; the caller words it. */
export interface CustomFieldMappingProblem {
  label: string;
  fieldKey: string;
  problem: "field_removed" | "type_changed" | "options_mismatch";
}

/** Checks each custom-field mapping against the org's current definitions. */
export async function validateFormCustomFieldMappings(
  schema: IIntakeFormSchema | undefined | null,
  intakeEntityType: unknown,
  organizationId: number,
  transaction?: Transaction,
): Promise<CustomFieldMappingProblem[]> {
  if (!hasCustomFieldMappings(schema) || typeof intakeEntityType !== "string") return [];
  const entityType = customFieldEntityOf(intakeEntityType);
  if (!entityType) return [];
  const definitions = await listCustomFieldDefinitionsQuery(
    organizationId,
    entityType,
    transaction,
  );
  const problems: CustomFieldMappingProblem[] = [];
  for (const field of schema!.fields) {
    if (!isCustomFieldMapping(field.entityFieldMapping)) continue;
    const fieldKey = customFieldKeyOf(field.entityFieldMapping);
    const def = definitions.find((d) => d.field_key === fieldKey);
    if (!def) problems.push({ label: field.label, fieldKey, problem: "field_removed" });
    else if (!isCompatibleCustomFieldType(field.type, def.field_type))
      problems.push({ label: field.label, fieldKey, problem: "type_changed" });
    else if (
      unmatchedCustomFieldOptions(field.type, field.options, def.field_type, def.options).length > 0
    )
      problems.push({ label: field.label, fieldKey, problem: "options_mismatch" });
  }
  return problems;
}
