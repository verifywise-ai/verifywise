import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { FrameworkConfig, getConfigById } from "./frameworkRegistry.utils";
import logger from "./logger/fileLogger";

/**
 * Generic read/write helpers for the impl tables of the 21 migrated
 * frameworks (SOC2, GDPR, HIPAA, ...). Table + column names come from
 * Servers/structures/ via frameworkRegistry.utils.ts, so a single set of
 * endpoints serves all of them.
 *
 * These helpers ONLY handle the 21 migrated frameworks. Built-ins (EU,
 * ISO 42001, ISO 27001, NIST AI RMF) have bespoke tables with extra
 * columns (risk_review, is_applicable, ...) and their own routes.
 */

export type ImplLevel = "l2" | "l3";

const IMPL_STATUSES = new Set([
  "Not started",
  "Draft",
  "In progress",
  "Awaiting review",
  "Awaiting approval",
  "Implemented",
  "Audited",
  "Needs rework",
]);

interface LevelTables {
  structTable: string;
  implTable: string;
  risksTable: string;
  parentStructTable: string;
  parentStructIdCol: string; // struct row's parent FK (e.g. control_id on l3_struct)
  implMetaCol: string;
  implParentCol?: string; // l3 impl's parent l2 impl FK
  risksImplCol: string;
  entityType: string;
}

/**
 * Resolve config for a (frameworkId, level) pair or return null when the
 * combo isn't supported (e.g. l3 for a 2-level framework, or a frameworkId
 * that doesn't belong to the migrated set).
 */
export function resolveLevel(
  frameworkId: number,
  level: ImplLevel,
): { cfg: FrameworkConfig; tables: LevelTables } | null {
  const cfg = getConfigById(frameworkId);
  if (!cfg) {
    logger.debug(`[fw] resolveLevel: no structure for frameworkId=${frameworkId}`);
    return null;
  }
  const { tables, cols, entity_types } = cfg;

  if (level === "l2") {
    return {
      cfg,
      tables: {
        structTable: tables.l2_struct,
        implTable: tables.l2_impl,
        risksTable: tables.l2_risks,
        parentStructTable: tables.l1_struct,
        parentStructIdCol: cols.l2_struct_parent,
        implMetaCol: cols.l2_impl_meta,
        risksImplCol: cols.l2_risks_impl,
        entityType: entity_types.l2_impl,
      },
    };
  }

  if (
    !tables.l3_struct ||
    !tables.l3_impl ||
    !tables.l3_risks ||
    !cols.l3_struct_parent ||
    !cols.l3_impl_meta ||
    !cols.l3_impl_parent ||
    !cols.l3_risks_impl ||
    !entity_types.l3_impl
  ) {
    return null;
  }
  return {
    cfg,
    tables: {
      structTable: tables.l3_struct,
      implTable: tables.l3_impl,
      risksTable: tables.l3_risks,
      parentStructTable: tables.l2_struct,
      parentStructIdCol: cols.l3_struct_parent,
      implMetaCol: cols.l3_impl_meta,
      implParentCol: cols.l3_impl_parent,
      risksImplCol: cols.l3_risks_impl,
      entityType: entity_types.l3_impl,
    },
  };
}

/**
 * Fetch a single impl row (l2 or l3), joined with its struct row so the
 * frontend gets the display fields (title, summary, questions, ...) in
 * one call. Also returns `risks: number[]` for the LinkedRisksPopup.
 */
