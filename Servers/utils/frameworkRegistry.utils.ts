import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { STATUSES } from "../types/status.type";
import { DEMO_DUE_DATE_OFFSET_DAYS } from "./demoSeedFields";
import {
  FRAMEWORK_STRUCTURES,
  FrameworkStructure,
  getStructureById,
  getStructureByKey,
  requireStructureByKey,
} from "../structures";

/**
 * Runtime CRUD for the 21 frameworks whose table + column layout is declared
 * in Servers/structures/ (SOC2, GDPR, HIPAA, ...). Each framework gets a
 * named create/delete pair below that mirrors the built-in ones
 * (createEUFrameworkQuery, createISOFrameworkQuery, ...) and is wired into
 * frameworkAdditionMap / frameworkDeletionMap by framework id.
 *
 * All wrappers delegate to two shared helpers that read the structure once
 * and do INSERT ... SELECT for populate / DELETE ... IN (SELECT ...) for
 * cleanup.
 */

// Legacy aliases so existing imports keep working. Prefer the new names
// (FrameworkStructure / FRAMEWORK_STRUCTURES / getStructureBy*) in fresh
// code.
export type FrameworkConfig = FrameworkStructure;
export const FRAMEWORKS: Record<string, FrameworkStructure> = Object.fromEntries(
  FRAMEWORK_STRUCTURES.map((fw) => [fw.key, fw]),
);

export function getConfig(key: string): FrameworkStructure {
  return requireStructureByKey(key);
}

/**
 * Reverse lookup: framework numeric id -> structure entry. Used by generic
 * backend endpoints that receive :frameworkId in the URL.
 */
export function getConfigById(frameworkId: number): FrameworkStructure | null {
  return getStructureById(frameworkId);
}

// getStructureByKey is re-exported for callers that only need the read-only
// version.
export { getStructureByKey };

