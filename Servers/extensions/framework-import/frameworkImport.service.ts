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
 *     organization-scoped `frameworks` row (source='imported') with its
 *     topics/subtopics in a single transaction. Re-uploading the same
 *     framework name replaces its structure — the contract is idempotent.
 *     A batch with any validation error inserts nothing.
 */

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
  framework_name?: string;
  framework_description?: string;
  topic_number?: string | number;
  topic_name?: string;
  topic_description?: string;
  subtopic_number?: string | number;
  subtopic_name?: string;
  subtopic_description?: string;
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
  name?: string;
  description?: string | null;
  is_active?: boolean;
}

/** ExcelJS cells can arrive as rich-text objects — flatten to plain text. */
function asText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object") {
    const rich = (value as { richText?: Array<{ text: string }> }).richText;
    if (Array.isArray(rich))
      return rich
        .map((r) => r.text)
        .join("")
        .trim();
    if ((value as { text?: string }).text !== undefined) {
      return String((value as { text: string }).text).trim();
    }
    return String(value).trim();
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

interface ParsedTopic {
  topicNumber: string;
  name: string;
  description: string | null;
}

interface ParsedRow {
  topic: ParsedTopic;
  subtopic: {
    subtopicNumber: string;
    name: string;
    description: string | null;
  } | null;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
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
  void userId; // reserved for audit attribution, mirroring the risk-import signature
  const errors: FrameworkImportError[] = [];

  rows.forEach((row, i) => {
    // +2 accounts for the header row (row 1) plus 1-based indexing.
    errors.push(...validateRow(row, i + 2));
  });

  // Every row belongs to the same framework — the sheet describes ONE
  // framework's structure, so a name change mid-sheet is a data error.
  const frameworkName = asText(rows[0]?.framework_name);
  if (frameworkName) {
    rows.forEach((row, i) => {
      const name = asText(row.framework_name);
      if (name && name !== frameworkName) {
        errors.push({
          row: i + 2,
          field: "framework_name",
          message: "All rows must define the same framework",
        });
      }
    });
  }

  if (errors.length > 0) {
    return allFailed(errors, rows.length);
  }

  const frameworkDescription = asText(rows[0]?.framework_description) ?? null;

  // Parse + dedupe topics, preserving first-seen order.
  const topicMap = new Map<string, ParsedTopic>();
  const parsedRows: ParsedRow[] = [];
  for (const row of rows) {
    const topicNumber = asText(row.topic_number)!;
    const topic: ParsedTopic = {
      topicNumber,
      name: asText(row.topic_name)!,
      description: asText(row.topic_description) ?? null,
    };
    if (!topicMap.has(topicNumber)) {
      topicMap.set(topicNumber, topic);
    }
    const subtopicNumber = asText(row.subtopic_number);
    const subtopicName = asText(row.subtopic_name);
    parsedRows.push({
      topic,
      subtopic:
        subtopicNumber && subtopicName
          ? {
              subtopicNumber,
              name: subtopicName,
              description: asText(row.subtopic_description) ?? null,
            }
          : null,
    });
  }

  const transaction = await sequelize.transaction();

