import ExcelJS from "exceljs";
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";

/**
 * Server-side framework-import extension logic (#5254). Two entry points:
 *   - buildExcelTemplate() → an .xlsx buffer describing the framework,
 *     its topics, and their subtopics in one worksheet.
 *   - importFramework() → validates every row, then upserts an
 *     organization-scoped `imported_frameworks` row with its topics and
 *     subtopics in a single transaction. Re-uploading the same framework
 *     name replaces its structure, so the contract is idempotent. A batch
 *     with any validation error inserts nothing.
 *
 * Imported frameworks are deliberately NOT rows in the global `frameworks`
 * catalog: that table is shared by every organization and feeds the use case
 * framework pickers, and an imported framework has no struct tables to
 * assess against. See migration 20261111092002-imported-framework-storage.js.
 */

/** Upper bound on rows per upload; keeps one transaction and one request bounded. */
export const MAX_IMPORT_ROWS = 5000;

/** Rows per multi-row INSERT (7 bind parameters each, far below Postgres' 65535 cap). */
const INSERT_CHUNK_SIZE = 1000;

// ---------------------------------------------------------------------------
// EXCEL TEMPLATE
// ---------------------------------------------------------------------------

export async function buildExcelTemplate(
  organizationId: number,
): Promise<{ buffer: Buffer; filename: string }> {
  void organizationId; // template is org-agnostic, mirroring the risk-import signature
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Framework");

  worksheet.columns = [
    { key: "framework_name", header: "Framework Name *", width: 30 },
    { key: "framework_description", header: "Framework Description", width: 40 },
    { key: "topic_number", header: "Topic Number *", width: 18 },
    { key: "topic_name", header: "Topic Name *", width: 35 },
    { key: "topic_description", header: "Topic Description", width: 40 },
    { key: "subtopic_number", header: "Subtopic Number", width: 18 },
    { key: "subtopic_name", header: "Subtopic Name", width: 35 },
    { key: "subtopic_description", header: "Subtopic Description", width: 40 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF13715B" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 25;

  worksheet.addRow({
    framework_name: "Example Internal AI Policy",
    framework_description: "Our organization's internal AI governance policy",
    topic_number: "1",
    topic_name: "Governance",
    topic_description: "Roles, responsibilities and oversight",
    subtopic_number: "1.1",
    subtopic_name: "Accountability",
    subtopic_description: "Named owner for every AI system",
  });
  worksheet.addRow({
    framework_name: "Example Internal AI Policy",
    framework_description: "Our organization's internal AI governance policy",
    topic_number: "2",
    topic_name: "Risk management",
    topic_description: "Risk identification and mitigation",
    subtopic_number: "2.1",
    subtopic_name: "Risk register",
    subtopic_description: "Maintain a register of AI risks",
  });

  worksheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arrayBuffer as ArrayBuffer),
    filename: "framework_import_template.xlsx",
  };
}

// ---------------------------------------------------------------------------
// IMPORT
// ---------------------------------------------------------------------------

export interface FrameworkImportRow {
  framework_name?: unknown;
  framework_description?: unknown;
  topic_number?: unknown;
  topic_name?: unknown;
  topic_description?: unknown;
  subtopic_number?: unknown;
  subtopic_name?: unknown;
  subtopic_description?: unknown;
}

export interface FrameworkImportError {
  row: number;
  field: string;
  message: string;
}

export interface FrameworkImportResult {
  success: boolean;
  imported_framework_id?: number;
  imported_topics: number;
  imported_subtopics: number;
  failed: number;
  errors: FrameworkImportError[];
  importedAt: string;
}

export interface ImportedSubtopic {
  id: number;
  subtopic_number: string;
  name: string;
  description: string | null;
  order_no: number;
}

export interface ImportedTopic {
  id: number;
  topic_number: string;
  name: string;
  description: string | null;
  order_no: number;
  subtopics: ImportedSubtopic[];
}

export interface ImportedFramework {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  topics: ImportedTopic[];
}

export interface ImportedFrameworkPatch {
  name?: unknown;
  description?: unknown;
  is_active?: unknown;
}

/**
 * Flatten an ExcelJS cell value to trimmed text. Cells arrive as primitives,
 * Dates, rich text ({richText}), hyperlinks ({text}), formulas ({formula,
 * result}) or errors ({error}); String() on the objects gives "[object Object]".
 */
