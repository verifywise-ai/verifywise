import ExcelJS from "exceljs";
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";
import {
  deleteImplRowsForStructsQuery,
  listUseCasesUsingFrameworkQuery,
  seedImplRowsQuery,
  structIdsWithDataQuery,
} from "./importedAssessment.service";

/**
 * Server-side framework-import extension logic (#5254). Two entry points:
 *   - buildExcelTemplate() → an .xlsx buffer describing the framework,
 *     its topics, and their subtopics in one worksheet.
 *   - importFramework() → validates every row, then upserts an
 *     organization-scoped `imported_frameworks` row with its topics and
 *     subtopics in a single transaction. Re-uploading the same framework
 *     name updates its structure in place (a diff, see applyStructureDiff),
 *     so assessments on use cases survive. A batch with any validation
 *     error writes nothing.
 *
 * Imported frameworks are deliberately NOT rows in the global `frameworks`
 * catalog: that table is shared by every organization and feeds the use case
 * framework pickers. Use cases attach them through their own tables
 * (importedAssessment.service.ts). See migrations
 * 20261111092002-imported-framework-storage.js and
 * 20261111094001-imported-framework-assessment.js.
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
  /** Topics + subtopics created by this import. */
  added: number;
  /** Existing topics + subtopics whose name, description or order changed, or that came back. */
  updated: number;
  /** Topics + subtopics missing from the file but kept (retired) because a use case assessed them. */
  retired: number;
  /** Topics + subtopics missing from the file and deleted (no assessment data). */
  removed: number;
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
    added: 0,
    updated: 0,
    retired: 0,
    removed: 0,
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
  /** 0-based position among the topics of the sheet. */
  order: number;
}

interface ParsedSubtopic {
  topicNumber: string;
  subtopicNumber: string;
  name: string;
  description: string | null;
  /** 0-based position among the subtopics of its topic. */
  order: number;
}

interface StructureCounts {
  added: number;
  updated: number;
  retired: number;
  removed: number;
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

/** Insert topics (one multi-row INSERT per chunk); returns topic_number → id. */
async function insertTopics(
  frameworkId: number,
  organizationId: number,
  topics: ParsedTopic[],
  transaction: Transaction,
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const part of chunk(topics, INSERT_CHUNK_SIZE)) {
    const replacements: Record<string, unknown> = { organizationId, frameworkId };
    const values = part.map((topic, i) => {
      replacements[`n${i}`] = topic.topicNumber;
      replacements[`t${i}`] = topic.name;
      replacements[`d${i}`] = topic.description;
      replacements[`o${i}`] = topic.order;
      return `(:organizationId, :frameworkId, :n${i}, :t${i}, :d${i}, :o${i}, NOW(), NOW())`;
    });
    const inserted = (await sequelize.query(
      `INSERT INTO imported_framework_topics
         (organization_id, framework_id, topic_number, name, description, order_no, created_at, updated_at)
       VALUES ${values.join(", ")}
       RETURNING id, topic_number;`,
      { replacements, transaction, type: QueryTypes.SELECT },
    )) as Array<{ id: number; topic_number: string }>;
    for (const row of inserted) ids.set(row.topic_number, row.id);
  }
  return ids;
}

/** Insert subtopics under known topic ids (one multi-row INSERT per chunk). */
async function insertSubtopics(
  organizationId: number,
  subtopics: Array<ParsedSubtopic & { topicId: number }>,
  transaction: Transaction,
): Promise<void> {
  for (const part of chunk(subtopics, INSERT_CHUNK_SIZE)) {
    const replacements: Record<string, unknown> = { organizationId };
    const values = part.map((sub, i) => {
      replacements[`p${i}`] = sub.topicId;
      replacements[`n${i}`] = sub.subtopicNumber;
      replacements[`t${i}`] = sub.name;
      replacements[`d${i}`] = sub.description;
      replacements[`o${i}`] = sub.order;
      return `(:organizationId, :p${i}, :n${i}, :t${i}, :d${i}, :o${i}, NOW(), NOW())`;
    });
    await sequelize.query(
      `INSERT INTO imported_framework_subtopics
         (organization_id, topic_id, subtopic_number, name, description, order_no, created_at, updated_at)
       VALUES ${values.join(", ")};`,
      { replacements, transaction },
    );
  }
}

type StructTable = "imported_framework_topics" | "imported_framework_subtopics";

/**
 * Bring matched topics or subtopics in line with the sheet (name,
 * description, order) and un-retire them. Returns how many actually changed.
 */
