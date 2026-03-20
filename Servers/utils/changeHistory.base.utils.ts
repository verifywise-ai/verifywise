/**
 * Generic Change History Utilities
 *
 * Base utilities for tracking entity changes across all entity types.
 * These functions are entity-agnostic and work with any entity that has
 * a configuration defined in changeHistory.config.ts.
 *
 * Features:
 * - Entity-agnostic change recording
 * - Field value formatting with custom formatters
 * - Automatic change detection between old and new states
 * - Evidence attachment tracking
 * - Paginated history retrieval
 *
 * @module utils/changeHistory.base
 * @see {@link ../config/changeHistory.config.ts} for entity configurations
 */

import { sequelize } from "../database/db";
import { Transaction, QueryTypes } from "sequelize";
import {
  EntityType,
  getEntityConfig,
  GENERIC_FORMATTERS,
} from "../config/changeHistory.config";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import logger from "./logger/fileLogger";
import { appendToAuditLedger } from "./auditLedger.utils";

/**
 * Escapes a PostgreSQL identifier safely (for table/column names)
 *
 * @param ident - The identifier to escape (alphanumeric + underscores)
 * @returns Safely escaped identifier wrapped in double quotes
 */
function escapePgName(ident: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(ident)) {
    throw new ValidationException("Invalid SQL identifier");
  }
  return '"' + ident.replace(/"/g, '""') + '"';
}

/**
 * Record a single change for any entity type
 *
 * @param entityType - The type of entity being changed
 * @param entityId - The ID of the entity being changed
 * @param action - The action being performed ('created', 'updated', 'deleted')
 * @param changedByUserId - ID of the user making the change
 * @param organizationId - Organization ID for tenant isolation
 * @param fieldName - Optional name of the field being changed
 * @param oldValue - Optional previous value of the field
 * @param newValue - Optional new value of the field
 * @param transaction - Optional database transaction
 */
export const recordEntityChange = async (
  entityType: EntityType,
  entityId: number,
  action: "created" | "updated" | "deleted",
  changedByUserId: number,
  organizationId: number,
  fieldName?: string,
  oldValue?: string,
  newValue?: string,
  transaction?: Transaction
): Promise<void> => {
  try {
    const config = getEntityConfig(entityType);

    const tableName = escapePgName(config.tableName);
    const foreignKey = escapePgName(config.foreignKeyField);

    await sequelize.query(
      `INSERT INTO ${tableName}
       (organization_id, ${foreignKey}, action, field_name, old_value, new_value, changed_by_user_id, changed_at)
       VALUES (:organization_id, :entity_id, :action, :field_name, :old_value, :new_value, :changed_by_user_id, NOW())`,
      {
        replacements: {
          organization_id: organizationId,
          entity_id: entityId,
          action,
          field_name: fieldName || null,
          old_value: oldValue || null,
          new_value: newValue || null,
          changed_by_user_id: changedByUserId,
        },
        transaction,
      }
    );

    // Append to tamper-proof audit ledger (fire-and-forget)
    appendToAuditLedger({
      organizationId,
      entryType: "change_history",
      userId: changedByUserId,
      entityType,
      entityId,
      action,
      fieldName: fieldName || null,
      oldValue: oldValue || null,
      newValue: newValue || null,
    }).catch(err => logger.error(`[audit_ledger] write failed: ${err}`));
  } catch (error) {
    logger.error(`Error recording ${entityType} change: ${error}`);
    throw error;
  }
};

/**
 * Record multiple field changes for an entity
 *
 * @param entityType - The type of entity being changed
 * @param entityId - The ID of the entity being changed
 * @param changedByUserId - ID of the user making the change
 * @param organizationId - Organization ID for tenant isolation
 * @param changes - Array of field changes to record
 * @param transaction - Optional database transaction
 */
export const recordMultipleFieldChanges = async (
  entityType: EntityType,
  entityId: number,
  changedByUserId: number,
  organizationId: number,
  changes: Array<{ fieldName: string; oldValue: string; newValue: string }>,
  transaction?: Transaction
): Promise<void> => {
  for (const change of changes) {
    await recordEntityChange(
      entityType,
      entityId,
      "updated",
      changedByUserId,
      organizationId,
      change.fieldName,
      change.oldValue,
      change.newValue,
      transaction
    );
  }
};

/**
 * Get change history for a specific entity with pagination support
 *
 * @param entityType - The type of entity to get history for
 * @param entityId - The ID of the entity
 * @param organizationId - Organization ID for tenant isolation
 * @param limit - Maximum number of records to return (default: 100)
 * @param offset - Number of records to skip (default: 0)
 * @returns Object containing data array, hasMore flag, and total count
 */
