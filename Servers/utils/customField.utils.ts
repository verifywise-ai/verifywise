import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from "../domain.layer/exceptions/custom.exception";

// ---------- Types ----------

export type CustomFieldType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "select"
  | "multiselect"
  | "user";

export type CustomFieldEntityType =
  | "vendor"
  | "policy"
  | "project"
  | "project_risk"
  | "vendor_risk"
  | "model_inventory"
  | "task"
  | "model_risk";
// NOTE: Scope is intentionally limited to the core governance entities listed
// above. Other entities (dataset, ai_incident, training, fria, pmm_config,
// evidence, assessment, file, approval_workflow, automation, intake_form,
// governance_scenario, ai_detection_repository, shadow_ai_tool) are out of
// scope for custom fields at this time.
//
// "control" and "subcontrol" are also excluded: controls are split per
// framework (controls_eu, annexcontrols_iso27001, ...), not a single table —
// the single-table org guard can't honor them.

export interface ICustomFieldDefinition {
  id: number;
  organization_id: number;
  entity_type: CustomFieldEntityType;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  options: string[] | null;
  required: boolean;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface ICustomFieldValue {
  id: number;
  organization_id: number;
  definition_id: number;
  entity_type: CustomFieldEntityType;
  entity_id: number;
  value: unknown;
  created_at: Date;
  updated_at: Date;
}

// ---------- Allowlists (must stay in sync with the DB CHECK constraints) ----------

const FIELD_TYPES: ReadonlySet<CustomFieldType> = new Set([
  "text",
  "number",
  "date",
  "boolean",
  "select",
  "multiselect",
  "user",
]);

const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const LABEL_MIN = 1;
const LABEL_MAX = 255;
const OPTION_MIN = 1;
const OPTION_MAX = 255;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

// entity_type -> the SQL table that owns the entity. Used to verify the
// parent row belongs to the calling org BEFORE writing a value. Keep this
// in lockstep with the DB CHECK allowlist.
// Exported for tests that lock the map against the actual migration DDL.
export const ENTITY_TYPE_TO_TABLE: Record<CustomFieldEntityType, string> = {
  vendor: "vendors",
  policy: "policy_manager",
  project: "projects",
  project_risk: "risks",
  vendor_risk: "vendorrisks",
  model_inventory: "model_inventories",
  task: "tasks",
  model_risk: "model_risks",
};

// ---------- Internal validators ----------

const isEntityType = (v: unknown): v is CustomFieldEntityType =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(ENTITY_TYPE_TO_TABLE, v);

const isFieldType = (v: unknown): v is CustomFieldType =>
  typeof v === "string" && FIELD_TYPES.has(v as CustomFieldType);

const assertPositiveInt = (n: unknown, name: string): number => {
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
    throw new ValidationException(`${name} must be a positive integer`, name, n);
  }
  return n;
};

const assertEntityType = (v: unknown): CustomFieldEntityType => {
  if (!isEntityType(v)) {
    throw new ValidationException("Invalid entity_type", "entity_type", v);
  }
  return v;
};

