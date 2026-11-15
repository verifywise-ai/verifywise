/**
 * @fileoverview Policy Folder Utility Functions
 *
 * Database query functions for policy-to-virtual-folder mappings.
 * Mirrors the file_folder_mappings pattern for policies.
 *
 * @module utils/policyFolder.utils
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { IVirtualFolder } from "../domain.layer/interfaces/i.virtualFolder";
import { assertOrgOwnsIds, parseBulkIds } from "./bulkAction.utils";

/**
 * Get all folders that a policy belongs to
 */
export const getPolicyFoldersQuery = async (
  organizationId: number,
  policyId: number,
  transaction?: Transaction,
): Promise<IVirtualFolder[]> => {
  const result = await sequelize.query(
    `SELECT vf.*
    FROM virtual_folders vf
    INNER JOIN policy_folder_mappings pfm
      ON vf.id = pfm.folder_id AND vf.organization_id = pfm.organization_id
    WHERE pfm.policy_id = :policyId AND pfm.organization_id = :organizationId
    ORDER BY vf.name ASC`,
    {
      replacements: { policyId, organizationId },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  return result as IVirtualFolder[];
};

/**
 * Get all policy IDs assigned to a specific folder
 */
export const getPolicyIdsInFolderQuery = async (
  organizationId: number,
  folderId: number,
): Promise<number[]> => {
  const result = await sequelize.query<{ policy_id: number }>(
    `SELECT policy_id FROM policy_folder_mappings
     WHERE folder_id = :folderId AND organization_id = :organizationId`,
    {
      replacements: { folderId, organizationId },
      type: QueryTypes.SELECT,
    },
  );
  return result.map((r) => r.policy_id);
};

/**
 * Number of policies assigned directly to each folder (no roll-up into
 * parents, same as the evidence file_count). The join to policy_manager keeps
 * a mapping whose policy is gone out of the count.
 *
 * @returns Map of folder id to count; a folder with no policies is absent.
 */
export const getPolicyFolderCountsQuery = async (
  organizationId: number,
): Promise<Record<number, number>> => {
  const rows = await sequelize.query<{ folder_id: number; policy_count: number }>(
    `SELECT pfm.folder_id, COUNT(DISTINCT pfm.policy_id)::int AS policy_count
     FROM policy_folder_mappings pfm
     INNER JOIN policy_manager pm
       ON pm.id = pfm.policy_id AND pm.organization_id = pfm.organization_id
     WHERE pfm.organization_id = :organizationId
     GROUP BY pfm.folder_id`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  );
  const counts: Record<number, number> = {};
  for (const row of rows) {
    counts[Number(row.folder_id)] = Number(row.policy_count);
  }
  return counts;
};

/**
 * Bulk update policy folder assignments (replace all folder assignments for a policy).
 * The caller checks the policy belongs to the organization; every folder id is
 * checked here.
 *
 * @throws ValidationException when a folder id is not a positive integer.
 * @throws ForbiddenException when a folder belongs to another organization.
 */
export const bulkUpdatePolicyFoldersQuery = async (
  organizationId: number,
  policyId: number,
  rawFolderIds: unknown[],
  userId: number,
  transaction?: Transaction,
): Promise<void> => {
  const folderIds =
    rawFolderIds.length > 0 ? parseBulkIds(rawFolderIds, { field: "folder_ids" }) : [];
  await assertOrgOwnsIds({ table: "virtual_folders", ids: folderIds, organizationId, transaction });

  // Delete existing assignments
  await sequelize.query(
    `DELETE FROM policy_folder_mappings
     WHERE policy_id = :policyId AND organization_id = :organizationId`,
    {
      replacements: { policyId, organizationId },
      transaction,
    },
  );

  // Add new assignments
  if (folderIds.length > 0) {
    const values = folderIds
      .map((_, i) => `(:policyId, :folder_id_${i}, :userId, :organizationId, NOW())`)
      .join(", ");

    const replacements: Record<string, unknown> = {
      policyId,
      userId,
      organizationId,
    };
    folderIds.forEach((folderId, i) => {
      replacements[`folder_id_${i}`] = folderId;
    });

    await sequelize.query(
      `INSERT INTO policy_folder_mappings (policy_id, folder_id, assigned_by, organization_id, assigned_at)
       VALUES ${values}`,
      {
        replacements,
        transaction,
      },
    );
  }
};