async function getProjectFrameworkId(
  frameworkId: number,
  projectId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<number | null> {
  const row = await getProjectFramework(frameworkId, projectId, organizationId, transaction);
  return row?.id ?? null;
}

/**
 * The projects_frameworks row plus the owning project's owner and is_demo flag.
 * Seeding reads all three from here so demo rows are tagged and owned the same
 * way the built-in frameworks tag and own theirs.
 */
async function getProjectFramework(
  frameworkId: number,
  projectId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<{ id: number; owner: number | null; is_demo: boolean } | null> {
  const rows = (await sequelize.query(
    `SELECT pf.id, p.owner, p.is_demo FROM projects_frameworks pf
       JOIN projects p ON p.id = pf.project_id
      WHERE pf.organization_id = :orgId AND pf.project_id = :projectId
        AND pf.framework_id = :frameworkId
      LIMIT 1;`,
    {
      replacements: { orgId: organizationId, projectId, frameworkId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ id: number; owner: number | null; is_demo: boolean }>;
  return rows[0] ?? null;
}

/**
 * The SQL expression that produces a row's status. Demo seeds walk STATUSES in
 * order so the demo covers every status and looks the same on every seed; a real
 * project starts at "Not started". Each impl table has its own Postgres enum for
 * status, so the value needs an explicit cast to that table's type.
 */
async function statusExpression(
  table: string,
  orderBy: string,
  is_mock_data: boolean,
  transaction: Transaction,
): Promise<string> {
  const rows = (await sequelize.query(
    `SELECT atttypid::regtype::text AS status_type FROM pg_attribute
      WHERE attrelid = :table::regclass AND attname = 'status' AND NOT attisdropped;`,
    { replacements: { table }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ status_type: string }>;
  const statusType = rows[0]?.status_type;
  if (!statusType) throw new Error(`${table} has no status column to seed`);

  if (!is_mock_data) return `'Not started'::${statusType}`;
  // STATUSES is a local const of fixed labels, so inlining it is not untrusted
  // input; it cannot be a bind parameter because the cast target varies by table.
  const labels = STATUSES.map((status) => `'${status}'`).join(", ");
  return `(ARRAY[${labels}])[((row_number() OVER (ORDER BY ${orderBy}) - 1) % ${STATUSES.length}) + 1]::${statusType}`;
}

/**
 * Populate impl tables for a newly-added (project, framework) pair. Called
 * by the per-framework wrapper after the projects_frameworks row has been
 * inserted by addFrameworkToProjectQuery.
 */
async function createFrameworkForProject(
  frameworkKey: string,
  frameworkId: number,
  projectId: number,
  organizationId: number,
  transaction: Transaction,
  is_mock_data: boolean,
): Promise<{ l2Rows: number; l3Rows: number }> {
  const { tables, cols, demo } = getConfig(frameworkKey);

  const projectFramework = await getProjectFramework(
    frameworkId,
    projectId,
    organizationId,
    transaction,
  );
  if (!projectFramework) {
    throw new Error(
      `projects_frameworks row missing for (project=${projectId}, framework=${frameworkId})`,
    );
  }
  const { id: pfId, owner, is_demo: isDemo } = projectFramework;
  const demoOwner = is_mock_data ? owner : null;
  // Same rotation the row-by-row seeders use, expressed in SQL so the whole
  // level still inserts in one statement.
  const dueDate = is_mock_data
    ? `(NOW() + ((ARRAY[${DEMO_DUE_DATE_OFFSET_DAYS.join(", ")}])[((row_number() OVER (ORDER BY %ORDER%) - 1) % ${DEMO_DUE_DATE_OFFSET_DAYS.length}) + 1] || ' days')::interval)`
    : "NULL";

  const l2Status = await statusExpression(tables.l2_impl, "l2.id", is_mock_data, transaction);
  const [l2Res] = await sequelize.query(
    `INSERT INTO ${tables.l2_impl}
       (organization_id, ${cols.l2_impl_meta}, projects_frameworks_id, status,
        owner, reviewer, approver, due_date, is_demo)
     SELECT :orgId, l2.id, :pfId, ${l2Status},
            :owner, :owner, :owner, ${dueDate.replace("%ORDER%", "l2.id")}, :isDemo
       FROM ${tables.l2_struct} l2
       JOIN ${tables.l1_struct} l1 ON l2.${cols.l2_struct_parent} = l1.id
      WHERE l1.framework_id = :frameworkId
      ORDER BY l2.id
     RETURNING id;`,
    {
      replacements: { orgId: organizationId, pfId, frameworkId, owner: demoOwner, isDemo },
      transaction,
    },
  );
  const l2Rows = (l2Res as Array<{ id: number }>).length;

  // Demo narrative is applied as a second statement keyed by the struct title,
  // so the insert above stays one generic statement for all 21 frameworks and a
  // framework without demo text costs nothing.
  if (is_mock_data && demo && Object.keys(demo).length > 0) {
    const entries = Object.entries(demo);
    const values = entries.map((_, i) => `(:title${i}, :impl${i}, :feedback${i})`).join(", ");
    const replacements: Record<string, string | number> = {
      orgId: organizationId,
      pfId,
    };
    entries.forEach(([title, entry], i) => {
      replacements[`title${i}`] = title;
      replacements[`impl${i}`] = entry.implementation_description;
      replacements[`feedback${i}`] = entry.auditor_feedback;
    });
    await sequelize.query(
      `UPDATE ${tables.l2_impl} AS impl
          SET implementation_description = d.implementation_description,
              auditor_feedback = d.auditor_feedback
         FROM ${tables.l2_struct} l2, (VALUES ${values}) AS d(title, implementation_description, auditor_feedback)
        WHERE impl.organization_id = :orgId
          AND impl.projects_frameworks_id = :pfId
          AND impl.${cols.l2_impl_meta} = l2.id
          AND l2.title = d.title;`,
      { replacements, transaction },
    );
  }

  let l3Rows = 0;
  if (tables.l3_impl && tables.l3_struct && cols.l3_impl_meta && cols.l3_impl_parent) {
    const l3Status = await statusExpression(tables.l3_impl, "l3.id", is_mock_data, transaction);
    const [l3Res] = await sequelize.query(
      `INSERT INTO ${tables.l3_impl}
         (organization_id, ${cols.l3_impl_meta}, ${cols.l3_impl_parent},
          projects_frameworks_id, status, owner, reviewer, approver, due_date, is_demo)
       SELECT :orgId, l3.id, l2_impl.id, :pfId, ${l3Status},
              :owner, :owner, :owner, ${dueDate.replace("%ORDER%", "l3.id")}, :isDemo
         FROM ${tables.l3_struct} l3
         JOIN ${tables.l2_struct} l2 ON l3.${cols.l3_struct_parent} = l2.id
         JOIN ${tables.l1_struct} l1 ON l2.${cols.l2_struct_parent} = l1.id
         JOIN ${tables.l2_impl} l2_impl
           ON l2_impl.${cols.l2_impl_meta} = l2.id
          AND l2_impl.projects_frameworks_id = :pfId
        WHERE l1.framework_id = :frameworkId
        ORDER BY l3.id
       RETURNING id;`,
      {
        replacements: { orgId: organizationId, pfId, frameworkId, owner: demoOwner, isDemo },
        transaction,
      },
    );
    l3Rows = (l3Res as unknown[]).length;
  }

  return { l2Rows, l3Rows };
}

/**
 * Remove a framework from a project. Deletes file_entity_links tied to this
 * framework's impl rows for this project, then deletes the
 * projects_frameworks row (CASCADE removes impl and risk rows).
 *
 * File cleanup filters by the framework_type / entity_type declared in
 * Servers/structures/ — same keys the app writes when a user attaches a
 * file to a control/article/etc.
 */
async function deleteFrameworkFromProject(
  frameworkKey: string,
  frameworkId: number,
  projectId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<boolean> {
  const { framework_type, tables, entity_types } = getConfig(frameworkKey);

  const pfId = await getProjectFrameworkId(frameworkId, projectId, organizationId, transaction);
  if (!pfId) return false;

  // L2 file links.
  await sequelize.query(
    `DELETE FROM file_entity_links
      WHERE organization_id = :orgId
        AND framework_type = :framework_type
        AND entity_type = :entity_type
        AND entity_id IN (
          SELECT id FROM ${tables.l2_impl} WHERE projects_frameworks_id = :pfId
        );`,
    {
      replacements: {
        orgId: organizationId,
        framework_type,
        entity_type: entity_types.l2_impl,
        pfId,
      },
      transaction,
    },
  );

  // L3 file links (three-level only).
  if (tables.l3_impl && entity_types.l3_impl) {
    await sequelize.query(
      `DELETE FROM file_entity_links
        WHERE organization_id = :orgId
          AND framework_type = :framework_type
          AND entity_type = :entity_type
          AND entity_id IN (
            SELECT id FROM ${tables.l3_impl} WHERE projects_frameworks_id = :pfId
          );`,
      {
        replacements: {
          orgId: organizationId,
          framework_type,
          entity_type: entity_types.l3_impl,
          pfId,
        },
        transaction,
      },
    );
  }

  // Deleting the projects_frameworks row cascades to impl rows, and impl
  // deletion cascades to __risks rows via their FKs.
  const result = (await sequelize.query(
    `DELETE FROM projects_frameworks
      WHERE id = :pfId AND organization_id = :orgId
      RETURNING id;`,
    {
      replacements: { pfId, orgId: organizationId },
      type: QueryTypes.DELETE,
      transaction,
    },
  )) as unknown as Array<{ id: number }>;

  return Array.isArray(result) && result.length > 0;
}

// -------------------------------------------------------------------------
// Per-framework wrappers. Named to mirror the built-in ones and wired into
// frameworkAdditionMap / frameworkDeletionMap by framework id.
// -------------------------------------------------------------------------

type CreateFn = (
  projectId: number,
  enableAiDataInsertion: boolean,
  organizationId: number,
  transaction: Transaction,
  is_mock_data?: boolean,
) => Promise<object>;

type DeleteFn = (
  projectId: number,
  organizationId: number,
  transaction: Transaction,
) => Promise<boolean>;

const makeCreate = (key: string): CreateFn => {
  const { id } = getConfig(key);
  // These frameworks ship no demo text, so enableAiDataInsertion has nothing to
  // fill; is_mock_data still drives the status walk, owner and is_demo tagging.
  return (projectId, _en, organizationId, transaction, is_mock_data = false) =>
    createFrameworkForProject(key, id, projectId, organizationId, transaction, is_mock_data);
};

const makeDelete = (key: string): DeleteFn => {
  const { id } = getConfig(key);
  return (projectId, organizationId, transaction) =>
    deleteFrameworkFromProject(key, id, projectId, organizationId, transaction);
};

// SOC 2 (id=5)
export const createSOC2FrameworkQuery = makeCreate("soc2");
export const deleteProjectFrameworkSOC2Query = makeDelete("soc2");

// GDPR (id=6)
export const createGDPRFrameworkQuery = makeCreate("gdpr");
export const deleteProjectFrameworkGDPRQuery = makeDelete("gdpr");

// PCI-DSS (id=7)
export const createPCIDSSFrameworkQuery = makeCreate("pci-dss");
export const deleteProjectFrameworkPCIDSSQuery = makeDelete("pci-dss");

// CCPA (id=8)
export const createCCPAFrameworkQuery = makeCreate("ccpa");
export const deleteProjectFrameworkCCPAQuery = makeDelete("ccpa");

// DORA (id=9)
export const createDORAFrameworkQuery = makeCreate("dora");
export const deleteProjectFrameworkDORAQuery = makeDelete("dora");

// ALTAI (id=10)
export const createALTAIFrameworkQuery = makeCreate("altai");
export const deleteProjectFrameworkALTAIQuery = makeDelete("altai");

// FTC AI Guidelines (id=11)
export const createFTCAIGuidelinesFrameworkQuery = makeCreate("ftc-ai-guidelines");
export const deleteProjectFrameworkFTCAIGuidelinesQuery = makeDelete("ftc-ai-guidelines");

// NYC Local Law 144 (id=12)
export const createNYCLocalLaw144FrameworkQuery = makeCreate("nyc-local-law-144");
export const deleteProjectFrameworkNYCLocalLaw144Query = makeDelete("nyc-local-law-144");

// CIS Controls (id=13)
export const createCISControlsFrameworkQuery = makeCreate("cis-controls");
export const deleteProjectFrameworkCISControlsQuery = makeDelete("cis-controls");

// AI Ethics & Governance (id=14)
export const createAIEthicsFrameworkQuery = makeCreate("ai-ethics");
export const deleteProjectFrameworkAIEthicsQuery = makeDelete("ai-ethics");

// OECD AI Principles (id=15)
export const createOECDAIPrinciplesFrameworkQuery = makeCreate("oecd-ai-principles");
export const deleteProjectFrameworkOECDAIPrinciplesQuery = makeDelete("oecd-ai-principles");

// Data Governance (id=16)
export const createDataGovernanceFrameworkQuery = makeCreate("data-governance");
export const deleteProjectFrameworkDataGovernanceQuery = makeDelete("data-governance");

// UAE PDPL (id=17)
export const createUAEPDPLFrameworkQuery = makeCreate("uae-pdpl");
export const deleteProjectFrameworkUAEPDPLQuery = makeDelete("uae-pdpl");

// Saudi PDPL (id=18)
export const createSaudiPDPLFrameworkQuery = makeCreate("saudi-pdpl");
export const deleteProjectFrameworkSaudiPDPLQuery = makeDelete("saudi-pdpl");

// Qatar PDPL (id=19)
export const createQatarPDPLFrameworkQuery = makeCreate("qatar-pdpl");
export const deleteProjectFrameworkQatarPDPLQuery = makeDelete("qatar-pdpl");

// Bahrain PDPL (id=20)
export const createBahrainPDPLFrameworkQuery = makeCreate("bahrain-pdpl");
export const deleteProjectFrameworkBahrainPDPLQuery = makeDelete("bahrain-pdpl");

// Quebec Law 25 (id=21)
export const createQuebecLaw25FrameworkQuery = makeCreate("quebec-law25");
export const deleteProjectFrameworkQuebecLaw25Query = makeDelete("quebec-law25");

// Texas AI Act (id=22)
export const createTexasAIActFrameworkQuery = makeCreate("texas-ai-act");
export const deleteProjectFrameworkTexasAIActQuery = makeDelete("texas-ai-act");

// Colorado AI Act (id=23)
export const createColoradoAIActFrameworkQuery = makeCreate("colorado-ai-act");
export const deleteProjectFrameworkColoradoAIActQuery = makeDelete("colorado-ai-act");

// HIPAA (id=24)
export const createHIPAAFrameworkQuery = makeCreate("hipaa");
export const deleteProjectFrameworkHIPAAQuery = makeDelete("hipaa");

// NIST CSF (id=25)
export const createNISTCSFFrameworkQuery = makeCreate("nist-csf");
export const deleteProjectFrameworkNISTCSFQuery = makeDelete("nist-csf");