const validateOptionsForType = (fieldType: CustomFieldType, options: unknown): string[] | null => {
  const needsOptions = fieldType === "select" || fieldType === "multiselect";

  if (!needsOptions) {
    if (options !== null && options !== undefined) {
      throw new ValidationException(
        "options is only allowed for select/multiselect fields",
        "options",
      );
    }
    return null;
  }

  if (!Array.isArray(options) || options.length === 0) {
    throw new ValidationException(
      "select/multiselect fields require a non-empty options array",
      "options",
    );
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const opt of options) {
    if (typeof opt !== "string") {
      throw new ValidationException("option values must be strings", "options");
    }
    const trimmed = opt.trim();
    if (trimmed.length < OPTION_MIN || trimmed.length > OPTION_MAX) {
      throw new ValidationException(
        `option values must be ${OPTION_MIN}..${OPTION_MAX} characters`,
        "options",
      );
    }
    if (seen.has(trimmed)) {
      throw new ValidationException("option values must be unique", "options", trimmed);
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
};

const validateLabel = (label: unknown): string => {
  if (typeof label !== "string") {
    throw new ValidationException("label must be a string", "label");
  }
  const trimmed = label.trim();
  if (trimmed.length < LABEL_MIN || trimmed.length > LABEL_MAX) {
    throw new ValidationException(`label must be ${LABEL_MIN}..${LABEL_MAX} characters`, "label");
  }
  return trimmed;
};

const validateDefinitionInput = (input: {
  entity_type: unknown;
  field_key: unknown;
  label: unknown;
  field_type: unknown;
  options?: unknown;
  required?: unknown;
}): {
  entity_type: CustomFieldEntityType;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  options: string[] | null;
  required: boolean;
} => {
  const entity_type = assertEntityType(input.entity_type);

  if (!isFieldType(input.field_type)) {
    throw new ValidationException("Invalid field_type", "field_type", input.field_type);
  }

  if (typeof input.field_key !== "string" || !FIELD_KEY_PATTERN.test(input.field_key)) {
    throw new ValidationException(
      "field_key must match ^[a-z][a-z0-9_]{0,63}$",
      "field_key",
      input.field_key,
    );
  }

  const label = validateLabel(input.label);
  const options = validateOptionsForType(input.field_type, input.options ?? null);
  const required = input.required === undefined ? false : Boolean(input.required);

  return {
    entity_type,
    field_key: input.field_key,
    label,
    field_type: input.field_type,
    options,
    required,
  };
};

const validateValueForDefinition = async (
  def: ICustomFieldDefinition,
  raw: unknown,
  organizationId: number,
): Promise<unknown> => {
  if (raw === null || raw === undefined) {
    throw new ValidationException(
      "value cannot be null — call the delete API to clear instead",
      "value",
    );
  }

  switch (def.field_type) {
    case "text": {
      if (typeof raw !== "string") {
        throw new ValidationException("Expected string value", "value");
      }
      if (raw.length > 10_000) {
        throw new ValidationException("Text value exceeds 10000 characters", "value");
      }
      return raw;
    }
    case "number": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        throw new ValidationException("Expected finite number value", "value");
      }
      return raw;
    }
    case "boolean": {
      if (typeof raw !== "boolean") {
        throw new ValidationException("Expected boolean value", "value");
      }
      return raw;
    }
    case "date": {
      if (typeof raw !== "string" || !ISO_DATE_PATTERN.test(raw)) {
        throw new ValidationException("Expected ISO date or date-time string", "value");
      }
      const ts = Date.parse(raw);
      if (Number.isNaN(ts)) {
        throw new ValidationException("Unparseable date value", "value");
      }
      return raw;
    }
    case "select": {
      if (typeof raw !== "string" || !def.options?.includes(raw)) {
        throw new ValidationException("Value must be one of the allowed options", "value", raw);
      }
      return raw;
    }
    case "multiselect": {
      if (!Array.isArray(raw) || raw.length === 0) {
        throw new ValidationException("Value must be a non-empty array of options", "value");
      }
      const seen = new Set<string>();
      for (const v of raw) {
        if (typeof v !== "string" || !def.options?.includes(v)) {
          throw new ValidationException("All values must match the allowed options", "value", v);
        }
        if (seen.has(v)) {
          throw new ValidationException("Duplicate value in multiselect", "value", v);
        }
        seen.add(v);
      }
      return raw;
    }
    case "user": {
      const userId = assertPositiveInt(raw, "value");
      const rows = await sequelize.query(
        `SELECT 1 AS ok FROM users
          WHERE id = :userId AND organization_id = :organizationId
          LIMIT 1`,
        {
          replacements: { userId, organizationId },
          type: QueryTypes.SELECT,
        },
      );
      if (rows.length === 0) {
        throw new ValidationException(
          "Referenced user not found in this organization",
          "value",
          userId,
        );
      }
      return userId;
    }
    default: {
      throw new ValidationException("Unsupported field_type", "field_type");
    }
  }
};

