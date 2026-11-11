import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";
import type { FileSource } from "../../domain.layer/models/file/file.model";
import {
  IMPL_STATUSES,
  addStatusCounts,
  emptyDashboardCounts,
  FrameworkDashboardCounts,
  StatusCountRow,
} from "../../utils/frameworkImpl.utils";

/**
 * Assessment of imported frameworks on use cases (#5254).
 *
 * An organization's imported framework (imported_frameworks + topics +
 * subtopics) is attached to a use case through projects_imported_frameworks,
 * and assessed through one impl row per topic (L2) and per subtopic (L3),
 * exactly like the bundled frameworks 5-25 are assessed through their impl
 * tables. Shapes mirror utils/frameworkImpl.utils.ts so the client reuses the
 * generic framework page and drawer.
 *
 * Every query is scoped by the organization of the caller's token and uses
 * replacements. Only fixed identifiers from LEVELS are inlined into SQL.
 */

export const IMPORTED_FRAMEWORK_TYPE = "imported";
export const IMPORTED_SOURCE_LABEL: FileSource = "Imported framework items";
export const DEFAULT_IMPL_STATUS = "Not started";

export type ImportedImplLevel = "l2" | "l3";

interface LevelSpec {
  implTable: string;
  structTable: string;
  structCol: string;
  numberCol: string;
  risksTable: string;
  risksImplCol: string;
  entityType: string;
}

export const LEVELS: Readonly<Record<ImportedImplLevel, LevelSpec>> = {
  l2: {
    implTable: "imported_framework_topic_impl",
    structTable: "imported_framework_topics",
    structCol: "topic_id",
    numberCol: "topic_number",
    risksTable: "imported_framework_topic_impl__risks",
    risksImplCol: "topic_impl_id",
    entityType: "imported_topic",
  },
  l3: {
    implTable: "imported_framework_subtopic_impl",
    structTable: "imported_framework_subtopics",
    structCol: "subtopic_id",
    numberCol: "subtopic_number",
    risksTable: "imported_framework_subtopic_impl__risks",
    risksImplCol: "subtopic_impl_id",
    entityType: "imported_subtopic",
  },
};

export function parseLevel(raw: unknown): ImportedImplLevel | null {
  return raw === "l2" || raw === "l3" ? raw : null;
}

/**
 * SQL condition: impl row `alias` holds assessment data (anything a user
 * entered: a status other than the default, text, people, a due date, an
 * evidence file or a linked risk). False for a LEFT JOIN miss.
 */
export function implHasDataSql(level: ImportedImplLevel, alias: string): string {
  const spec = LEVELS[level];
  return `(${alias}.id IS NOT NULL AND (
      COALESCE(${alias}.status, '${DEFAULT_IMPL_STATUS}') <> '${DEFAULT_IMPL_STATUS}'
      OR COALESCE(${alias}.implementation_description, '') <> ''
      OR ${alias}.owner IS NOT NULL
      OR ${alias}.reviewer IS NOT NULL
      OR ${alias}.approver IS NOT NULL
      OR ${alias}.due_date IS NOT NULL
      OR COALESCE(${alias}.auditor_feedback, '') <> ''
      OR EXISTS (
        SELECT 1 FROM file_entity_links fel
         WHERE fel.organization_id = ${alias}.organization_id
           AND fel.framework_type = '${IMPORTED_FRAMEWORK_TYPE}'
           AND fel.entity_type = '${spec.entityType}'
           AND fel.entity_id = ${alias}.id)
      OR EXISTS (
        SELECT 1 FROM ${spec.risksTable} rk
         WHERE rk.organization_id = ${alias}.organization_id
           AND rk.${spec.risksImplCol} = ${alias}.id)
    ))`;
}

/** A positive safe integer from a number or a digits-only string, else null. */
export function toPositiveId(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  if (typeof raw === "string" && /^[1-9][0-9]*$/.test(raw.trim())) {
    const id = Number(raw.trim());
    return Number.isSafeInteger(id) ? id : null;
  }
  return null;
}

/**
 * A list of ids from a JSON-encoded string (multipart fields) or an array.
 * Missing or empty is []. Anything else that is not a list of positive ids
 * is a 400, never a 500.
 */
export function parseIdList(raw: unknown, field: string): number[] {
  if (raw === undefined || raw === null || raw === "") return [];
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ValidationException(`${field} must be a list of ids`, field, raw, {
        i18nKey: "{field} must be a list of ids",
        i18nVars: { field },
      });
    }
  }
  if (!Array.isArray(value)) {
    throw new ValidationException(`${field} must be a list of ids`, field, raw, {
      i18nKey: "{field} must be a list of ids",
      i18nVars: { field },
    });
  }
  const ids = value.map(toPositiveId);
  if (ids.some((id) => id === null)) {
    throw new ValidationException(`${field} must be a list of ids`, field, raw, {
      i18nKey: "{field} must be a list of ids",
      i18nVars: { field },
    });
  }
  return Array.from(new Set(ids as number[]));
}

