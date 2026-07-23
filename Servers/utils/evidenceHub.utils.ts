import { sequelize } from "../database/db";
import { Transaction, QueryTypes } from "sequelize";
import { EvidenceHubModel } from "../domain.layer/models/evidenceHub/evidenceHub.model";
import {
  getEvidenceFilesForEntity,
  getEvidenceFilesForEntities,
  createFileEntityLink,
  deleteFileEntityLink,
} from "./files/evidenceFiles.utils";

// Helper to normalize a date value to an ISO string or null
const toISO = (d: any): string | null => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? null : date.toISOString();
};

// Get all evidences (includes evidence_hub records + NIST AI RMF virtual records)
export const getAllEvidencesQuery = async (organizationId: number) => {
  // 1. Fetch evidence_hub records as plain objects
  const evidenceHubRecords = (await sequelize.query(
    `SELECT * FROM evidence_hub WHERE organization_id = :organizationId ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  )) as any[];

  // 2. Fetch NIST AI RMF subcategories that have evidence files
  const nistRecords = (await sequelize.query(
    `SELECT
      s.id AS entity_id,
      ss.subcategory_id AS index,
      ss.description,
      s.reviewer,
      s.owner,
      MIN(fel.created_at) AS created_at
    FROM nist_ai_rmf_subcategories s
    JOIN nist_ai_rmf_subcategories_struct ss ON s.subcategory_meta_id = ss.id
    JOIN file_entity_links fel ON fel.entity_id = s.id
      AND fel.framework_type = 'nist_ai_rmf'
      AND fel.entity_type = 'subcategory'
      AND fel.link_type = 'evidence'
      AND fel.organization_id = s.organization_id
    WHERE s.organization_id = :organizationId
    GROUP BY s.id, ss.subcategory_id, ss.description, s.reviewer, s.owner
    ORDER BY MIN(fel.created_at) DESC, s.id ASC`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  )) as any[];

  // 3. Batch fetch evidence files for evidence_hub records
  const evidenceHubIds = evidenceHubRecords.map((e) => e.id);
  let evidenceHubFilesMap = new Map<number, any[]>();
  if (evidenceHubIds.length > 0) {
    evidenceHubFilesMap = await getEvidenceFilesForEntities(
      organizationId,
      "evidence_hub",
      "evidence",
      evidenceHubIds,
    );
  }

  // 4. Batch fetch evidence files for NIST records
  const nistEntityIds = nistRecords.map((r) => r.entity_id);
  let nistFilesMap = new Map<number, any[]>();
  if (nistEntityIds.length > 0) {
    nistFilesMap = await getEvidenceFilesForEntities(
      organizationId,
      "nist_ai_rmf",
      "subcategory",
      nistEntityIds,
    );
  }

  // 5. Build unified result set
  const results: any[] = [];

  // Add evidence_hub records
  for (const record of evidenceHubRecords) {
    results.push({
      id: record.id,
      evidence_name: record.evidence_name,
      evidence_type: record.evidence_type,
      description: record.description,
      expiry_date: toISO(record.expiry_date),
      mapped_model_ids: record.mapped_model_ids,
      mapped_training_ids: record.mapped_training_ids,
      tags: record.tags,
      framework_ids: record.framework_ids,
      reviewer_id: record.reviewer_id,
      retention_policy: record.retention_policy,
      created_at: toISO(record.created_at),
      updated_at: toISO(record.updated_at),
      evidence_files: evidenceHubFilesMap.get(record.id) || [],
    });
  }

  // Add NIST AI RMF virtual records
  for (const record of nistRecords) {
    results.push({
      id: -record.entity_id, // negative ID to avoid collisions with evidence_hub
      evidence_name: `${record.index}: ${record.description}`,
      evidence_type: "NIST AI RMF",
      description: record.description,
      expiry_date: null,
      mapped_model_ids: null,
      mapped_training_ids: null,
      tags: [],
      framework_ids: ["nist_ai_rmf"],
      reviewer_id: record.reviewer,
      retention_policy: null,
      created_at: toISO(record.created_at),
      updated_at: toISO(record.created_at),
      evidence_files: nistFilesMap.get(record.entity_id) || [],
    });
  }

  return results;
};

// Get evidence by ID
export const getEvidenceByIdQuery = async (id: number, organizationId: number) => {
  const evidences = await sequelize.query(
    `SELECT * FROM evidence_hub WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: EvidenceHubModel,
    },
  );
  if (!evidences.length) return null;

  // Fetch evidence_files from file_entity_links
  const evidenceFiles = await getEvidenceFilesForEntity(
    organizationId,
    "evidence_hub",
    "evidence",
    id,
  );
  (evidences[0] as any).evidence_files = evidenceFiles;

  return evidences[0];
};