async function updateStructRows(
  table: StructTable,
  organizationId: number,
  rows: Array<{ id: number; name: string; description: string | null; order: number }>,
  transaction: Transaction,
): Promise<number> {
  let changed = 0;
  for (const part of chunk(rows, INSERT_CHUNK_SIZE)) {
    const replacements: Record<string, unknown> = { organizationId };
    const values = part.map((row, i) => {
      replacements[`i${i}`] = row.id;
      replacements[`n${i}`] = row.name;
      replacements[`d${i}`] = row.description;
      replacements[`o${i}`] = row.order;
      return `(CAST(:i${i} AS INTEGER), CAST(:n${i} AS VARCHAR), CAST(:d${i} AS TEXT), CAST(:o${i} AS INTEGER))`;
    });
    const updated = (await sequelize.query(
      `UPDATE ${table} AS s
          SET name = v.name, description = v.description, order_no = v.order_no,
              is_retired = FALSE, updated_at = NOW()
         FROM (VALUES ${values.join(", ")}) AS v(id, name, description, order_no)
        WHERE s.id = v.id AND s.organization_id = :organizationId
          AND (s.name IS DISTINCT FROM v.name
               OR s.description IS DISTINCT FROM v.description
               OR s.order_no IS DISTINCT FROM v.order_no
               OR s.is_retired)
       RETURNING s.id;`,
      { replacements, transaction, type: QueryTypes.SELECT },
    )) as Array<{ id: number }>;
    changed += updated.length;
  }
  return changed;
}

/**
 * Topics or subtopics missing from the sheet: keep (retire) the ones in
 * `keep`, delete the rest with their empty assessment rows. Returns
 * { retired: newly retired, removed: deleted }.
 */
async function retireOrRemove(
  table: StructTable,
  level: "l2" | "l3",
  missingIds: number[],
  keep: Set<number>,
  organizationId: number,
  transaction: Transaction,
): Promise<{ retired: number; removed: number }> {
  const retireIds = missingIds.filter((id) => keep.has(id));
  const removeIds = missingIds.filter((id) => !keep.has(id));

  let retired = 0;
  if (retireIds.length > 0) {
    const rows = (await sequelize.query(
      `UPDATE ${table} SET is_retired = TRUE, updated_at = NOW()
        WHERE organization_id = :organizationId AND id IN (:ids) AND is_retired = FALSE
       RETURNING id;`,
      { replacements: { organizationId, ids: retireIds }, transaction, type: QueryTypes.SELECT },
    )) as Array<{ id: number }>;
    retired = rows.length;
  }
  if (removeIds.length > 0) {
    await deleteImplRowsForStructsQuery(level, removeIds, organizationId, transaction);
    await sequelize.query(
      `DELETE FROM ${table} WHERE organization_id = :organizationId AND id IN (:ids);`,
      { replacements: { organizationId, ids: removeIds }, transaction },
    );
  }
  return { retired, removed: removeIds.length };
}

/**
 * Re-import of an existing framework, as a diff so use case assessments
 * survive: topics match on topic_number, subtopics on (topic, subtopic_number).
 * Matched rows are updated (and un-retired), new rows inserted, and rows
 * missing from the sheet retired when any use case holds assessment data on
 * them, deleted otherwise. A topic also stays (retired) while it still has a
 * retired subtopic. Finally every attached use case gets assessment rows for
 * the new and returning items.
 */