export function asText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const cell = value as {
      richText?: Array<{ text?: unknown }>;
      text?: unknown;
      formula?: unknown;
      sharedFormula?: unknown;
      result?: unknown;
      error?: unknown;
    };
    if (Array.isArray(cell.richText)) {
      return cell.richText
        .map((r) => (r?.text === undefined || r?.text === null ? "" : String(r.text)))
        .join("")
        .trim();
    }
    if ("formula" in cell || "sharedFormula" in cell || "result" in cell) {
      return asText(cell.result);
    }
    if (cell.text !== undefined) return asText(cell.text);
    if (cell.error !== undefined) return undefined;
    return undefined;
  }
  return String(value).trim();
}

function allFailed(errors: FrameworkImportError[], total: number): FrameworkImportResult {
  return {
    success: false,
    imported_topics: 0,
    imported_subtopics: 0,
    failed: total,
    errors,
    importedAt: new Date().toISOString(),
  };
}

export function validateRow(row: FrameworkImportRow, rowIndex: number): FrameworkImportError[] {
  const errors: FrameworkImportError[] = [];

  const frameworkName = asText(row.framework_name);
  if (!frameworkName) {
    errors.push({ row: rowIndex, field: "framework_name", message: "Framework name is required" });
  } else if (frameworkName.length < 2 || frameworkName.length > 255) {
    errors.push({
      row: rowIndex,
      field: "framework_name",
      message: "Framework name must be between 2 and 255 characters",
    });
  }

  const frameworkDescription = asText(row.framework_description);
  if (frameworkDescription && frameworkDescription.length > 1000) {
    errors.push({
      row: rowIndex,
      field: "framework_description",
      message: "Framework description must not exceed 1000 characters",
    });
  }

  const topicNumber = asText(row.topic_number);
  if (!topicNumber) {
    errors.push({ row: rowIndex, field: "topic_number", message: "Topic number is required" });
  } else if (topicNumber.length > 50) {
    errors.push({
      row: rowIndex,
      field: "topic_number",
      message: "Topic number must not exceed 50 characters",
    });
  }

  const topicName = asText(row.topic_name);
  if (!topicName) {
    errors.push({ row: rowIndex, field: "topic_name", message: "Topic name is required" });
  } else if (topicName.length > 500) {
    errors.push({
      row: rowIndex,
      field: "topic_name",
      message: "Topic name must not exceed 500 characters",
    });
  }

  const topicDescription = asText(row.topic_description);
  if (topicDescription && topicDescription.length > 1000) {
    errors.push({
      row: rowIndex,
      field: "topic_description",
      message: "Topic description must not exceed 1000 characters",
    });
  }

  const subtopicNumber = asText(row.subtopic_number);
  const subtopicName = asText(row.subtopic_name);
  if (subtopicName && !subtopicNumber) {
    errors.push({
      row: rowIndex,
      field: "subtopic_number",
      message: "Subtopic number is required when subtopic name is provided",
    });
  }
  if (subtopicNumber && !subtopicName) {
    errors.push({
      row: rowIndex,
      field: "subtopic_name",
      message: "Subtopic name is required when subtopic number is provided",
    });
  }
  if (subtopicNumber && subtopicNumber.length > 50) {
    errors.push({
      row: rowIndex,
      field: "subtopic_number",
      message: "Subtopic number must not exceed 50 characters",
    });
  }
  if (subtopicName && subtopicName.length > 500) {
    errors.push({
      row: rowIndex,
      field: "subtopic_name",
      message: "Subtopic name must not exceed 500 characters",
    });
  }

  const subtopicDescription = asText(row.subtopic_description);
  if (subtopicDescription && subtopicDescription.length > 1000) {
    errors.push({
      row: rowIndex,
      field: "subtopic_description",
      message: "Subtopic description must not exceed 1000 characters",
    });
  }

  return errors;
}

/**
 * Cross-row checks that the per-row validation cannot see: one framework per
 * sheet, a topic number always carrying the same topic name, and a subtopic
 * number used at most once per topic (the storage's unique key — without this
 * check a duplicate surfaced as a misleading name conflict).
 */