  try {
    // Upsert on (organization, name) among imported frameworks — a re-upload
    // replaces the previous structure instead of creating a duplicate.
    const existing = (await sequelize.query(
      `SELECT id FROM frameworks
        WHERE organization_id = :organizationId AND name = :frameworkName AND source = 'imported'
        LIMIT 1;`,
      { replacements: { organizationId, frameworkName }, transaction, type: QueryTypes.SELECT },
    )) as Array<{ id: number }>;

    let frameworkId: number;
    if (existing.length > 0) {
      frameworkId = existing[0].id;
      await sequelize.query(
        `UPDATE frameworks
            SET description = :frameworkDescription, updated_at = NOW()
          WHERE id = :frameworkId;`,
        { replacements: { frameworkId, frameworkDescription }, transaction },
      );
      await deleteImportedStructure(frameworkId, organizationId, transaction);
    } else {
      const inserted = (await sequelize.query(
        `INSERT INTO frameworks
           (name, description, version, is_organizational, is_active, is_demo,
            organization_id, source, created_at, updated_at)
         VALUES
           (:frameworkName, :frameworkDescription, '1.0', FALSE, TRUE, FALSE,
            :organizationId, 'imported', NOW(), NOW())
         RETURNING id;`,
        {
          replacements: { organizationId, frameworkName, frameworkDescription },
          transaction,
          type: QueryTypes.SELECT,
        },
      )) as Array<{ id: number }>;
      frameworkId = inserted[0].id;
    }

    const topicIds = new Map<string, number>();
    let orderNo = 0;
    for (const [topicNumber, topic] of topicMap) {
      const inserted = (await sequelize.query(
        `INSERT INTO imported_framework_topics
           (organization_id, framework_id, topic_number, name, description, order_no, created_at, updated_at)
         VALUES
           (:organizationId, :frameworkId, :topicNumber, :name, :description, :orderNo, NOW(), NOW())
         RETURNING id;`,
        {
          replacements: {
            organizationId,
            frameworkId,
            topicNumber,
            name: topic.name,
            description: topic.description,
            orderNo: orderNo++,
          },
          transaction,
          type: QueryTypes.SELECT,
        },
      )) as Array<{ id: number }>;
      topicIds.set(topicNumber, inserted[0].id);
    }

    const subtopicOrder = new Map<number, number>();
    let importedSubtopics = 0;
    for (const { topic, subtopic } of parsedRows) {
      if (!subtopic) continue;
      const topicId = topicIds.get(topic.topicNumber)!;
      const order = subtopicOrder.get(topicId) ?? 0;
      subtopicOrder.set(topicId, order + 1);
      await sequelize.query(
        `INSERT INTO imported_framework_subtopics
           (organization_id, topic_id, subtopic_number, name, description, order_no, created_at, updated_at)
         VALUES
           (:organizationId, :topicId, :subtopicNumber, :name, :description, :orderNo, NOW(), NOW());`,
        {
          replacements: {
            organizationId,
            topicId,
            subtopicNumber: subtopic.subtopicNumber,
            name: subtopic.name,
            description: subtopic.description,
            orderNo: order,
          },
          transaction,
        },
      );
      importedSubtopics++;
    }

    await transaction.commit();
    return {
      success: true,
      imported_framework_id: frameworkId,
      imported_topics: topicMap.size,
      imported_subtopics: importedSubtopics,
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
      FROM frameworks f
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
             WHERE sub.topic_id = topic.id
          ) st ON TRUE
         WHERE topic.framework_id = f.id
      ) t ON TRUE
     WHERE f.organization_id = :organizationId AND f.source = 'imported'
     ORDER BY f.created_at DESC, f.id ASC;
    `,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as unknown as ImportedFramework[];
}

/**
 * Guarded write helper: only imported rows owned by this organization may be
 * mutated. Bundled catalog rows and other orgs' imports both miss the WHERE
 * clause and surface as 404 (they are not addressable in this org's tenant).
 */
async function findImportedFrameworkId(
  id: number,
  organizationId: number,
  transaction: Transaction,
): Promise<number> {
  const rows = (await sequelize.query(
    `SELECT id FROM frameworks
      WHERE id = :id AND organization_id = :organizationId AND source = 'imported'
      LIMIT 1;`,
    { replacements: { id, organizationId }, transaction, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  if (rows.length === 0) {
    throw new NotFoundException("Imported framework not found", "Framework", id);
  }
  return rows[0].id;
}

export async function updateImportedFrameworkQuery(
  id: number,
  organizationId: number,
  patch: ImportedFrameworkPatch,
): Promise<void> {
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length < 2 || name.length > 255) {
      throw new ValidationException(
        "Framework name must be between 2 and 255 characters",
        "name",
        patch.name,
      );
    }
    patch = { ...patch, name };
  }

  const transaction = await sequelize.transaction();
  try {
    await findImportedFrameworkId(id, organizationId, transaction);
    await sequelize.query(
      `UPDATE frameworks
          SET name = COALESCE(:name, name),
              description = CASE WHEN :hasDescription THEN :description ELSE description END,
              is_active = COALESCE(:isActive, is_active),
              updated_at = NOW()
        WHERE id = :id;`,
      {
        replacements: {
          id,
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
    // Subtopics/topics cascade on framework delete via the topic FK; delete
    // explicitly anyway so removal stays scoped to this org's rows.
    await deleteImportedStructure(id, organizationId, transaction);
    await sequelize.query(
      `DELETE FROM frameworks
        WHERE id = :id AND organization_id = :organizationId AND source = 'imported';`,
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
