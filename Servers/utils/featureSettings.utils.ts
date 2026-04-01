/**
 * Feature Settings Utilities
 *
 * Query helpers for the feature_settings table (shared schema with organization_id).
 */

import { sequelize } from "../database/db";
import { Transaction } from "sequelize";

interface FeatureSettingsRow {
  id: number;
  lifecycle_enabled: boolean;
  audit_ledger_enabled: boolean;
  updated_at: string;
  updated_by: number | null;
}

interface FeatureSettingsUpdates {
  lifecycle_enabled?: boolean;
  audit_ledger_enabled?: boolean;
  updated_by?: number;
}

/**
 * Get feature settings for an organization (always returns a row — created by migration).
 */
export async function getFeatureSettingsQuery(
  organizationId: number
): Promise<FeatureSettingsRow> {
  const [rows] = await sequelize.query(
    `SELECT * FROM feature_settings WHERE organization_id = :organizationId LIMIT 1`,
    { replacements: { organizationId } }
  );

  // Return defaults if no row exists yet
  if ((rows as any[]).length === 0) {
    return {
      id: 1,
      lifecycle_enabled: true,
      audit_ledger_enabled: true,
      updated_at: new Date().toISOString(),
      updated_by: null,
    };
  }

  return (rows as any[])[0];
}

/**
 * Update feature settings for an organization.
 */
export async function updateFeatureSettingsQuery(
  organizationId: number,
  updates: FeatureSettingsUpdates,
  transaction?: Transaction
): Promise<FeatureSettingsRow> {
  const setClauses = ["updated_at = NOW()"];
  const replacements: Record<string, any> = { organizationId };

  if (updates.lifecycle_enabled !== undefined) {
    setClauses.push("lifecycle_enabled = :lifecycle_enabled");
    replacements.lifecycle_enabled = updates.lifecycle_enabled;
  }

  if (updates.audit_ledger_enabled !== undefined) {
    setClauses.push("audit_ledger_enabled = :audit_ledger_enabled");
    replacements.audit_ledger_enabled = updates.audit_ledger_enabled;
  }

  if (updates.updated_by !== undefined) {
    setClauses.push("updated_by = :updated_by");
    replacements.updated_by = updates.updated_by;
  }

  const [result] = await sequelize.query(
    `UPDATE feature_settings
     SET ${setClauses.join(", ")}
     WHERE organization_id = :organizationId
     RETURNING *`,
    {
      replacements,
      ...(transaction ? { transaction } : {}),
    }
  );

  return (result as any[])[0];
}