export function validateStructure(rows: FrameworkImportRow[]): FrameworkImportError[] {
  const errors: FrameworkImportError[] = [];
  const frameworkName = asText(rows[0]?.framework_name);
  const topicNames = new Map<string, { name: string; row: number }>();
  const subtopicRows = new Map<string, number>();

  rows.forEach((row, i) => {
    const rowIndex = i + 2; // header row is row 1
    const name = asText(row.framework_name);
    if (frameworkName && name && name !== frameworkName) {
      errors.push({
        row: rowIndex,
        field: "framework_name",
        message: "All rows must define the same framework",
      });
    }

    const topicNumber = asText(row.topic_number);
    const topicName = asText(row.topic_name);
    if (!topicNumber || !topicName) return;

    const seen = topicNames.get(topicNumber);
    if (!seen) {
      topicNames.set(topicNumber, { name: topicName, row: rowIndex });
    } else if (seen.name !== topicName) {
      errors.push({
        row: rowIndex,
        field: "topic_name",
        message: `Topic ${topicNumber} is named "${seen.name}" on row ${seen.row}; every row of a topic must use the same name`,
      });
    }

    const subtopicNumber = asText(row.subtopic_number);
    if (!subtopicNumber) return;
    const key = `${topicNumber}\u0000${subtopicNumber}`;
    const firstRow = subtopicRows.get(key);
    if (firstRow === undefined) {
      subtopicRows.set(key, rowIndex);
    } else {
      errors.push({
        row: rowIndex,
        field: "subtopic_number",
        message: `Subtopic ${subtopicNumber} already appears under topic ${topicNumber} on row ${firstRow}`,
      });
    }
  });

  return errors;
}

interface ParsedTopic {
  topicNumber: string;
  name: string;
  description: string | null;
}