export const getEntityChangeHistory = async (
  entityType: EntityType,
  entityId: number,
  organizationId: number,
  limit: number = 100,
  offset: number = 0
): Promise<{ data: any[]; hasMore: boolean; total: number }> => {
  try {
    const config = getEntityConfig(entityType);

    const tableName = escapePgName(config.tableName);
    const foreignKey = escapePgName(config.foreignKeyField);

    // Get total count
    const countResult: any[] = await sequelize.query(
      `SELECT COUNT(*) as count
       FROM ${tableName}
       WHERE organization_id = :organization_id AND ${foreignKey} = :entity_id`,
      {
        replacements: { organization_id: organizationId, entity_id: entityId },
        type: QueryTypes.SELECT,
      }
    );
    const total = parseInt(countResult[0]?.count || "0", 10);

    // Get paginated history
    const history = await sequelize.query(
      `SELECT
        ch.*,
        u.name as user_name,
        u.surname as user_surname,
        u.email as user_email
       FROM ${tableName} ch
       LEFT JOIN users u ON ch.changed_by_user_id = u.id
       WHERE ch.organization_id = :organization_id AND ch.${foreignKey} = :entity_id
       ORDER BY ch.changed_at DESC
       LIMIT :limit OFFSET :offset`,
      {
        replacements: { organization_id: organizationId, entity_id: entityId, limit, offset },
        type: QueryTypes.SELECT,
      }
    );

    return {
      data: history,
      hasMore: offset + history.length < total,
      total,
    };
  } catch (error) {
    logger.error(`Error fetching ${entityType} change history: ${error}`);
    throw error;
  }
};

/**
 * Format field value for display using entity-specific formatters
 *
 * Includes error handling - if formatter fails, falls back to raw value.
 *
 * @param entityType - The type of entity
 * @param fieldName - The name of the field being formatted
 * @param value - The value to format
 * @returns Formatted string representation of the value
 */
export const formatFieldValue = async (
  entityType: EntityType,
  fieldName: string,
  value: any
): Promise<string> => {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  try {
    const config = getEntityConfig(entityType);

    // Check if entity has a custom formatter for this field
    if (config.fieldFormatters && config.fieldFormatters[fieldName]) {
      return await config.fieldFormatters[fieldName](value);
    }

    // Default to text formatter
    return await GENERIC_FORMATTERS.text(value);
  } catch (error) {
    // If formatter fails, log error and return raw value as fallback
    logger.error(
      `Error formatting field "${fieldName}" for ${entityType}: ${error} Value: ${JSON.stringify(value)}`
    );
    // Return stringified raw value as safe fallback
    return String(value);
  }
};

/**
 * Get formatted field name (from config or auto-format)
 *
 * @param entityType - The type of entity
 * @param fieldName - The database field name
 * @returns Human-readable field label from config or the original name
 */
export const getFieldLabel = (
  entityType: EntityType,
  fieldName: string
): string => {
  const config = getEntityConfig(entityType);
  return config.fieldLabels[fieldName] || fieldName;
};

/**
 * Track changes between old and new entity data
 *
 * Compares old and new data objects and returns an array of detected changes.
 *
 * @param entityType - The type of entity being tracked
 * @param oldData - The original entity data
 * @param newData - The updated entity data
 * @returns Array of field changes with formatted old and new values
 */
export const trackEntityChanges = async (
  entityType: EntityType,
  oldData: any,
  newData: any
): Promise<
  Array<{ fieldName: string; oldValue: string; newValue: string }>
> => {
  const changes: Array<{
    fieldName: string;
    oldValue: string;
    newValue: string;
  }> = [];
  const config = getEntityConfig(entityType);

  for (const field of config.fieldsToTrack) {
    const oldValue = oldData[field];
    const newValue = newData[field];

    // Skip if field is not being updated
    if (newValue === undefined) continue;

    // Format values for comparison
    const oldValueStr = await formatFieldValue(entityType, field, oldValue);
    const newValueStr = await formatFieldValue(entityType, field, newValue);

    // Record change if values differ
    if (oldValueStr !== newValueStr) {
      changes.push({
        fieldName: getFieldLabel(entityType, field),
        oldValue: oldValueStr,
        newValue: newValueStr,
      });
    }
  }

  return changes;
};