// Create new evidence
export const createNewEvidenceQuery = async (
  evidence: EvidenceHubModel & { evidence_files?: { id: string | number }[] },
  organizationId: number,
  transaction: Transaction,
) => {
  const created_at = new Date();
  try {
    // Insert without evidence_files (now managed via file_entity_links)
    const result = await sequelize.query(
      `INSERT INTO evidence_hub (
                organization_id,
                evidence_name,
                evidence_type,
                description,
                expiry_date,
                mapped_model_ids,
                mapped_training_ids,
                created_at,
                updated_at
            ) VALUES (
                :organizationId,
                :evidence_name,
                :evidence_type,
                :description,
                :expiry_date,
                :mapped_model_ids,
                :mapped_training_ids,
                :created_at,
                :updated_at
            ) RETURNING *`,
      {
        replacements: {
          organizationId,
          evidence_name: evidence.evidence_name,
          evidence_type: evidence.evidence_type,
          description: evidence.description ?? null,
          expiry_date: evidence.expiry_date ?? null,
          mapped_model_ids: evidence.mapped_model_ids
            ? `{${evidence.mapped_model_ids.join(",")}}`
            : null,
          mapped_training_ids: evidence.mapped_training_ids
            ? `{${evidence.mapped_training_ids.join(",")}}`
            : null,
          created_at,
          updated_at: created_at,
        },
        mapToModel: true,
        model: EvidenceHubModel,
        transaction,
      },
    );

    const createdEvidence = result[0];

    // Create file entity links for uploaded files
    if (evidence.evidence_files && Array.isArray(evidence.evidence_files)) {
      for (const file of evidence.evidence_files) {
        const fileId = typeof file.id === "string" ? parseInt(file.id) : file.id;
        await createFileEntityLink(
          organizationId,
          fileId,
          "evidence_hub",
          "evidence",
          createdEvidence.id!,
          "evidence",
          undefined,
          transaction,
        );
      }
    }

    // Fetch evidence_files for response
    const evidenceFiles = await getEvidenceFilesForEntity(
      organizationId,
      "evidence_hub",
      "evidence",
      createdEvidence.id!,
    );
    (createdEvidence as any).evidence_files = evidenceFiles;

    return createdEvidence;
  } catch (error) {
    console.error("Error creating new evidence:", error);
    throw error;
  }
};

// Update evidence by ID
export const updateEvidenceByIdQuery = async (
  id: number,
  evidence: EvidenceHubModel & {
    evidence_files?: { id: string | number }[];
    deleteFiles?: (string | number)[];
  },
  organizationId: number,
  transaction: Transaction,
) => {
  const updated_at = new Date();

  try {
    // Update without evidence_files (now managed via file_entity_links)
    await sequelize.query(
      `UPDATE evidence_hub SET
                evidence_name = :evidence_name,
                evidence_type = :evidence_type,
                description = :description,
                expiry_date = :expiry_date,
                mapped_model_ids = :mapped_model_ids,
                mapped_training_ids = :mapped_training_ids,
                updated_at = :updated_at
             WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: {
          organizationId,
          id,
          evidence_name: evidence.evidence_name,
          evidence_type: evidence.evidence_type,
          description: evidence.description,
          expiry_date: evidence.expiry_date,
          mapped_model_ids: evidence.mapped_model_ids
            ? `{${evidence.mapped_model_ids.join(",")}}`
            : null,
          mapped_training_ids: evidence.mapped_training_ids
            ? `{${evidence.mapped_training_ids.join(",")}}`
            : null,
          updated_at,
        },
        transaction,
      },
    );

    // Create file entity links for new uploaded files
    if (evidence.evidence_files && Array.isArray(evidence.evidence_files)) {
      for (const file of evidence.evidence_files) {
        const fileId = typeof file.id === "string" ? parseInt(file.id) : file.id;
        await createFileEntityLink(
          organizationId,
          fileId,
          "evidence_hub",
          "evidence",
          id,
          "evidence",
          undefined,
          transaction,
        );
      }
    }

    // Remove file entity links for deleted files
    if (evidence.deleteFiles && Array.isArray(evidence.deleteFiles)) {
      for (const fileId of evidence.deleteFiles) {
        const fId = typeof fileId === "string" ? parseInt(fileId) : fileId;
        await deleteFileEntityLink(
          organizationId,
          fId,
          "evidence_hub",
          "evidence",
          id,
          transaction,
        );
      }
    }

    const result = await sequelize.query(
      `SELECT * FROM evidence_hub WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: { organizationId, id },
        mapToModel: true,
        model: EvidenceHubModel,
        transaction,
      },
    );

    // Fetch evidence_files for response
    const evidenceFiles = await getEvidenceFilesForEntity(
      organizationId,
      "evidence_hub",
      "evidence",
      id,
    );
    (result[0] as any).evidence_files = evidenceFiles;

    return result[0];
  } catch (error) {
    console.error("Error updating evidence:", error);
    throw error;
  }
};

// Delete evidence by ID
export const deleteEvidenceByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction,
) => {
  try {
    // Clean up file_entity_links first
    await sequelize.query(
      `DELETE FROM file_entity_links
             WHERE organization_id = :organizationId
               AND framework_type = 'evidence_hub'
               AND entity_type = 'evidence'
               AND entity_id = :entityId`,
      {
        replacements: { organizationId, entityId: id },
        transaction,
      },
    );

    const result = (await sequelize.query(
      `DELETE FROM evidence_hub WHERE organization_id = :organizationId AND id = :id RETURNING *`,
      { replacements: { organizationId, id }, transaction },
    )) as [EvidenceHubModel[], number];

    return result[0][0];
  } catch (error) {
    console.error("Error deleting evidence:", error);
    throw error;
  }
};