interface ParsedSubtopic {
  topicNumber: string;
  subtopicNumber: string;
  name: string;
  description: string | null;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function deleteImportedStructure(
  frameworkId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(
    `DELETE FROM imported_framework_subtopics
      WHERE organization_id = :organizationId
        AND topic_id IN (
          SELECT id FROM imported_framework_topics
           WHERE organization_id = :organizationId AND framework_id = :frameworkId
        );`,
    { replacements: { frameworkId, organizationId }, transaction },
  );
  await sequelize.query(
    `DELETE FROM imported_framework_topics
      WHERE organization_id = :organizationId AND framework_id = :frameworkId;`,
    { replacements: { frameworkId, organizationId }, transaction },
  );
}

export async function importFramework(
  rows: FrameworkImportRow[],
  organizationId: number,
  userId: number,
): Promise<FrameworkImportResult> {
  if (rows.length > MAX_IMPORT_ROWS) {
    return allFailed(
      [
        {
          row: 0,
          field: "file",
          message: `A file can have at most ${MAX_IMPORT_ROWS} rows; split the framework or remove empty rows`,
        },
      ],
      rows.length,
    );
  }

  const errors: FrameworkImportError[] = [];
  rows.forEach((row, i) => {
    // +2 accounts for the header row (row 1) plus 1-based indexing.
    errors.push(...validateRow(row, i + 2));
  });
  errors.push(...validateStructure(rows));

  if (errors.length > 0) {
    return allFailed(
      errors.sort((a, b) => a.row - b.row),
      rows.length,
    );
  }

  const frameworkName = asText(rows[0].framework_name)!;
  const frameworkDescription = asText(rows[0].framework_description) ?? null;

  // Parse + dedupe topics, preserving first-seen order.
  const topicMap = new Map<string, ParsedTopic>();
  const subtopics: ParsedSubtopic[] = [];
  for (const row of rows) {
    const topicNumber = asText(row.topic_number)!;
    if (!topicMap.has(topicNumber)) {
      topicMap.set(topicNumber, {
        topicNumber,
        name: asText(row.topic_name)!,
        description: asText(row.topic_description) ?? null,
      });
    }
    const subtopicNumber = asText(row.subtopic_number);
    const subtopicName = asText(row.subtopic_name);
    if (subtopicNumber && subtopicName) {
      subtopics.push({
        topicNumber,
        subtopicNumber,
        name: subtopicName,
        description: asText(row.subtopic_description) ?? null,
      });
    }
  }

  const transaction = await sequelize.transaction();

  try {
    // Upsert on (organization, lower(name)): a re-upload replaces the
    // previous structure instead of creating a duplicate.
    const existing = (await sequelize.query(
      `SELECT id FROM imported_frameworks
        WHERE organization_id = :organizationId AND lower(name) = lower(:frameworkName)
        LIMIT 1;`,
      { replacements: { organizationId, frameworkName }, transaction, type: QueryTypes.SELECT },
    )) as Array<{ id: number }>;

    let frameworkId: number;
    if (existing.length > 0) {
      frameworkId = existing[0].id;
      await sequelize.query(
        `UPDATE imported_frameworks
            SET description = :frameworkDescription, updated_at = NOW()
          WHERE id = :frameworkId AND organization_id = :organizationId;`,
        { replacements: { frameworkId, organizationId, frameworkDescription }, transaction },
      );
      await deleteImportedStructure(frameworkId, organizationId, transaction);
    } else {
      const inserted = (await sequelize.query(
        `INSERT INTO imported_frameworks
           (organization_id, name, description, is_active, created_by, created_at, updated_at)
         VALUES
           (:organizationId, :frameworkName, :frameworkDescription, TRUE, :userId, NOW(), NOW())
         RETURNING id;`,
        {
          replacements: { organizationId, frameworkName, frameworkDescription, userId },
          transaction,
          type: QueryTypes.SELECT,
        },
      )) as Array<{ id: number }>;
      frameworkId = inserted[0].id;
    }

    // Topics: one multi-row INSERT per chunk.
    const topicIds = new Map<string, number>();
    const topics = Array.from(topicMap.values());
    let topicOrder = 0;
    for (const part of chunk(topics, INSERT_CHUNK_SIZE)) {
      const replacements: Record<string, unknown> = { organizationId, frameworkId };
      const values = part.map((topic, i) => {
        replacements[`n${i}`] = topic.topicNumber;
        replacements[`t${i}`] = topic.name;
        replacements[`d${i}`] = topic.description;
        replacements[`o${i}`] = topicOrder++;
        return `(:organizationId, :frameworkId, :n${i}, :t${i}, :d${i}, :o${i}, NOW(), NOW())`;
      });
      const inserted = (await sequelize.query(
        `INSERT INTO imported_framework_topics
           (organization_id, framework_id, topic_number, name, description, order_no, created_at, updated_at)
         VALUES ${values.join(", ")}
         RETURNING id, topic_number;`,
        { replacements, transaction, type: QueryTypes.SELECT },
      )) as Array<{ id: number; topic_number: string }>;
      for (const row of inserted) topicIds.set(row.topic_number, row.id);
    }

    // Subtopics: ordered per topic, one multi-row INSERT per chunk.
    const subtopicOrder = new Map<string, number>();
    for (const part of chunk(subtopics, INSERT_CHUNK_SIZE)) {
      const replacements: Record<string, unknown> = { organizationId };
      const values = part.map((sub, i) => {
        const order = subtopicOrder.get(sub.topicNumber) ?? 0;
        subtopicOrder.set(sub.topicNumber, order + 1);
        replacements[`p${i}`] = topicIds.get(sub.topicNumber)!;
        replacements[`n${i}`] = sub.subtopicNumber;
        replacements[`t${i}`] = sub.name;
        replacements[`d${i}`] = sub.description;
        replacements[`o${i}`] = order;
        return `(:organizationId, :p${i}, :n${i}, :t${i}, :d${i}, :o${i}, NOW(), NOW())`;
      });
      await sequelize.query(
        `INSERT INTO imported_framework_subtopics
           (organization_id, topic_id, subtopic_number, name, description, order_no, created_at, updated_at)
         VALUES ${values.join(", ")};`,
        { replacements, transaction },
      );
    }

    await transaction.commit();
    return {
      success: true,
      imported_framework_id: frameworkId,
      imported_topics: topicMap.size,
      imported_subtopics: subtopics.length,
      failed: 0,
      errors: [],
      importedAt: new Date().toISOString(),
    };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      // rollback failure — swallow so the outer error propagates
    }
    // Validation rules out duplicate topics/subtopics, so the only unique
    // index left is the framework name: two uploads of the same new name racing.
    if (isUniqueViolation(err)) {
      throw new ConflictException(
        `A framework named "${frameworkName}" already exists for this organization`,
        "Framework",
        "name",
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// LIST / UPDATE / DELETE
// ---------------------------------------------------------------------------

export async function listImportedFrameworksQuery(
  organizationId: number,
): Promise<ImportedFramework[]> {
  return (await sequelize.query(
    `
    SELECT f.id, f.name, f.description, f.is_active, f.created_at, f.updated_at,
           COALESCE(t.topics, '[]'::jsonb) AS topics
      FROM imported_frameworks f
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'id', topic.id,
                   'topic_number', topic.topic_number,
                   'name', topic.name,
                   'description', topic.description,
                   'order_no', topic.order_no,
                   'subtopics', COALESCE(st.subtopics, '[]'::jsonb)
                 ) ORDER BY topic.order_no, topic.id
               ) AS topics
          FROM imported_framework_topics topic
          LEFT JOIN LATERAL (
            SELECT jsonb_agg(
                     jsonb_build_object(
                       'id', sub.id,
                       'subtopic_number', sub.subtopic_number,
                       'name', sub.name,
                       'description', sub.description,
                       'order_no', sub.order_no
                     ) ORDER BY sub.order_no, sub.id
                   ) AS subtopics
              FROM imported_framework_subtopics sub
             WHERE sub.topic_id = topic.id AND sub.organization_id = :organizationId
          ) st ON TRUE
         WHERE topic.framework_id = f.id AND topic.organization_id = :organizationId
      ) t ON TRUE
     WHERE f.organization_id = :organizationId
     ORDER BY f.created_at DESC, f.id ASC;
    `,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as unknown as ImportedFramework[];
}

/**
 * Guarded write helper: only imported frameworks owned by this organization
 * may be mutated. Another org's id misses the WHERE clause and surfaces as
 * 404 (it is not addressable in this org's tenant).
 */
async function findImportedFrameworkId(
  id: number,
  organizationId: number,
  transaction: Transaction,
): Promise<number> {
  const rows = (await sequelize.query(
    `SELECT id FROM imported_frameworks
      WHERE id = :id AND organization_id = :organizationId
      LIMIT 1;`,
    { replacements: { id, organizationId }, transaction, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  if (rows.length === 0) {
    throw new NotFoundException("Imported framework not found", "Framework", id);
  }
  return rows[0].id;
}

interface NormalizedPatch {
  name?: string;
  description?: string | null;
  is_active?: boolean;
}

/** Type-check a PATCH body; a wrong type is a 400, never a 500. */
export function normalizePatch(patch: ImportedFrameworkPatch): NormalizedPatch {
  const out: NormalizedPatch = {};
  if (patch.name !== undefined) {
    if (typeof patch.name !== "string") {
      throw new ValidationException("Framework name must be text", "name", patch.name);
    }
    const name = patch.name.trim();
    if (name.length < 2 || name.length > 255) {
      throw new ValidationException(
        "Framework name must be between 2 and 255 characters",
        "name",
        patch.name,
      );
    }
    out.name = name;
  }
  if (patch.description !== undefined) {
    if (patch.description !== null && typeof patch.description !== "string") {
      throw new ValidationException(
        "Framework description must be text",
        "description",
        patch.description,
      );
    }
    if (typeof patch.description === "string" && patch.description.length > 1000) {
      throw new ValidationException(
        "Framework description must not exceed 1000 characters",
        "description",
        patch.description,
      );
    }
    out.description = patch.description;
  }
  if (patch.is_active !== undefined) {
    if (typeof patch.is_active !== "boolean") {
      throw new ValidationException(
        "is_active must be true or false",
        "is_active",
        patch.is_active,
      );
    }
    out.is_active = patch.is_active;
  }
  return out;
}

export async function updateImportedFrameworkQuery(
  id: number,
  organizationId: number,
  rawPatch: ImportedFrameworkPatch,
): Promise<void> {
  const patch = normalizePatch(rawPatch);

  const transaction = await sequelize.transaction();
  try {
    await findImportedFrameworkId(id, organizationId, transaction);
    await sequelize.query(
      `UPDATE imported_frameworks
          SET name = COALESCE(:name, name),
              description = CASE WHEN :hasDescription THEN :description ELSE description END,
              is_active = COALESCE(:isActive, is_active),
              updated_at = NOW()
        WHERE id = :id AND organization_id = :organizationId;`,
      {
        replacements: {
          id,
          organizationId,
          name: patch.name ?? null,
          hasDescription: patch.description !== undefined,
          description: patch.description ?? null,
          isActive: patch.is_active ?? null,
        },
        transaction,
      },
    );
    await transaction.commit();
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      // rollback failure — swallow so the outer error propagates
    }
    if (isUniqueViolation(err)) {
      throw new ConflictException(
        "A framework with this name already exists for this organization",
        "Framework",
        "name",
      );
    }
    throw err;
  }
}

export async function deleteImportedFrameworkQuery(
  id: number,
  organizationId: number,
): Promise<void> {
  const transaction = await sequelize.transaction();
  try {
    await findImportedFrameworkId(id, organizationId, transaction);
    // Topics/subtopics cascade on framework delete via their FKs; delete
    // explicitly anyway so removal stays scoped to this org's rows.
    await deleteImportedStructure(id, organizationId, transaction);
    await sequelize.query(
      `DELETE FROM imported_frameworks
        WHERE id = :id AND organization_id = :organizationId;`,
      { replacements: { id, organizationId }, transaction },
    );
    await transaction.commit();
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      // rollback failure — swallow so the outer error propagates
    }
    throw err;
  }
}