/**
 * Record entity creation with initial field values
 *
 * Records each non-empty initial field as a 'created' change entry.
 *
 * @param entityType - The type of entity being created
 * @param entityId - The ID of the newly created entity
 * @param changedByUserId - ID of the user creating the entity
 * @param organizationId - Organization ID for tenant isolation
 * @param entityData - The initial entity data
 * @param transaction - Optional database transaction
 */
export const recordEntityCreation = async (
  entityType: EntityType,
  entityId: number,
  changedByUserId: number,
  organizationId: number,
  entityData: any,
  transaction?: Transaction
): Promise<void> => {
  const config = getEntityConfig(entityType);

  // Record initial field values as changes
  for (const field of config.fieldsToTrack) {
    const value = entityData[field];
    if (value !== undefined && value !== null && value !== "") {
      await recordEntityChange(
        entityType,
        entityId,
        "created",
        changedByUserId,
        organizationId,
        getFieldLabel(entityType, field),
        "-",
        await formatFieldValue(entityType, field, value),
        transaction
      );
    }
  }
};

/**
 * Record entity deletion
 *
 * Records a 'deleted' change entry for the entity.
 *
 * @param entityType - The type of entity being deleted
 * @param entityId - The ID of the entity being deleted
 * @param changedByUserId - ID of the user deleting the entity
 * @param organizationId - Organization ID for tenant isolation
 * @param transaction - Optional database transaction
 */
export const recordEntityDeletion = async (
  entityType: EntityType,
  entityId: number,
  changedByUserId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  // Get the entity name from the config or use a default
  const entityName = entityType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  await recordEntityChange(
    entityType,
    entityId,
    "deleted",
    changedByUserId,
    organizationId,
    entityName,
    "Active",
    "Deleted",
    transaction
  );
};

/**
 * Record evidence being added to an entity
 *
 * Note: This is specific to entities that can have evidence mapped.
 *
 * @param entityType - The type of entity receiving evidence
 * @param entityId - The ID of the entity
 * @param changedByUserId - ID of the user adding the evidence
 * @param organizationId - Organization ID for tenant isolation
 * @param evidenceName - Name of the evidence being added
 * @param evidenceType - Type of the evidence being added
 * @param transaction - Optional database transaction
 */
export const recordEvidenceAddedToEntity = async (
  entityType: EntityType,
  entityId: number,
  changedByUserId: number,
  organizationId: number,
  evidenceName: string,
  evidenceType: string,
  transaction?: Transaction
): Promise<void> => {
  await recordEntityChange(
    entityType,
    entityId,
    "updated",
    changedByUserId,
    organizationId,
    "Evidence added",
    "-",
    `${evidenceName} (${evidenceType})`,
    transaction
  );
};

/**
 * Record evidence being removed from an entity
 *
 * Note: This is specific to entities that can have evidence mapped.
 *
 * @param entityType - The type of entity losing evidence
 * @param entityId - The ID of the entity
 * @param changedByUserId - ID of the user removing the evidence
 * @param organizationId - Organization ID for tenant isolation
 * @param evidenceName - Name of the evidence being removed
 * @param evidenceType - Type of the evidence being removed
 * @param transaction - Optional database transaction
 */
export const recordEvidenceRemovedFromEntity = async (
  entityType: EntityType,
  entityId: number,
  changedByUserId: number,
  organizationId: number,
  evidenceName: string,
  evidenceType: string,
  transaction?: Transaction
): Promise<void> => {
  await recordEntityChange(
    entityType,
    entityId,
    "updated",
    changedByUserId,
    organizationId,
    "Evidence removed",
    `${evidenceName} (${evidenceType})`,
    "-",
    transaction
  );
};

/**
 * Record evidence field changes for a specific entity
 *
 * Note: This is specific to entities that can have evidence mapped.
 *
 * @param entityType - The type of entity
 * @param entityId - The ID of the entity
 * @param changedByUserId - ID of the user making the change
 * @param organizationId - Organization ID for tenant isolation
 * @param evidenceName - Name of the evidence being modified
 * @param fieldName - Name of the evidence field being changed
 * @param oldValue - Previous value of the field
 * @param newValue - New value of the field
 * @param transaction - Optional database transaction
 */
export const recordEvidenceFieldChangeForEntity = async (
  entityType: EntityType,
  entityId: number,
  changedByUserId: number,
  organizationId: number,
  evidenceName: string,
  fieldName: string,
  oldValue: string,
  newValue: string,
  transaction?: Transaction
): Promise<void> => {
  await recordEntityChange(
    entityType,
    entityId,
    "updated",
    changedByUserId,
    organizationId,
    `Evidence: ${evidenceName} - ${fieldName}`,
    oldValue,
    newValue,
    transaction
  );
};