const assertEntityBelongsToOrg = async (
  entityType: CustomFieldEntityType,
  entityId: number,
  organizationId: number,
): Promise<void> => {
  const table = ENTITY_TYPE_TO_TABLE[entityType];
  // Safe: `table` resolved from a static allowlist, never user-controlled.
  const rows = await sequelize.query(
    `SELECT 1 AS ok FROM ${table}
       WHERE id = :entityId AND organization_id = :organizationId
       LIMIT 1`,
    {
      replacements: { entityId, organizationId },
      type: QueryTypes.SELECT,
    },
  );
  if (rows.length === 0) {
    throw new ForbiddenException(
      "Target entity not found in this organization",
      entityType,
      String(entityId),
    );
  }
};

// ---------- Public: definitions ----------

export const listCustomFieldDefinitionsQuery = async (
  organizationId: number,
  entityType: CustomFieldEntityType,
): Promise<ICustomFieldDefinition[]> => {
  assertPositiveInt(organizationId, "organizationId");
  assertEntityType(entityType);

  return (await sequelize.query(
    `SELECT * FROM custom_field_definitions
       WHERE organization_id = :organizationId
         AND entity_type = :entityType
       ORDER BY created_at ASC, id ASC`,
    {
      replacements: { organizationId, entityType },
      type: QueryTypes.SELECT,
    },
  )) as ICustomFieldDefinition[];
};

export const getCustomFieldDefinitionByIdQuery = async (
  id: number,
  organizationId: number,
): Promise<ICustomFieldDefinition | null> => {
  assertPositiveInt(id, "id");
  assertPositiveInt(organizationId, "organizationId");

  const rows = (await sequelize.query(
    `SELECT * FROM custom_field_definitions
       WHERE id = :id AND organization_id = :organizationId`,
    {
      replacements: { id, organizationId },
      type: QueryTypes.SELECT,
    },
  )) as ICustomFieldDefinition[];

  return rows[0] ?? null;
};

export const createCustomFieldDefinitionQuery = async (
  input: {
    entity_type: CustomFieldEntityType;
    field_key: string;
    label: string;
    field_type: CustomFieldType;
    options?: string[] | null;
    required?: boolean;
  },
  organizationId: number,
  userId: number,
): Promise<ICustomFieldDefinition> => {
  assertPositiveInt(organizationId, "organizationId");
  assertPositiveInt(userId, "userId");
  const safe = validateDefinitionInput(input);

  try {
    const rows = (await sequelize.query(
      `INSERT INTO custom_field_definitions (
         organization_id, entity_type, field_key, label,
         field_type, options, required, created_by
       ) VALUES (
         :organizationId, :entity_type, :field_key, :label,
         :field_type, CAST(:options AS JSONB), :required, :userId
       )
       RETURNING *`,
      {
        replacements: {
          organizationId,
          entity_type: safe.entity_type,
          field_key: safe.field_key,
          label: safe.label,
          field_type: safe.field_type,
          options: safe.options ? JSON.stringify(safe.options) : null,
          required: safe.required,
          userId,
        },
        type: QueryTypes.SELECT,
      },
    )) as ICustomFieldDefinition[];

    return rows[0];
  } catch (err: any) {
    if (err?.original?.code === "23505") {
      throw new ConflictException(
        "A custom field with this key already exists for this entity",
        "custom_field_definition",
        `${safe.entity_type}.${safe.field_key}`,
      );
    }
    throw err;
  }
};

