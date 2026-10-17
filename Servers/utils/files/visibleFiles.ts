/**
 * @fileoverview The one definition of a file the generic file routes may show.
 *
 * A bias audit stance PDF is a files row, but it is served only by the bias
 * audit stance endpoint, which applies the project-member rule with no
 * SuperAdmin bypass and checks the recorded hash. Every generic list, lookup
 * or link that takes a file from the files table applies VISIBLE_FILE_SQL, so
 * a stance PDF answers there exactly as a missing file does.
 *
 * This module imports nothing from the file utilities, so the repository,
 * the evidence-link utilities and fileUpload.utils can all import it without
 * an import cycle.
 *
 * @module utils/files/visibleFiles
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import type { FileSource } from "../../domain.layer/models/file/file.model";

/** Source of the PDF a bias audit stance cites by id and hash. Never deletable. */
export const BIAS_AUDIT_STANCE_SOURCE: FileSource = "Bias audit stance report";

/**
 * The table references VISIBLE_FILE_SQL accepts: the `f` alias most file
 * queries use, and the bare `files` table. The reference is interpolated into
 * SQL, so a new caller adds its exact alias here rather than passing a string.
 */
const VISIBLE_FILE_ALIASES = ["f", "files"] as const;
export type VisibleFileAlias = (typeof VISIBLE_FILE_ALIASES)[number];

/** The replacements every query using VISIBLE_FILE_SQL must pass. */
export const VISIBLE_FILE_REPLACEMENTS = { stanceSource: BIAS_AUDIT_STANCE_SOURCE } as const;

/**
 * True for a file the generic routes may show: anything but a stance PDF.
 * The source is bound as `:stanceSource` (VISIBLE_FILE_REPLACEMENTS), never
 * written as a literal. IS DISTINCT FROM keeps rows whose source is NULL.
 * The run-time check backs the type for callers that cast.
 */
export const VISIBLE_FILE_SQL = (alias: VisibleFileAlias): string => {
  if (!(VISIBLE_FILE_ALIASES as readonly string[]).includes(alias)) {
    throw new Error(`Unsupported files alias: ${String(alias)}`);
  }
  return `${alias}.source IS DISTINCT FROM :stanceSource`;
};

/**
 * Whether every id names a visible file in the organization. A missing id,
 * another organization's file and a stance PDF all answer false, so callers
 * refuse the three the same way. Duplicate ids count once.
 */
export async function allFilesVisibleQuery(
  fileIds: number[],
  organizationId: number,
  transaction?: Transaction | null,
): Promise<boolean> {
  const unique = [...new Set(fileIds)];
  if (unique.length === 0) return true;
  const rows = await sequelize.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM files
      WHERE files.id IN (:fileIds) AND files.organization_id = :organizationId
        AND ${VISIBLE_FILE_SQL("files")}`,
    {
      replacements: { fileIds: unique, organizationId, ...VISIBLE_FILE_REPLACEMENTS },
      type: QueryTypes.SELECT,
      ...(transaction && { transaction }),
    },
  );
  return Number(rows[0]?.count ?? 0) === unique.length;
}