// ---------------------------------------------------------------------------
// LINKS
// ---------------------------------------------------------------------------

export interface ProjectLink {
  id: number;
  imported_framework_id: number;
  name: string;
  description: string | null;
  created_at: Date;
}

export interface LinkContext {
  id: number;
  project_id: number;
  imported_framework_id: number;
  name: string;
  description: string | null;
  is_demo: boolean;
}

export interface ProjectImportedFramework {
  project_imported_framework_id: number;
  imported_framework_id: number;
  name: string;
}

export async function getProjectForLinkQuery(
  projectId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<{ id: number; is_organizational: boolean; is_demo: boolean } | null> {
  const rows = (await sequelize.query(
    `SELECT id, is_organizational, is_demo FROM projects
      WHERE organization_id = :organizationId AND id = :projectId
      LIMIT 1;`,
    { replacements: { organizationId, projectId }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ id: number; is_organizational: boolean; is_demo: boolean }>;
  return rows[0] ?? null;
}

export async function listProjectLinksQuery(
  projectId: number,
  organizationId: number,
): Promise<ProjectLink[]> {
  return (await sequelize.query(
    `SELECT l.id, l.imported_framework_id, f.name, f.description, l.created_at
       FROM projects_imported_frameworks l
       JOIN imported_frameworks f
         ON f.id = l.imported_framework_id AND f.organization_id = l.organization_id
      WHERE l.organization_id = :organizationId AND l.project_id = :projectId
      ORDER BY l.created_at, l.id;`,
    { replacements: { organizationId, projectId }, type: QueryTypes.SELECT },
  )) as ProjectLink[];
}

/**
 * Imported frameworks attached to each of the given use cases, for the
 * project payload. One query for any number of use cases.
 */
export async function getImportedFrameworksForProjectsQuery(
  projectIds: number[],
  organizationId: number,
): Promise<Map<number, ProjectImportedFramework[]>> {
  const byProject = new Map<number, ProjectImportedFramework[]>();
  if (projectIds.length === 0) return byProject;
  const rows = await sequelize.query(
    `SELECT l.project_id, l.id AS project_imported_framework_id, l.imported_framework_id, f.name
       FROM projects_imported_frameworks l
       JOIN imported_frameworks f
         ON f.id = l.imported_framework_id AND f.organization_id = l.organization_id
      WHERE l.organization_id = :organizationId AND l.project_id IN (:projectIds)
      ORDER BY l.created_at, l.id;`,
    { replacements: { organizationId, projectIds }, type: QueryTypes.SELECT },
  );
  for (const row of (Array.isArray(rows) ? rows : []) as Array<
    ProjectImportedFramework & { project_id: number }
  >) {
    const list = byProject.get(row.project_id) ?? [];
    list.push({
      project_imported_framework_id: row.project_imported_framework_id,
      imported_framework_id: row.imported_framework_id,
      name: row.name,
    });
    byProject.set(row.project_id, list);
  }
  return byProject;
}

export async function getLinkContextQuery(
  linkId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<LinkContext | null> {
  const rows = (await sequelize.query(
    `SELECT l.id, l.project_id, l.imported_framework_id, l.is_demo, f.name, f.description
       FROM projects_imported_frameworks l
       JOIN imported_frameworks f
         ON f.id = l.imported_framework_id AND f.organization_id = l.organization_id
      WHERE l.organization_id = :organizationId AND l.id = :linkId
      LIMIT 1;`,
    { replacements: { organizationId, linkId }, type: QueryTypes.SELECT, transaction },
  )) as LinkContext[];
  return rows[0] ?? null;
}

/**
 * Create assessment rows for every non-retired topic and subtopic that has
 * none yet, for one link or for every link of one imported framework. Rows
 * that exist are left alone, so this both seeds a new link and fills in
 * topics a re-import added or brought back.
 */
export async function seedImplRowsQuery(
  organizationId: number,
  transaction: Transaction,
  scope: { linkId: number } | { frameworkId: number },
): Promise<{ topics: number; subtopics: number }> {
  const scopeSql = "linkId" in scope ? "l.id = :scopeId" : "l.imported_framework_id = :scopeId";
  const scopeId = "linkId" in scope ? scope.linkId : scope.frameworkId;
  const replacements = { organizationId, scopeId, status: DEFAULT_IMPL_STATUS };

  const topics = (await sequelize.query(
    `INSERT INTO imported_framework_topic_impl
       (organization_id, project_imported_framework_id, topic_id, status, is_demo, created_at, updated_at)
     SELECT l.organization_id, l.id, t.id, :status, l.is_demo, NOW(), NOW()
       FROM projects_imported_frameworks l
       JOIN imported_framework_topics t
         ON t.organization_id = l.organization_id AND t.framework_id = l.imported_framework_id
      WHERE l.organization_id = :organizationId AND ${scopeSql} AND t.is_retired = FALSE
      ORDER BY l.id, t.order_no, t.id
     ON CONFLICT (project_imported_framework_id, topic_id) DO NOTHING
     RETURNING id;`,
    { replacements, type: QueryTypes.SELECT, transaction },
  )) as Array<{ id: number }>;

  const subtopics = (await sequelize.query(
    `INSERT INTO imported_framework_subtopic_impl
       (organization_id, project_imported_framework_id, subtopic_id, topic_impl_id, status, is_demo,
        created_at, updated_at)
     SELECT l.organization_id, l.id, s.id, ti.id, :status, l.is_demo, NOW(), NOW()
       FROM projects_imported_frameworks l
       JOIN imported_framework_topics t
         ON t.organization_id = l.organization_id AND t.framework_id = l.imported_framework_id
       JOIN imported_framework_subtopics s
         ON s.organization_id = l.organization_id AND s.topic_id = t.id
       JOIN imported_framework_topic_impl ti
         ON ti.organization_id = l.organization_id
        AND ti.project_imported_framework_id = l.id
        AND ti.topic_id = t.id
      WHERE l.organization_id = :organizationId AND ${scopeSql}
        AND t.is_retired = FALSE AND s.is_retired = FALSE
      ORDER BY l.id, s.order_no, s.id
     ON CONFLICT (project_imported_framework_id, subtopic_id) DO NOTHING
     RETURNING id;`,
    { replacements, type: QueryTypes.SELECT, transaction },
  )) as Array<{ id: number }>;

  return { topics: topics.length, subtopics: subtopics.length };
}

/**
 * Attach an imported framework to a use case and seed its assessment rows,
 * in one transaction. The pending-approval and access checks run in the
 * controller before this.
 */
export async function attachImportedFrameworkQuery(
  projectId: number,
  importedFrameworkId: number,
  organizationId: number,
): Promise<ProjectLink> {
  const transaction = await sequelize.transaction();
  try {
    const project = await getProjectForLinkQuery(projectId, organizationId, transaction);
    if (!project) {
      throw new NotFoundException("Use case not found", "Project", projectId);
    }
    if (project.is_organizational) {
      throw new ValidationException(
        "Imported frameworks can only be added to use cases, not to the organizational project",
        "project_id",
        projectId,
      );
    }

    // FOR SHARE: a concurrent delete or re-import of this framework waits.
    const frameworks = (await sequelize.query(
      `SELECT id, name, description, is_active FROM imported_frameworks
        WHERE organization_id = :organizationId AND id = :importedFrameworkId
        LIMIT 1
        FOR SHARE;`,
      {
        replacements: { organizationId, importedFrameworkId },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as Array<{ id: number; name: string; description: string | null; is_active: boolean }>;
    const framework = frameworks[0];
    if (!framework) {
      throw new NotFoundException("Imported framework not found", "Framework", importedFrameworkId);
    }
    if (!framework.is_active) {
      throw new ValidationException(
        "This imported framework is inactive. Activate it before adding it to a use case",
        "imported_framework_id",
        importedFrameworkId,
      );
    }

    const inserted = (await sequelize.query(
      `INSERT INTO projects_imported_frameworks
         (organization_id, project_id, imported_framework_id, is_demo, created_at)
       VALUES (:organizationId, :projectId, :importedFrameworkId, :isDemo, NOW())
       ON CONFLICT (project_id, imported_framework_id) DO NOTHING
       RETURNING id, created_at;`,
      {
        replacements: {
          organizationId,
          projectId,
          importedFrameworkId,
          isDemo: project.is_demo === true,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as Array<{ id: number; created_at: Date }>;
    if (inserted.length === 0) {
      throw new ConflictException(
        "This framework is already added to this use case",
        "ImportedFramework",
        "imported_framework_id",
      );
    }

    await seedImplRowsQuery(organizationId, transaction, { linkId: inserted[0].id });
    await transaction.commit();
    return {
      id: inserted[0].id,
      imported_framework_id: framework.id,
      name: framework.name,
      description: framework.description,
      created_at: inserted[0].created_at,
    };
  } catch (err) {
    await rollbackQuietly(transaction);
    throw err;
  }
}

/** Remove the evidence links of every assessment row of the given links. */
export async function deleteLinkEvidenceQuery(
  linkIds: number[],
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  if (linkIds.length === 0) return;
  for (const spec of Object.values(LEVELS)) {
    await sequelize.query(
      `DELETE FROM file_entity_links
        WHERE organization_id = :organizationId
          AND framework_type = :frameworkType
          AND entity_type = :entityType
          AND entity_id IN (
            SELECT id FROM ${spec.implTable}
             WHERE organization_id = :organizationId
               AND project_imported_framework_id IN (:linkIds)
          );`,
      {
        replacements: {
          organizationId,
          frameworkType: IMPORTED_FRAMEWORK_TYPE,
          entityType: spec.entityType,
          linkIds,
        },
        transaction,
      },
    );
  }
}

/**
 * Detach an imported framework from a use case. Evidence links go first (they
 * point at impl ids by value); deleting the link cascades to the impl rows
 * and their risk links.
 */
export async function detachImportedFrameworkQuery(
  projectId: number,
  linkId: number,
  organizationId: number,
): Promise<void> {
  const transaction = await sequelize.transaction();
  try {
    const rows = (await sequelize.query(
      `SELECT id FROM projects_imported_frameworks
        WHERE organization_id = :organizationId AND id = :linkId AND project_id = :projectId
        FOR UPDATE;`,
      { replacements: { organizationId, linkId, projectId }, type: QueryTypes.SELECT, transaction },
    )) as Array<{ id: number }>;
    if (rows.length === 0) {
      throw new NotFoundException("This framework is not added to this use case", "Link", linkId);
    }
    await deleteLinkEvidenceQuery([linkId], organizationId, transaction);
    await sequelize.query(
      `DELETE FROM projects_imported_frameworks
        WHERE organization_id = :organizationId AND id = :linkId;`,
      { replacements: { organizationId, linkId }, transaction },
    );
    await transaction.commit();
  } catch (err) {
    await rollbackQuietly(transaction);
    throw err;
  }
}

/** Use case deletion: remove its imported framework links and their evidence links. */
export async function deleteProjectImportedFrameworksQuery(
  projectId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  const rows = await sequelize.query(
    `SELECT id FROM projects_imported_frameworks
      WHERE organization_id = :organizationId AND project_id = :projectId;`,
    { replacements: { organizationId, projectId }, type: QueryTypes.SELECT, transaction },
  );
  const linkIds = (Array.isArray(rows) ? (rows as Array<{ id: number }>) : []).map((r) => r.id);
  if (linkIds.length === 0) return;
  await deleteLinkEvidenceQuery(linkIds, organizationId, transaction);
  await sequelize.query(
    `DELETE FROM projects_imported_frameworks
      WHERE organization_id = :organizationId AND project_id = :projectId;`,
    { replacements: { organizationId, projectId }, transaction },
  );
}

/** Names of the use cases an imported framework is attached to. */
export async function listUseCasesUsingFrameworkQuery(
  importedFrameworkId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<string[]> {
  const rows = (await sequelize.query(
    `SELECT p.project_title
       FROM projects_imported_frameworks l
       JOIN projects p ON p.id = l.project_id AND p.organization_id = l.organization_id
      WHERE l.organization_id = :organizationId AND l.imported_framework_id = :importedFrameworkId
      ORDER BY p.project_title, p.id;`,
    { replacements: { organizationId, importedFrameworkId }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ project_title: string }>;
  return rows.map((r) => r.project_title);
}

// ---------------------------------------------------------------------------
// TREE + DASHBOARD
// ---------------------------------------------------------------------------

export interface ImportedTreeNode {
  struct_id: number;
  parent_id: number;
  number: string;
  title: string;
  description: string | null;
  summary: null;
  questions: null;
  evidence_examples: null;
  order_no: number;
  retired: boolean;
  impl_id: number | null;
  status: string | null;
  owner: number | null;
  reviewer: number | null;
  approver: number | null;
  due_date: string | null;
  children?: ImportedTreeNode[];
}

export interface ImportedTree {
  projects_frameworks_id: number;
  framework: {
    id: number;
    key: string;
    framework_type: string;
    display_name: string;
    entity_types: { l2_impl: string; l3_impl: string };
    hierarchy_type: "three_level";
    imported_framework_id: number;
  };
  tree: Array<{
    id: number;
    title: string;
    description: string | null;
    order_no: number;
    children: ImportedTreeNode[];
  }>;
}

interface TreeRow {
  struct_id: number;
  parent_id: number;
  number: string;
  title: string;
  description: string | null;
  order_no: number | null;
  is_retired: boolean;
  impl_id: number | null;
  status: string | null;
  owner: number | null;
  reviewer: number | null;
  approver: number | null;
  due_date: string | null;
  has_data: boolean;
}

function toNode(row: TreeRow): ImportedTreeNode {
  return {
    struct_id: row.struct_id,
    parent_id: row.parent_id,
    number: row.number,
    title: row.title,
    description: row.description,
    summary: null,
    questions: null,
    evidence_examples: null,
    // Stored 0-based in import order; the tree is 1-based like the bundled structs.
    order_no: (row.order_no ?? 0) + 1,
    retired: row.is_retired === true,
    impl_id: row.impl_id,
    status: row.status,
    owner: row.owner,
    reviewer: row.reviewer,
    approver: row.approver,
    due_date: row.due_date,
  };
}

/**
 * The link's tree in the generic framework shape: one L1 node (the imported
 * framework), its topics (L2) and their subtopics (L3), with this link's
 * assessment fields. Retired topics and subtopics appear (flagged) only when
 * this link holds data on them; a retired topic also stays as the parent of
 * a retired subtopic that does.
 */
export async function getLinkTreeQuery(
  link: LinkContext,
  organizationId: number,
): Promise<ImportedTree> {
  const replacements = {
    organizationId,
    linkId: link.id,
    frameworkId: link.imported_framework_id,
  };

  const topicRows = (await sequelize.query(
    `SELECT t.id AS struct_id, t.framework_id AS parent_id, t.topic_number AS number,
            t.name AS title, t.description, t.order_no, t.is_retired,
            i.id AS impl_id, i.status, i.owner, i.reviewer, i.approver, i.due_date,
            ${implHasDataSql("l2", "i")} AS has_data
       FROM imported_framework_topics t
       LEFT JOIN imported_framework_topic_impl i
         ON i.topic_id = t.id
        AND i.organization_id = :organizationId
        AND i.project_imported_framework_id = :linkId
      WHERE t.organization_id = :organizationId AND t.framework_id = :frameworkId
      ORDER BY t.order_no, t.id;`,
    { replacements, type: QueryTypes.SELECT },
  )) as TreeRow[];

  const subtopicRows = (await sequelize.query(
    `SELECT s.id AS struct_id, s.topic_id AS parent_id, s.subtopic_number AS number,
            s.name AS title, s.description, s.order_no, s.is_retired,
            i.id AS impl_id, i.status, i.owner, i.reviewer, i.approver, i.due_date,
            ${implHasDataSql("l3", "i")} AS has_data
       FROM imported_framework_subtopics s
       JOIN imported_framework_topics t
         ON t.id = s.topic_id AND t.organization_id = s.organization_id
       LEFT JOIN imported_framework_subtopic_impl i
         ON i.subtopic_id = s.id
        AND i.organization_id = :organizationId
        AND i.project_imported_framework_id = :linkId
      WHERE s.organization_id = :organizationId AND t.framework_id = :frameworkId
      ORDER BY s.order_no, s.id;`,
    { replacements, type: QueryTypes.SELECT },
  )) as TreeRow[];

  const subtopicsByTopic = new Map<number, ImportedTreeNode[]>();
  for (const row of subtopicRows) {
    if (row.is_retired && !row.has_data) continue;
    const list = subtopicsByTopic.get(row.parent_id) ?? [];
    list.push(toNode(row));
    subtopicsByTopic.set(row.parent_id, list);
  }

  const topics: ImportedTreeNode[] = [];
  for (const row of topicRows) {
    const children = subtopicsByTopic.get(row.struct_id) ?? [];
    if (row.is_retired && !row.has_data && children.length === 0) continue;
    topics.push({ ...toNode(row), children });
  }

  return {
    projects_frameworks_id: link.id,
    framework: {
      id: link.id,
      key: IMPORTED_FRAMEWORK_TYPE,
      framework_type: IMPORTED_FRAMEWORK_TYPE,
      display_name: link.name,
      entity_types: { l2_impl: LEVELS.l2.entityType, l3_impl: LEVELS.l3.entityType },
      hierarchy_type: "three_level",
      imported_framework_id: link.imported_framework_id,
    },
    tree: [
      {
        id: link.imported_framework_id,
        title: link.name,
        description: link.description,
        order_no: 1,
        children: topics,
      },
    ],
  };
}

/** Dashboard counts over exactly the rows the tree shows. */
export function countTree(tree: ImportedTree["tree"]): FrameworkDashboardCounts {
  const counts = emptyDashboardCounts(LEVELS.l2.entityType);
  const rows: StatusCountRow[] = [];
  const add = (node: ImportedTreeNode) => {
    if (node.impl_id === null || node.impl_id === undefined) return;
    rows.push({ status: node.status, total: 1, assigned: node.owner !== null ? 1 : 0 });
  };
  for (const l1 of tree) {
    for (const topic of l1.children) {
      add(topic);
      for (const subtopic of topic.children ?? []) add(subtopic);
    }
  }
  addStatusCounts(counts, rows);
  return counts;
}

export async function getLinkDashboardQuery(
  link: LinkContext,
  organizationId: number,
): Promise<FrameworkDashboardCounts> {
  const { tree } = await getLinkTreeQuery(link, organizationId);
  return countTree(tree);
}

// ---------------------------------------------------------------------------
// IMPL ROWS
// ---------------------------------------------------------------------------

/**
 * One assessment row of a link, joined with its topic or subtopic, in the
 * bundled getImplByIdQuery shape (projects_frameworks_id is the link id),
 * plus `risks: number[]`. Null when the row is not in this link and org.
 */
export async function getImplQuery(
  linkId: number,
  level: ImportedImplLevel,
  implId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<Record<string, unknown> | null> {
  const spec = LEVELS[level];
  const rows = (await sequelize.query(
    `SELECT s.id AS struct_id,
            s.${spec.numberCol} AS number,
            s.name AS title,
            s.description,
            NULL AS summary,
            NULL AS questions,
            NULL AS evidence_examples,
            s.order_no + 1 AS order_no,
            s.is_retired AS retired,
            i.id,
            i.implementation_description,
            i.status,
            i.owner,
            i.reviewer,
            i.approver,
            i.due_date,
            i.auditor_feedback,
            i.project_imported_framework_id AS projects_frameworks_id,
            l.project_id,
            i.created_at,
            i.updated_at
       FROM ${spec.implTable} i
       JOIN ${spec.structTable} s
         ON s.id = i.${spec.structCol} AND s.organization_id = i.organization_id
       JOIN projects_imported_frameworks l
         ON l.id = i.project_imported_framework_id AND l.organization_id = i.organization_id
      WHERE i.organization_id = :organizationId
        AND i.id = :implId
        AND i.project_imported_framework_id = :linkId
      LIMIT 1;`,
    { replacements: { organizationId, implId, linkId }, type: QueryTypes.SELECT, transaction },
  )) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;

  const risks = (await sequelize.query(
    `SELECT projects_risks_id FROM ${spec.risksTable}
      WHERE organization_id = :organizationId AND ${spec.risksImplCol} = :implId
      ORDER BY projects_risks_id;`,
    { replacements: { organizationId, implId }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ projects_risks_id: number }>;
  row.risks = risks.map((r) => r.projects_risks_id);
  return row;
}

/** True when the impl row belongs to this link in this org. */
export async function implBelongsToLinkQuery(
  linkId: number,
  level: ImportedImplLevel,
  implId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<boolean> {
  const spec = LEVELS[level];
  const rows = (await sequelize.query(
    `SELECT id FROM ${spec.implTable}
      WHERE organization_id = :organizationId AND id = :implId
        AND project_imported_framework_id = :linkId
      LIMIT 1;`,
    { replacements: { organizationId, implId, linkId }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ id: number }>;
  return rows.length > 0;
}

/** Full risk objects linked to an impl row (same shape as bundled). */
export async function getImplLinkedRisksQuery(
  level: ImportedImplLevel,
  implId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<Array<Record<string, unknown>>> {
  const spec = LEVELS[level];
  return (await sequelize.query(
    `SELECT r.*
       FROM risks r
       JOIN ${spec.risksTable} jr
         ON r.organization_id = jr.organization_id AND r.id = jr.projects_risks_id
      WHERE jr.organization_id = :organizationId AND jr.${spec.risksImplCol} = :implId
      ORDER BY r.id ASC;`,
    { replacements: { organizationId, implId }, type: QueryTypes.SELECT, transaction },
  )) as Array<Record<string, unknown>>;
}

/** Every id must be a risk of this use case in this org; else 400. */
async function assertRisksInProject(
  riskIds: number[],
  projectId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  if (riskIds.length === 0) return;
  const rows = (await sequelize.query(
    `SELECT pr.risk_id
       FROM projects_risks pr
       JOIN risks r ON r.id = pr.risk_id AND r.organization_id = pr.organization_id
      WHERE pr.organization_id = :organizationId
        AND pr.project_id = :projectId
        AND pr.risk_id IN (:riskIds);`,
    { replacements: { organizationId, projectId, riskIds }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ risk_id: number }>;
  const found = new Set(rows.map((r) => r.risk_id));
  if (riskIds.some((id) => !found.has(id))) {
    throw new ValidationException(
      "Linked risks must belong to this use case",
      "risks",
      riskIds.filter((id) => !found.has(id)),
    );
  }
}

async function getRiskIdsQuery(
  level: ImportedImplLevel,
  implId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<number[]> {
  const spec = LEVELS[level];
  const rows = (await sequelize.query(
    `SELECT projects_risks_id FROM ${spec.risksTable}
      WHERE organization_id = :organizationId AND ${spec.risksImplCol} = :implId;`,
    { replacements: { organizationId, implId }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ projects_risks_id: number }>;
  return rows.map((r) => r.projects_risks_id);
}

/**
 * Make `nextRiskIds` the impl row's risk set. Only ids not linked yet are
 * checked against the use case, so a risk later moved off the use case does
 * not block unrelated edits.
 */
async function writeRiskSetQuery(
  link: LinkContext,
  level: ImportedImplLevel,
  implId: number,
  organizationId: number,
  existing: number[],
  nextRiskIds: number[],
  transaction: Transaction,
): Promise<void> {
  const spec = LEVELS[level];
  const added = nextRiskIds.filter((id) => !existing.includes(id));
  await assertRisksInProject(added, link.project_id, organizationId, transaction);

  const removed = existing.filter((id) => !nextRiskIds.includes(id));
  if (removed.length > 0) {
    await sequelize.query(
      `DELETE FROM ${spec.risksTable}
        WHERE organization_id = :organizationId AND ${spec.risksImplCol} = :implId
          AND projects_risks_id IN (:removed);`,
      { replacements: { organizationId, implId, removed }, transaction },
    );
  }
  if (added.length > 0) {
    const replacements: Record<string, unknown> = { organizationId, implId };
    const values = added.map((riskId, i) => {
      replacements[`risk${i}`] = riskId;
      return `(:organizationId, :implId, :risk${i})`;
    });
    await sequelize.query(
      `INSERT INTO ${spec.risksTable} (organization_id, ${spec.risksImplCol}, projects_risks_id)
       VALUES ${values.join(", ")}
       ON CONFLICT (${spec.risksImplCol}, projects_risks_id) DO NOTHING;`,
      { replacements, transaction },
    );
  }
}

export interface ImplUpdateInput {
  status?: unknown;
  implementation_description?: unknown;
  owner?: unknown;
  reviewer?: unknown;
  approver?: unknown;
  due_date?: unknown;
  auditor_feedback?: unknown;
  risksMitigated?: unknown;
  risksDelete?: unknown;
}

const USER_FIELDS = ["owner", "reviewer", "approver"] as const;
const TEXT_FIELDS = ["implementation_description", "auditor_feedback"] as const;

/**
 * Update an impl row, its evidence links and its risk set inside the
 * caller's transaction (the bundled updateImplQuery semantics). The caller
 * has checked the row belongs to `link`. Free text is stored as entered,
 * like the bundled frameworks; wrong types and unknown values are 400s.
 */
export async function updateImplQuery(
  link: LinkContext,
  level: ImportedImplLevel,
  implId: number,
  organizationId: number,
  input: ImplUpdateInput,
  uploadedFileIds: number[],
  deletedFileIds: number[],
  transaction: Transaction,
): Promise<Record<string, unknown> | null> {
  const spec = LEVELS[level];
  const setPieces: string[] = [];
  const replacements: Record<string, unknown> = { organizationId, implId, linkId: link.id };

  if (input.status !== undefined) {
    if (typeof input.status !== "string" || !IMPL_STATUSES.has(input.status)) {
      throw new ValidationException("Invalid status", "status", input.status);
    }
    setPieces.push("status = :status");
    replacements.status = input.status;
  }

  for (const field of TEXT_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    if (value !== null && typeof value !== "string") {
      throw new ValidationException(`${field} must be text`, field, value, {
        i18nKey: "{field} must be text",
        i18nVars: { field },
      });
    }
    setPieces.push(`${field} = :${field}`);
    replacements[field] = value === "" ? null : value;
  }

  const userIds: number[] = [];
  for (const field of USER_FIELDS) {
    const raw = input[field];
    if (raw === undefined) continue;
    let value: number | null = null;
    if (raw !== null && raw !== "") {
      value = toPositiveId(raw);
      if (value === null) {
        throw new ValidationException("Invalid user id", field, raw);
      }
      userIds.push(value);
    }
    setPieces.push(`${field} = :${field}`);
    replacements[field] = value;
  }
  if (userIds.length > 0) {
    const unique = Array.from(new Set(userIds));
    const members = (await sequelize.query(
      `SELECT user_id FROM organization_members
        WHERE organization_id = :organizationId AND user_id IN (:userIds);`,
      {
        replacements: { organizationId, userIds: unique },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as Array<{ user_id: number }>;
    if (members.length !== unique.length) {
      throw new ValidationException(
        "Owner, reviewer and approver must be members of this organization",
        "owner",
        unique,
      );
    }
  }

  if (input.due_date !== undefined) {
    const raw = input.due_date;
    let value: string | null = null;
    if (raw !== null && raw !== "") {
      if (
        typeof raw !== "string" ||
        !/^\d{4}-\d{2}-\d{2}/.test(raw) ||
        Number.isNaN(Date.parse(raw))
      ) {
        throw new ValidationException("Invalid due date", "due_date", raw);
      }
      value = raw;
    }
    setPieces.push("due_date = :due_date");
    replacements.due_date = value;
  }

  // Parse risk lists before any write so a bad list changes nothing.
  const risksDeleted = parseIdList(input.risksDelete, "risksDelete");
  const risksMitigated = parseIdList(input.risksMitigated, "risksMitigated");

  if (setPieces.length > 0) {
    setPieces.push("updated_at = NOW()");
    await sequelize.query(
      `UPDATE ${spec.implTable}
          SET ${setPieces.join(", ")}
        WHERE organization_id = :organizationId AND id = :implId
          AND project_imported_framework_id = :linkId;`,
      { replacements, transaction },
    );
  }

  for (const fileId of uploadedFileIds) {
    await sequelize.query(
      `INSERT INTO file_entity_links
         (organization_id, file_id, framework_type, entity_type, entity_id, project_id, link_type, created_at)
       VALUES (:organizationId, :fileId, :frameworkType, :entityType, :implId, :projectId, 'evidence', NOW())
       ON CONFLICT (file_id, framework_type, entity_type, entity_id) DO NOTHING;`,
      {
        replacements: {
          organizationId,
          fileId,
          frameworkType: IMPORTED_FRAMEWORK_TYPE,
          entityType: spec.entityType,
          implId,
          projectId: link.project_id,
        },
        transaction,
      },
    );
  }

  if (deletedFileIds.length > 0) {
    await sequelize.query(
      `DELETE FROM file_entity_links
        WHERE organization_id = :organizationId
          AND file_id IN (:deletedFileIds)
          AND framework_type = :frameworkType
          AND entity_type = :entityType
          AND entity_id = :implId;`,
      {
        replacements: {
          organizationId,
          deletedFileIds,
          frameworkType: IMPORTED_FRAMEWORK_TYPE,
          entityType: spec.entityType,
          implId,
        },
        transaction,
      },
    );
  }

  if (risksDeleted.length > 0 || risksMitigated.length > 0) {
    const existing = await getRiskIdsQuery(level, implId, organizationId, transaction);
    const next = Array.from(
      new Set(existing.filter((id) => !risksDeleted.includes(id)).concat(risksMitigated)),
    );
    await writeRiskSetQuery(link, level, implId, organizationId, existing, next, transaction);
  }

  return getImplQuery(link.id, level, implId, organizationId, transaction);
}

/** Replace an impl row's risk set (PUT .../risks). */
export async function replaceImplRisksQuery(
  link: LinkContext,
  level: ImportedImplLevel,
  implId: number,
  organizationId: number,
  riskIds: number[],
  transaction: Transaction,
): Promise<Array<Record<string, unknown>>> {
  const existing = await getRiskIdsQuery(level, implId, organizationId, transaction);
  await writeRiskSetQuery(link, level, implId, organizationId, existing, riskIds, transaction);
  return getImplLinkedRisksQuery(level, implId, organizationId, transaction);
}

// ---------------------------------------------------------------------------
// RE-IMPORT HELPERS
// ---------------------------------------------------------------------------

/** Ids among `structIds` that hold assessment data in at least one link. */
export async function structIdsWithDataQuery(
  level: ImportedImplLevel,
  structIds: number[],
  organizationId: number,
  transaction: Transaction,
): Promise<Set<number>> {
  if (structIds.length === 0) return new Set();
  const spec = LEVELS[level];
  const rows = (await sequelize.query(
    `SELECT DISTINCT i.${spec.structCol} AS id
       FROM ${spec.implTable} i
      WHERE i.organization_id = :organizationId
        AND i.${spec.structCol} IN (:structIds)
        AND ${implHasDataSql(level, "i")};`,
    { replacements: { organizationId, structIds }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ id: number }>;
  return new Set(rows.map((r) => r.id));
}

/** Delete the (empty) impl rows of topics or subtopics about to be deleted. */
export async function deleteImplRowsForStructsQuery(
  level: ImportedImplLevel,
  structIds: number[],
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  if (structIds.length === 0) return;
  const spec = LEVELS[level];
  await sequelize.query(
    `DELETE FROM ${spec.implTable}
      WHERE organization_id = :organizationId AND ${spec.structCol} IN (:structIds);`,
    { replacements: { organizationId, structIds }, transaction },
  );
}

async function rollbackQuietly(transaction: Transaction): Promise<void> {
  try {
    await transaction.rollback();
  } catch {
    // rollback failure: swallow so the original error propagates
  }
}
