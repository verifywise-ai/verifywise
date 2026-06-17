/**
 * Extracts text from uploaded files and indexes it into the `files`
 * full-text search column.
 *
 * The indexing is best-effort: failures (e.g., unsupported MIME, corrupt
 * PDF) are logged and swallowed so that a failed indexing does not roll
 * back the file upload itself.
 */

import { sequelize } from "../../database/db";
import { extractText, normalizeText } from "./textExtractor";

/**
 * Run text extraction on the uploaded buffer and write `content_text` /
 * `content_search` into the file row. Failures are logged and discarded.
 */
export async function indexFileContent(
  fileId: number,
  buffer: Buffer,
  mimetype: string,
  orgId: number,
): Promise<void> {
  try {
    const rawText = await extractText(buffer, mimetype);
    const normalized = rawText ? normalizeText(rawText) : "";
    if (!normalized) return;

    await sequelize.query(
      `UPDATE files
       SET content_text = :content_text,
           content_search = to_tsvector('english', :content_text)
       WHERE organization_id = :orgId AND id = :fileId`,
      {
        replacements: { content_text: normalized, orgId, fileId },
        type: "UPDATE" as const,
      },
    );
  } catch (error) {
    console.error("Failed to extract or index file content for search:", error);
  }
}