export const updateCustomFieldDefinitionQuery = async (
  id: number,
  organizationId: number,
  patch: { label?: string; required?: boolean; options?: string[] | null },
): Promise<ICustomFieldDefinition> => {
  assertPositiveInt(id, "id");
  assertPositiveInt(organizationId, "organizationId");

  // field_type, field_key, entity_type are immutable on update — changing them
  // would invalidate existing values. Force a create + delete instead.
  const existing = await getCustomFieldDefinitionByIdQuery(id, organizationId);
  if (!existing) {
    throw new NotFoundException("Custom field definition not found", "custom_field_definition", id);
  }

  const label = patch.label !== undefined ? validateLabel(patch.label) : existing.label;
  const required = patch.required !== undefined ? Boolean(patch.required) : existing.required;
  const options =
    patch.options !== undefined
      ? validateOptionsForType(existing.field_type, patch.options)
      : existing.options;

  const rows = (await sequelize.query(
    `UPDATE custom_field_definitions
        SET label = :label,
            required = :required,
            options = CAST(:options AS JSONB),
            updated_at = NOW()
      WHERE id = :id AND organization_id = :organizationId
      RETURNING *`,
    {
      replacements: {
        id,
        organizationId,
        label,
        required,
        options: options ? JSON.stringify(options) : null,
      },
      type: QueryTypes.SELECT,
    },
  )) as ICustomFieldDefinition[];

  return rows[0];
};

export const deleteCustomFieldDefinitionQuery = async (
  id: number,
  organizationId: number,
): Promise<boolean> => {
  assertPositiveInt(id, "id");
  assertPositiveInt(organizationId, "organizationId");

  // Cascade on FK removes all values for this definition.
  const rows = await sequelize.query(
    `DELETE FROM custom_field_definitions
       WHERE id = :id AND organization_id = :organizationId
       RETURNING id`,
    {
      replacements: { id, organizationId },
      type: QueryTypes.SELECT,
    },
  );
  return rows.length > 0;
};

// ---------- Public: values ----------

