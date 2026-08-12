import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
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
  const rows = (await sequelize.query(
    `SELECT id FROM projects_frameworks
      WHERE organization_id = :orgId AND project_id = :projectId AND framework_id = :frameworkId
      LIMIT 1;`,
    {
      replacements: { orgId: organizationId, projectId, frameworkId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ id: number }>;
  return rows[0]?.id ?? null;
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
): Promise<{ l2Rows: number; l3Rows: number }> {
  const { tables, cols } = getConfig(frameworkKey);

  const pfId = await getProjectFrameworkId(frameworkId, projectId, organizationId, transaction);
  if (!pfId) {
    throw new Error(
      `projects_frameworks row missing for (project=${projectId}, framework=${frameworkId})`,
    );
  }

  const [l2Res] = await sequelize.query(
    `INSERT INTO ${tables.l2_impl}
       (organization_id, ${cols.l2_impl_meta}, projects_frameworks_id, status)
     SELECT :orgId, l2.id, :pfId, 'Not started'
       FROM ${tables.l2_struct} l2
       JOIN ${tables.l1_struct} l1 ON l2.${cols.l2_struct_parent} = l1.id
      WHERE l1.framework_id = :frameworkId
     RETURNING id;`,
    {
      replacements: { orgId: organizationId, pfId, frameworkId },
      transaction,
    },
  );
  const l2Rows = (l2Res as Array<{ id: number }>).length;

  let l3Rows = 0;
  if (tables.l3_impl && tables.l3_struct && cols.l3_impl_meta && cols.l3_impl_parent) {
    const [l3Res] = await sequelize.query(
      `INSERT INTO ${tables.l3_impl}
         (organization_id, ${cols.l3_impl_meta}, ${cols.l3_impl_parent},
          projects_frameworks_id, status)
       SELECT :orgId, l3.id, l2_impl.id, :pfId, 'Not started'
         FROM ${tables.l3_struct} l3
         JOIN ${tables.l2_struct} l2 ON l3.${cols.l3_struct_parent} = l2.id
         JOIN ${tables.l1_struct} l1 ON l2.${cols.l2_struct_parent} = l1.id
         JOIN ${tables.l2_impl} l2_impl
           ON l2_impl.${cols.l2_impl_meta} = l2.id
          AND l2_impl.projects_frameworks_id = :pfId
        WHERE l1.framework_id = :frameworkId
       RETURNING id;`,
      {
        replacements: { orgId: organizationId, pfId, frameworkId },
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
) => Promise<Object>;

type DeleteFn = (
  projectId: number,
  organizationId: number,
  transaction: Transaction,
) => Promise<boolean>;

const makeCreate = (key: string): CreateFn => {
  const { id } = getConfig(key);
  return (projectId, _en, organizationId, transaction) =>
    createFrameworkForProject(key, id, projectId, organizationId, transaction);
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