export async function getImplByIdQuery(
  frameworkId: number,
  level: ImplLevel,
  implId: number,
  organizationId: number,
  transaction?: Transaction,
) {
  const resolved = resolveLevel(frameworkId, level);
  if (!resolved) return null;
  const { tables } = resolved;

  const rows = (await sequelize.query(
    `SELECT
       s.id            AS struct_id,
       s.title         AS title,
       s.description   AS description,
       s.summary       AS summary,
       s.questions     AS questions,
       s.evidence_examples AS evidence_examples,
       s.order_no      AS order_no,
       i.id            AS id,
       i.implementation_description,
       i.status,
       i.owner,
       i.reviewer,
       i.approver,
       i.due_date,
       i.auditor_feedback,
       i.projects_frameworks_id,
       i.created_at
     FROM ${tables.implTable} i
     JOIN ${tables.structTable} s ON s.id = i.${tables.implMetaCol}
     WHERE i.organization_id = :organizationId AND i.id = :id
     LIMIT 1;`,
    {
      replacements: { organizationId, id: implId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row) return null;

  const risks = (await sequelize.query(
    `SELECT projects_risks_id
       FROM ${tables.risksTable}
      WHERE organization_id = :organizationId AND ${tables.risksImplCol} = :id;`,
    {
      replacements: { organizationId, id: implId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ projects_risks_id: number }>;

  (row as any).risks = risks.map((r) => r.projects_risks_id);
  return row;
}

/**
 * Full risk objects for the CrossMappings tab. Same shape as the
 * built-in framework risk endpoints.
 */
export async function getImplLinkedRisksQuery(
  frameworkId: number,
  level: ImplLevel,
  implId: number,
  organizationId: number,
) {
  const resolved = resolveLevel(frameworkId, level);
  if (!resolved) return null;
  const { tables } = resolved;

  const risks = await sequelize.query(
    `SELECT pr.*
       FROM risks pr
       INNER JOIN ${tables.risksTable} jr
         ON pr.organization_id = jr.organization_id
        AND pr.id = jr.projects_risks_id
      WHERE jr.organization_id = :organizationId
        AND jr.${tables.risksImplCol} = :implId
      ORDER BY pr.id ASC;`,
    {
      replacements: { organizationId, implId },
      type: QueryTypes.SELECT,
    },
  );
  return risks as any[];
}

/**
 * Full L1 → L2 (→ L3) tree for a project, with impl fields joined onto
 * every struct row. The parent page uses this to render the tree +
 * status chips before the drawer opens.
 */
export async function getFrameworkTreeQuery(
  frameworkId: number,
  projectFrameworkId: number,
  organizationId: number,
) {
  const cfg = getConfigById(frameworkId);
  if (!cfg) return null;
  const { tables, cols } = cfg;

  logger.debug(
    `[fw] getFrameworkTreeQuery framework=${frameworkId} pfId=${projectFrameworkId} tables=${tables.l1_struct}/${tables.l2_struct}${tables.l3_struct ? "/" + tables.l3_struct : ""}`,
  );

  const l1Rows = (await sequelize.query(
    `SELECT id, title, description, order_no
       FROM ${tables.l1_struct}
      WHERE framework_id = :frameworkId
      ORDER BY order_no, id;`,
    {
      replacements: { frameworkId },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ id: number; title: string; description: string | null; order_no: number | null }>;

  const l2Rows = (await sequelize.query(
    `SELECT
       s.id                    AS struct_id,
       s.${cols.l2_struct_parent} AS parent_id,
       s.title, s.description, s.summary, s.questions,
       s.evidence_examples, s.order_no,
       i.id                    AS impl_id,
       i.status, i.owner, i.reviewer, i.approver, i.due_date
     FROM ${tables.l2_struct} s
     LEFT JOIN ${tables.l2_impl} i
       ON i.${cols.l2_impl_meta} = s.id
      AND i.organization_id = :organizationId
      AND i.projects_frameworks_id = :projectFrameworkId
     WHERE s.${cols.l2_struct_parent} IN (
       SELECT id FROM ${tables.l1_struct} WHERE framework_id = :frameworkId
     )
     ORDER BY s.order_no, s.id;`,
    {
      replacements: { frameworkId, projectFrameworkId, organizationId },
      type: QueryTypes.SELECT,
    },
  )) as Array<Record<string, any>>;

  let l3Rows: Array<Record<string, any>> = [];
  if (tables.l3_struct && tables.l3_impl && cols.l3_struct_parent && cols.l3_impl_meta) {
    l3Rows = (await sequelize.query(
      `SELECT
         s.id                    AS struct_id,
         s.${cols.l3_struct_parent} AS parent_id,
         s.title, s.description, s.summary, s.questions,
         s.evidence_examples, s.order_no,
         i.id                    AS impl_id,
         i.status, i.owner, i.reviewer, i.approver, i.due_date
       FROM ${tables.l3_struct} s
       LEFT JOIN ${tables.l3_impl} i
         ON i.${cols.l3_impl_meta} = s.id
        AND i.organization_id = :organizationId
        AND i.projects_frameworks_id = :projectFrameworkId
       WHERE s.${cols.l3_struct_parent} IN (
         SELECT s2.id
           FROM ${tables.l2_struct} s2
           JOIN ${tables.l1_struct} s1 ON s1.id = s2.${cols.l2_struct_parent}
          WHERE s1.framework_id = :frameworkId
       )
       ORDER BY s.order_no, s.id;`,
      {
        replacements: { frameworkId, projectFrameworkId, organizationId },
        type: QueryTypes.SELECT,
      },
    )) as Array<Record<string, any>>;
  }

  const l3ByParent = new Map<number, Array<Record<string, any>>>();
  for (const r of l3Rows) {
    const key = r.parent_id as number;
    if (!l3ByParent.has(key)) l3ByParent.set(key, []);
    l3ByParent.get(key)!.push(r);
  }

  const l2ByParent = new Map<number, Array<Record<string, any>>>();
  for (const r of l2Rows) {
    (r as any).children = l3ByParent.get(r.struct_id as number) || [];
    const key = r.parent_id as number;
    if (!l2ByParent.has(key)) l2ByParent.set(key, []);
    l2ByParent.get(key)!.push(r);
  }

  return l1Rows.map((l1) => ({
    ...l1,
    children: l2ByParent.get(l1.id) || [],
  }));
}

interface UpdateImplInput {
  status?: string;
  implementation_description?: string;
  owner?: string | number | null;
  reviewer?: string | number | null;
  approver?: string | number | null;
  due_date?: string | null;
  auditor_feedback?: string;
  risksMitigated?: string; // JSON-encoded number[]
  risksDelete?: string; // JSON-encoded number[]
}

function validateIntArray(raw: unknown, field: string): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const value of raw) {
    const num = typeof value === "number" ? value : parseInt(String(value), 10);
    if (!Number.isFinite(num)) {
      throw new Error(`Invalid non-integer value in ${field}`);
    }
    out.push(num);
  }
  return out;
}

/**
 * Update an impl row + reconcile risks + attach/unlink files. Runs inside
 * the caller's transaction so that a failure rolls everything back.
 * `uploadedFileIds` come from the file-upload step already run by the
 * controller. `deletedFileIds` are file_entity_links to unlink.
 */
export async function updateImplQuery(
  frameworkId: number,
  level: ImplLevel,
  implId: number,
  organizationId: number,
  input: UpdateImplInput,
  uploadedFileIds: number[],
  deletedFileIds: number[],
  transaction: Transaction,
) {
  const resolved = resolveLevel(frameworkId, level);
  if (!resolved) return null;
  const { cfg, tables } = resolved;

  const setPieces: string[] = [];
  const replacements: Record<string, unknown> = { organizationId, id: implId };

  const addStringField = (field: keyof UpdateImplInput, allowEmpty = true) => {
    const value = input[field];
    if (value === undefined) return;
    if (!allowEmpty && value === "") return;
    setPieces.push(`${field} = :${field}`);
    replacements[field] = value === "" ? null : value;
  };

  const addUserField = (field: "owner" | "reviewer" | "approver") => {
    const raw = input[field];
    if (raw === undefined) return;
    let value: number | null;
    if (raw === "" || raw === null) {
      value = null;
    } else {
      const num = typeof raw === "number" ? raw : parseInt(String(raw), 10);
      if (!Number.isFinite(num)) return;
      value = num;
    }
    setPieces.push(`${field} = :${field}`);
    replacements[field] = value;
  };

  if (input.status !== undefined) {
    if (!IMPL_STATUSES.has(input.status)) {
      throw new Error(`Invalid status '${input.status}'`);
    }
    setPieces.push("status = :status");
    replacements.status = input.status;
  }
  addStringField("implementation_description");
  addStringField("auditor_feedback");
  addUserField("owner");
  addUserField("reviewer");
  addUserField("approver");
  if (input.due_date !== undefined) {
    setPieces.push("due_date = :due_date");
    replacements.due_date = input.due_date || null;
  }

  if (setPieces.length > 0) {
    logger.debug(`[fw] updateImplQuery UPDATE fields: ${setPieces.join(", ")}`);
    await sequelize.query(
      `UPDATE ${tables.implTable}
          SET ${setPieces.join(", ")}
        WHERE organization_id = :organizationId AND id = :id;`,
      { replacements, transaction },
    );
  } else {
    logger.debug(`[fw] updateImplQuery no impl fields changed`);
  }

  for (const fileId of uploadedFileIds) {
    await sequelize.query(
      `INSERT INTO file_entity_links
         (organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_at)
       VALUES (:organizationId, :fileId, :frameworkType, :entityType, :entityId, 'evidence', NOW())
       ON CONFLICT (file_id, framework_type, entity_type, entity_id) DO NOTHING;`,
      {
        replacements: {
          organizationId,
          fileId,
          frameworkType: cfg.framework_type,
          entityType: tables.entityType,
          entityId: implId,
        },
        transaction,
      },
    );
  }

  for (const fileId of deletedFileIds) {
    await sequelize.query(
      `DELETE FROM file_entity_links
        WHERE organization_id = :organizationId
          AND file_id = :fileId
          AND framework_type = :frameworkType
          AND entity_type = :entityType
          AND entity_id = :entityId;`,
      {
        replacements: {
          organizationId,
          fileId,
          frameworkType: cfg.framework_type,
          entityType: tables.entityType,
          entityId: implId,
        },
        transaction,
      },
    );
  }

  const risksDeleted = validateIntArray(JSON.parse(input.risksDelete || "[]"), "risksDelete");
  const risksMitigated = validateIntArray(
    JSON.parse(input.risksMitigated || "[]"),
    "risksMitigated",
  );

  const existing = (await sequelize.query(
    `SELECT projects_risks_id FROM ${tables.risksTable}
      WHERE organization_id = :organizationId AND ${tables.risksImplCol} = :id;`,
    {
      replacements: { organizationId, id: implId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ projects_risks_id: number }>;

  let nextRiskIds = existing.map((r) => r.projects_risks_id);
  nextRiskIds = nextRiskIds.filter((r) => !risksDeleted.includes(r));
  nextRiskIds = Array.from(new Set(nextRiskIds.concat(risksMitigated)));
  logger.debug(
    `[fw] updateImplQuery risks: existing=${existing.length} deleted=${risksDeleted.length} mitigated=${risksMitigated.length} next=${nextRiskIds.length}`,
  );

  await sequelize.query(
    `DELETE FROM ${tables.risksTable}
      WHERE organization_id = :organizationId AND ${tables.risksImplCol} = :id;`,
    { replacements: { organizationId, id: implId }, transaction },
  );

  if (nextRiskIds.length > 0) {
    const placeholders = nextRiskIds
      .map((_, i) => `(:organizationId, :impl${i}, :risk${i})`)
      .join(", ");
    const insertReplacements: Record<string, unknown> = { organizationId };
    nextRiskIds.forEach((riskId, i) => {
      insertReplacements[`impl${i}`] = implId;
      insertReplacements[`risk${i}`] = riskId;
    });
    await sequelize.query(
      `INSERT INTO ${tables.risksTable}
         (organization_id, ${tables.risksImplCol}, projects_risks_id)
       VALUES ${placeholders}
       ON CONFLICT (${tables.risksImplCol}, projects_risks_id) DO NOTHING;`,
      { replacements: insertReplacements, transaction },
    );
  }

  return getImplByIdQuery(frameworkId, level, implId, organizationId, transaction);
}

/**
 * Look up the project_id that an impl row belongs to (used by the PATCH
 * controller to bump projects.updated_at inside the transaction). Returns
 * null if the row doesn't exist for this org.
 */
export async function getImplContextQuery(
  frameworkId: number,
  level: ImplLevel,
  implId: number,
  organizationId: number,
  transaction: Transaction,
) {
  const resolved = resolveLevel(frameworkId, level);
  if (!resolved) return null;
  const { tables } = resolved;

  const rows = (await sequelize.query(
    `SELECT pf.project_id AS project_id
       FROM ${tables.implTable} i
       JOIN projects_frameworks pf
         ON pf.id = i.projects_frameworks_id
        AND pf.organization_id = i.organization_id
      WHERE i.organization_id = :organizationId AND i.id = :id
      LIMIT 1;`,
    {
      replacements: { organizationId, id: implId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ project_id: number }>;

  return rows[0] || null;
}

/**
 * Aggregate progress / assignments / status breakdown for a generic
 * framework scoped to a single projects_frameworks row. Powers the org
 * Dashboard cards. Counts both L2 and L3 impls (for three-level
 * frameworks) so completion percentages match what the Framework page
 * shows on the same tree.
 */
export interface FrameworkDashboardCounts {
  entity_type: string;
  progress: { total: number; done: number };
  assignments: { total: number; assigned: number };
  statusBreakdown: {
    notStarted: number;
    draft: number;
    inProgress: number;
    awaitingReview: number;
    awaitingApproval: number;
    implemented: number;
    needsRework: number;
  };
}

const emptyDashboardCounts = (entityType: string): FrameworkDashboardCounts => ({
  entity_type: entityType,
  progress: { total: 0, done: 0 },
  assignments: { total: 0, assigned: 0 },
  statusBreakdown: {
    notStarted: 0,
    draft: 0,
    inProgress: 0,
    awaitingReview: 0,
    awaitingApproval: 0,
    implemented: 0,
    needsRework: 0,
  },
});

export async function getFrameworkDashboardQuery(
  frameworkId: number,
  projectFrameworkId: number,
  organizationId: number,
): Promise<FrameworkDashboardCounts | null> {
  const cfg = getConfigById(frameworkId);
  if (!cfg) return null;
  const { tables, entity_types } = cfg;

  const counts = emptyDashboardCounts(entity_types.l2_impl);

  const aggregate = async (implTable: string) => {
    const rows = (await sequelize.query(
      `SELECT status, COUNT(*)::int AS total,
              SUM(CASE WHEN owner IS NOT NULL THEN 1 ELSE 0 END)::int AS assigned
         FROM ${implTable}
        WHERE organization_id = :organizationId
          AND projects_frameworks_id = :projectFrameworkId
        GROUP BY status;`,
      {
        replacements: { organizationId, projectFrameworkId },
        type: QueryTypes.SELECT,
      },
    )) as Array<{ status: string | null; total: number; assigned: number }>;

    for (const row of rows) {
      counts.progress.total += row.total;
      counts.assignments.total += row.total;
      counts.assignments.assigned += row.assigned;
      switch (row.status) {
        case "Implemented":
          counts.progress.done += row.total;
          counts.statusBreakdown.implemented += row.total;
          break;
        case "Draft":
          counts.statusBreakdown.draft += row.total;
          break;
        case "In progress":
          counts.statusBreakdown.inProgress += row.total;
          break;
        case "Awaiting review":
          counts.statusBreakdown.awaitingReview += row.total;
          break;
        case "Awaiting approval":
          counts.statusBreakdown.awaitingApproval += row.total;
          break;
        case "Needs rework":
          counts.statusBreakdown.needsRework += row.total;
          break;
        case "Not started":
        case null:
        default:
          counts.statusBreakdown.notStarted += row.total;
          break;
      }
    }
  };

  await aggregate(tables.l2_impl);
  if (tables.l3_impl) {
    await aggregate(tables.l3_impl);
  }

  return counts;
}
