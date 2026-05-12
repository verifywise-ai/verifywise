/**
 * @fileoverview Bulk-action queries for the `files` table.
 *
 * `files.tags` is stored as a JSONB array of strings. These helpers run
 * tenant-scoped UPDATEs that replace, union, or subtract a tag list against
 * the existing column. The caller must validate org ownership beforehand
 * (e.g. via `assertOrgOwnsIds`).
 *
 * @module utils/files/bulkFiles.utils
 */

import { Transaction } from "sequelize";
import { sequelize } from "../../database/db";

export type BulkTagMode = "set" | "add" | "remove";

interface BulkUpdateFileTagsParams {
  organizationId: number;
  ids: number[];
  tags: string[];
  mode: BulkTagMode;
  transaction: Transaction;
}

/**
 * Update `files.tags` for many files at once.
 *
 *   - "set":    replace existing tags with `tags`
 *   - "add":    union of existing tags and `tags`, deduped
 *   - "remove": existing tags minus any value in `tags`
 */
export const bulkUpdateFileTagsQuery = async ({
  organizationId,
  ids,
  tags,
  mode,
  transaction,
}: BulkUpdateFileTagsParams): Promise<void> => {
  if (ids.length === 0) return;

  const replacements = {
    organizationId,
    ids,
    tags: JSON.stringify(tags),
  };

  if (mode === "set") {
    await sequelize.query(
      `UPDATE files
         SET tags = CAST(:tags AS jsonb)
       WHERE organization_id = :organizationId
         AND id IN (:ids)`,
      { replacements, transaction },
    );
    return;
  }

  if (mode === "add") {
    await sequelize.query(
      `UPDATE files f
         SET tags = (
           SELECT COALESCE(jsonb_agg(DISTINCT t), '[]'::jsonb)
           FROM jsonb_array_elements_text(
             COALESCE(f.tags, '[]'::jsonb) || CAST(:tags AS jsonb)
           ) AS t
         )
       WHERE f.organization_id = :organizationId
         AND f.id IN (:ids)`,
      { replacements, transaction },
    );
    return;
  }

  // mode === "remove"
  await sequelize.query(
    `UPDATE files f
       SET tags = (
         SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
         FROM jsonb_array_elements_text(COALESCE(f.tags, '[]'::jsonb)) AS t
         WHERE t NOT IN (
           SELECT jsonb_array_elements_text(CAST(:tags AS jsonb))
         )
       )
     WHERE f.organization_id = :organizationId
       AND f.id IN (:ids)`,
    { replacements, transaction },
  );
};