async function applyStructureDiff(
  frameworkId: number,
  organizationId: number,
  topics: ParsedTopic[],
  subtopics: ParsedSubtopic[],
  transaction: Transaction,
): Promise<StructureCounts> {
  const counts: StructureCounts = { added: 0, updated: 0, retired: 0, removed: 0 };

  const existingTopics = (await sequelize.query(
    `SELECT id, topic_number FROM imported_framework_topics
      WHERE organization_id = :organizationId AND framework_id = :frameworkId;`,
    { replacements: { organizationId, frameworkId }, transaction, type: QueryTypes.SELECT },
  )) as Array<{ id: number; topic_number: string }>;
  const topicIds = new Map(existingTopics.map((t) => [t.topic_number, t.id]));

  const matchedTopics = topics
    .filter((t) => topicIds.has(t.topicNumber))
    .map((t) => ({ ...t, id: topicIds.get(t.topicNumber)! }));
  const newTopics = topics.filter((t) => !topicIds.has(t.topicNumber));
  const presentTopicIds = new Set(matchedTopics.map((t) => t.id));

  counts.updated += await updateStructRows(
    "imported_framework_topics",
    organizationId,
    matchedTopics,
    transaction,
  );
  const insertedTopicIds = await insertTopics(frameworkId, organizationId, newTopics, transaction);
  counts.added += newTopics.length;
  for (const [number, id] of insertedTopicIds) topicIds.set(number, id);

  const existingSubtopics = (await sequelize.query(
    `SELECT s.id, s.topic_id, s.subtopic_number
       FROM imported_framework_subtopics s
       JOIN imported_framework_topics t
         ON t.id = s.topic_id AND t.organization_id = s.organization_id
      WHERE s.organization_id = :organizationId AND t.framework_id = :frameworkId;`,
    { replacements: { organizationId, frameworkId }, transaction, type: QueryTypes.SELECT },
  )) as Array<{ id: number; topic_id: number; subtopic_number: string }>;
  const subKey = (topicId: number, number: string) => `${topicId}\u0000${number}`;
  const subtopicIds = new Map(
    existingSubtopics.map((s) => [subKey(s.topic_id, s.subtopic_number), s.id]),
  );

  const matchedSubtopics: Array<{
    id: number;
    name: string;
    description: string | null;
    order: number;
  }> = [];
  const newSubtopics: Array<ParsedSubtopic & { topicId: number }> = [];
  for (const sub of subtopics) {
    const topicId = topicIds.get(sub.topicNumber)!;
    const id = subtopicIds.get(subKey(topicId, sub.subtopicNumber));
    if (id !== undefined) matchedSubtopics.push({ ...sub, id });
    else newSubtopics.push({ ...sub, topicId });
  }
  const presentSubtopicIds = new Set(matchedSubtopics.map((s) => s.id));

  counts.updated += await updateStructRows(
    "imported_framework_subtopics",
    organizationId,
    matchedSubtopics,
    transaction,
  );
  await insertSubtopics(organizationId, newSubtopics, transaction);
  counts.added += newSubtopics.length;

  // Subtopics first: a kept subtopic keeps its topic.
  const missingSubtopics = existingSubtopics.filter((s) => !presentSubtopicIds.has(s.id));
  const keptSubtopics = await structIdsWithDataQuery(
    "l3",
    missingSubtopics.map((s) => s.id),
    organizationId,
    transaction,
  );
  const subResult = await retireOrRemove(
    "imported_framework_subtopics",
    "l3",
    missingSubtopics.map((s) => s.id),
    keptSubtopics,
    organizationId,
    transaction,
  );

  const missingTopicIds = existingTopics.map((t) => t.id).filter((id) => !presentTopicIds.has(id));
  const keptTopics = await structIdsWithDataQuery(
    "l2",
    missingTopicIds,
    organizationId,
    transaction,
  );
  for (const s of missingSubtopics) if (keptSubtopics.has(s.id)) keptTopics.add(s.topic_id);
  const topicResult = await retireOrRemove(
    "imported_framework_topics",
    "l2",
    missingTopicIds,
    keptTopics,
    organizationId,
    transaction,
  );

  counts.retired += subResult.retired + topicResult.retired;
  counts.removed += subResult.removed + topicResult.removed;

  await seedImplRowsQuery(organizationId, transaction, { frameworkId });
  return counts;
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
  const subtopicOrder = new Map<string, number>();
  for (const row of rows) {
    const topicNumber = asText(row.topic_number)!;
    if (!topicMap.has(topicNumber)) {
      topicMap.set(topicNumber, {
        topicNumber,
        name: asText(row.topic_name)!,
        description: asText(row.topic_description) ?? null,
        order: topicMap.size,
      });
    }
    const subtopicNumber = asText(row.subtopic_number);
    const subtopicName = asText(row.subtopic_name);
    if (subtopicNumber && subtopicName) {
      const order = subtopicOrder.get(topicNumber) ?? 0;
      subtopicOrder.set(topicNumber, order + 1);
      subtopics.push({
        topicNumber,
        subtopicNumber,
        name: subtopicName,
        description: asText(row.subtopic_description) ?? null,
        order,
      });
    }
  }
  const topics = Array.from(topicMap.values());

  const transaction = await sequelize.transaction();

  try {
    // Upsert on (organization, lower(name)): a re-upload updates the existing
    // framework instead of creating a duplicate. FOR UPDATE: an attach to a
    // use case (FOR SHARE) waits for the re-import to finish.
    const existing = (await sequelize.query(
      `SELECT id FROM imported_frameworks
        WHERE organization_id = :organizationId AND lower(name) = lower(:frameworkName)
        LIMIT 1
        FOR UPDATE;`,
      { replacements: { organizationId, frameworkName }, transaction, type: QueryTypes.SELECT },
    )) as Array<{ id: number }>;

    let frameworkId: number;
    let counts: StructureCounts;
    if (existing.length > 0) {
      frameworkId = existing[0].id;
      await sequelize.query(
        `UPDATE imported_frameworks
            SET description = :frameworkDescription, updated_at = NOW()
          WHERE id = :frameworkId AND organization_id = :organizationId;`,
        { replacements: { frameworkId, organizationId, frameworkDescription }, transaction },
      );
      counts = await applyStructureDiff(
        frameworkId,
        organizationId,
        topics,
        subtopics,
        transaction,
      );
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
      // A new framework has no use cases yet, so there is nothing to seed.
      const topicIds = await insertTopics(frameworkId, organizationId, topics, transaction);
      await insertSubtopics(
        organizationId,
        subtopics.map((sub) => ({ ...sub, topicId: topicIds.get(sub.topicNumber)! })),
        transaction,
      );
      counts = { added: topics.length + subtopics.length, updated: 0, retired: 0, removed: 0 };
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
      ...counts,
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
      LIMIT 1
      FOR UPDATE;`,
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
    // Assessments on use cases would be lost: remove it from them first.
    // (The row lock above makes a concurrent attach wait for this answer.)
    const useCases = await listUseCasesUsingFrameworkQuery(id, organizationId, transaction);
    if (useCases.length > 0) {
      const names = useCases.join(", ");
      throw new ConflictException(
        `This framework is used by these use cases: ${names}. Remove it from them before deleting it`,
        "Framework",
        "id",
        {
          i18nKey:
            "This framework is used by these use cases: {names}. Remove it from them before deleting it",
          i18nVars: { names },
          metadata: { use_cases: useCases },
        },
      );
    }
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
