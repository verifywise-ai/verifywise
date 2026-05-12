/**
 * @fileoverview AI Detection Suppression Database Utils
 *
 * Tenant-scoped raw-SQL queries for suppression rules. All queries include
 * `organization_id` in their WHERE clause for shared-schema multi-tenancy.
 *
 * @module utils/aiDetectionSuppression
 */

import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import { ISuppression, ICreateSuppressionInput } from "../domain.layer/interfaces/i.aiDetection";

function validateOrganizationId(organizationId: number): void {
  if (!organizationId || !Number.isInteger(organizationId) || organizationId <= 0) {
    throw new Error(`Invalid organization identifier: ${organizationId}`);
  }
}

/**
 * Insert a new suppression rule.
 */
export async function createSuppressionQuery(
  organizationId: number,
  input: ICreateSuppressionInput,
  userId: number,
): Promise<ISuppression> {
  validateOrganizationId(organizationId);
  const query = `
    INSERT INTO ai_detection_suppressions (
      organization_id,
      match_type,
      field,
      value,
      reason,
      expires_at,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      :organizationId,
      :match_type,
      :field,
      :value,
      :reason,
      :expires_at,
      :user_id,
      NOW(),
      NOW()
    )
    RETURNING *;
  `;

  const results = await sequelize.query(query, {
    replacements: {
      organizationId,
      match_type: input.match_type,
      field: input.field,
      value: input.value,
      reason: input.reason ?? null,
      expires_at: input.expires_at ?? null,
      user_id: userId,
    },
    type: QueryTypes.INSERT,
  });

  return (results as unknown as ISuppression[][])[0][0];
}

/**
 * List suppression rules for an organization. Active rules only by default
 * (expired rules excluded unless `includeExpired` is true).
 */
export async function listSuppressionsQuery(
  organizationId: number,
  options: { includeExpired?: boolean } = {},
): Promise<ISuppression[]> {
  validateOrganizationId(organizationId);
  const expiryFilter = options.includeExpired
    ? ""
    : "AND (expires_at IS NULL OR expires_at > NOW())";
  const query = `
    SELECT *
    FROM ai_detection_suppressions
    WHERE organization_id = :organizationId
    ${expiryFilter}
    ORDER BY created_at DESC;
  `;

  const results = await sequelize.query(query, {
    replacements: { organizationId },
    type: QueryTypes.SELECT,
  });

  return results as unknown as ISuppression[];
}

/**
 * Get currently-active suppression rules for an organization.
 * Used by the matching engine at scan completion.
 */
export async function getActiveSuppressionsQuery(organizationId: number): Promise<ISuppression[]> {
  validateOrganizationId(organizationId);
  const query = `
    SELECT *
    FROM ai_detection_suppressions
    WHERE organization_id = :organizationId
      AND (expires_at IS NULL OR expires_at > NOW());
  `;

  const results = await sequelize.query(query, {
    replacements: { organizationId },
    type: QueryTypes.SELECT,
  });

  return results as unknown as ISuppression[];
}

/**
 * Delete a suppression rule. Returns true if a row was deleted.
 */
export async function deleteSuppressionQuery(id: number, organizationId: number): Promise<boolean> {
  validateOrganizationId(organizationId);
  const [rows] = await sequelize.query(
    `DELETE FROM ai_detection_suppressions WHERE id = :id AND organization_id = :organizationId RETURNING id`,
    {
      replacements: { id, organizationId },
    },
  );

  return (rows as unknown[]).length > 0;
}
