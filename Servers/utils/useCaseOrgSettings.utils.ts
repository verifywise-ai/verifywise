import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";

/**
 * Use case org-wide settings (use_case_org_settings): what a new use case
 * starts with. One row per org, lazily created — a missing row means no
 * defaults. Follows the file_org_settings pattern.
 */

/** Use case geography ids, as stored in projects.geography. */
export const USE_CASE_GEOGRAPHY_IDS = [1, 2, 3, 4, 5, 6] as const;

export interface UseCaseOrgSettings {
  organization_id: number;
  default_geography: number | null;
  default_framework_ids: number[];
}

/** PARTIAL update: only fields present (!== undefined) change. */
export interface UseCaseOrgSettingsUpdate {
  default_geography?: number | null;
  default_framework_ids?: number[];
}

/** Read the org's use case settings; a missing row resolves to no defaults. */
export const getUseCaseOrgSettings = async (
  organizationId: number,
  transaction?: Transaction,
): Promise<UseCaseOrgSettings> => {
  const rows = (await sequelize.query(
    `SELECT organization_id, default_geography, default_framework_ids
       FROM use_case_org_settings
      WHERE organization_id = :organizationId
      LIMIT 1`,
    { replacements: { organizationId }, type: QueryTypes.SELECT, transaction },
  )) as UseCaseOrgSettings[];
  return (
    rows[0] ?? {
      organization_id: organizationId,
      default_geography: null,
      default_framework_ids: [],
    }
  );
};

/**
 * Create-or-update the org's row. Only fields present in `update` change.
 * Caller validates the values (see projectLevelFrameworkIdsQuery).
 */
export const upsertUseCaseOrgSettings = async (
  organizationId: number,
  update: UseCaseOrgSettingsUpdate,
  transaction?: Transaction,
): Promise<UseCaseOrgSettings> => {
  const rows = (await sequelize.query(
    `INSERT INTO use_case_org_settings
       (organization_id, default_geography, default_framework_ids)
     VALUES
       (:organizationId, :geography, CAST(:frameworkIds AS int[]))
     ON CONFLICT (organization_id)
     DO UPDATE SET
       default_geography = CASE
         WHEN :geographyProvided THEN :geography
         ELSE use_case_org_settings.default_geography
       END,
       default_framework_ids = CASE
         WHEN :frameworksProvided THEN CAST(:frameworkIds AS int[])
         ELSE use_case_org_settings.default_framework_ids
       END,
       updated_at = now()
     RETURNING organization_id, default_geography, default_framework_ids`,
    {
      replacements: {
        organizationId,
        geographyProvided: update.default_geography !== undefined,
        geography: update.default_geography ?? null,
        frameworksProvided: update.default_framework_ids !== undefined,
        // A Postgres array literal: an empty list is '{}', never {NULL}. The
        // ids are integers the caller has checked, so the literal is safe;
        // it is still bound as a replacement, not interpolated.
        frameworkIds: `{${(update.default_framework_ids ?? []).map((id) => Math.trunc(id)).join(",")}}`,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as UseCaseOrgSettings[];
  return rows[0];
};

/**
 * Of `ids`, the ones that are project-level frameworks (can be attached to a
 * use case), in the order given.
 */
export const projectLevelFrameworkIdsQuery = async (
  ids: number[],
  transaction?: Transaction,
): Promise<number[]> => {
  if (ids.length === 0) return [];
  const rows = (await sequelize.query(
    `SELECT id FROM frameworks WHERE id IN (:ids) AND is_organizational = false`,
    { replacements: { ids }, type: QueryTypes.SELECT, transaction },
  )) as { id: number }[];
  const found = new Set(rows.map((r) => Number(r.id)));
  return ids.filter((id) => found.has(id));
};