export const setCustomFieldValueQuery = async (
  args: {
    definition_id: number;
    entity_id: number;
    value: unknown;
  },
  organizationId: number,
  transaction?: Transaction,
): Promise<ICustomFieldValue> => {
  assertPositiveInt(organizationId, "organizationId");
  const definitionId = assertPositiveInt(args.definition_id, "definition_id");
  const entityId = assertPositiveInt(args.entity_id, "entity_id");

  const definition = await getCustomFieldDefinitionByIdQuery(definitionId, organizationId);
  if (!definition) {
    throw new NotFoundException(
      "Custom field definition not found",
      "custom_field_definition",
      definitionId,
    );
  }

  await assertEntityBelongsToOrg(definition.entity_type, entityId, organizationId);

  const validated = await validateValueForDefinition(definition, args.value, organizationId);

  const rows = (await sequelize.query(
    `INSERT INTO custom_field_values
       (organization_id, definition_id, entity_type, entity_id, value)
     VALUES
       (:organizationId, :definitionId, :entityType, :entityId, CAST(:value AS JSONB))
     ON CONFLICT (definition_id, entity_id)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
     RETURNING *`,
    {
      replacements: {
        organizationId,
        definitionId,
        entityType: definition.entity_type,
        entityId,
        value: JSON.stringify(validated),
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as ICustomFieldValue[];

  return rows[0];
};

export const getCustomFieldValuesForEntityQuery = async (
  entityType: CustomFieldEntityType,
  entityId: number,
  organizationId: number,
): Promise<
  Array<{
    definition_id: number;
    field_key: string;
    label: string;
    field_type: CustomFieldType;
    value: unknown;
  }>
> => {
  assertEntityType(entityType);
  assertPositiveInt(entityId, "entity_id");
  assertPositiveInt(organizationId, "organizationId");

  return (await sequelize.query(
    `SELECT v.definition_id, d.field_key, d.label, d.field_type, v.value
       FROM custom_field_values v
       JOIN custom_field_definitions d ON d.id = v.definition_id
      WHERE v.organization_id = :organizationId
        AND v.entity_type = :entityType
        AND v.entity_id = :entityId
      ORDER BY d.created_at ASC, d.id ASC`,
    {
      replacements: { organizationId, entityType, entityId },
      type: QueryTypes.SELECT,
    },
  )) as Array<{
    definition_id: number;
    field_key: string;
    label: string;
    field_type: CustomFieldType;
    value: unknown;
  }>;
};

// Returns the IDs of required definitions that DON'T have a stored value
// for the given entity. Used to gate the parent entity's save action.
export const getMissingRequiredCustomFieldsQuery = async (
  entityType: CustomFieldEntityType,
  entityId: number,
  organizationId: number,
): Promise<Array<{ id: number; field_key: string; label: string }>> => {
  assertEntityType(entityType);
  assertPositiveInt(entityId, "entity_id");
  assertPositiveInt(organizationId, "organizationId");

  return (await sequelize.query(
    `SELECT d.id, d.field_key, d.label
       FROM custom_field_definitions d
  LEFT JOIN custom_field_values v
         ON v.definition_id = d.id
        AND v.entity_id = :entityId
        AND v.organization_id = :organizationId
      WHERE d.organization_id = :organizationId
        AND d.entity_type = :entityType
        AND d.required = true
        AND v.id IS NULL
      ORDER BY d.created_at ASC, d.id ASC`,
    {
      replacements: { organizationId, entityType, entityId },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ id: number; field_key: string; label: string }>;
};

export const deleteCustomFieldValueQuery = async (
  definitionId: number,
  entityId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<boolean> => {
  assertPositiveInt(definitionId, "definition_id");
  assertPositiveInt(entityId, "entity_id");
  assertPositiveInt(organizationId, "organizationId");

  const rows = await sequelize.query(
    `DELETE FROM custom_field_values
       WHERE organization_id = :organizationId
         AND definition_id = :definitionId
         AND entity_id = :entityId
       RETURNING id`,
    {
      replacements: { organizationId, definitionId, entityId },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  return rows.length > 0;
};

/**
 * Bulk-fetch custom field values for many entities of one type, in one query.
 * Used by list-endpoint queries to attach `custom_fields` to each row without
 * an N+1.
 *
 * Returns a Map<entity_id, CustomFieldRow[]>. Entities with no values are
 * absent from the map — callers should default to [].
 */
export const fetchCustomFieldsForEntities = async (
  entityType: CustomFieldEntityType,
  entityIds: number[],
  organizationId: number,
): Promise<
  Map<
    number,
    Array<{
      definition_id: number;
      field_key: string;
      label: string;
      field_type: CustomFieldType;
      value: unknown;
    }>
  >
> => {
  assertEntityType(entityType);
  assertPositiveInt(organizationId, "organizationId");

  const result = new Map<
    number,
    Array<{
      definition_id: number;
      field_key: string;
      label: string;
      field_type: CustomFieldType;
      value: unknown;
    }>
  >();

  const cleanIds = Array.from(
    new Set(
      (entityIds ?? []).filter(
        (id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0,
      ),
    ),
  );
  if (cleanIds.length === 0) return result;

  const rows = (await sequelize.query(
    `SELECT v.entity_id, v.definition_id, d.field_key, d.label, d.field_type, v.value
       FROM custom_field_values v
       JOIN custom_field_definitions d ON d.id = v.definition_id
      WHERE v.organization_id = :organizationId
        AND v.entity_type = :entityType
        AND v.entity_id IN (:cleanIds)
      ORDER BY v.entity_id ASC, d.created_at ASC, d.id ASC`,
    {
      replacements: { organizationId, entityType, cleanIds },
      type: QueryTypes.SELECT,
    },
  )) as Array<{
    entity_id: number;
    definition_id: number;
    field_key: string;
    label: string;
    field_type: CustomFieldType;
    value: unknown;
  }>;

  for (const row of rows) {
    const { entity_id, ...rest } = row;
    const list = result.get(entity_id) ?? [];
    list.push(rest);
    result.set(entity_id, list);
  }
  return result;
};

// Call this from each entity's delete path so values are cleaned up
// when the parent entity is removed (FK only cascades from the definition).
export const deleteAllCustomFieldValuesForEntityQuery = async (
  entityType: CustomFieldEntityType,
  entityId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<void> => {
  assertEntityType(entityType);
  assertPositiveInt(entityId, "entity_id");
  assertPositiveInt(organizationId, "organizationId");

  await sequelize.query(
    `DELETE FROM custom_field_values
       WHERE organization_id = :organizationId
         AND entity_type = :entityType
         AND entity_id = :entityId`,
    {
      replacements: { organizationId, entityType, entityId },
      transaction,
    },
  );
};
