import { sequelize } from "../database/db";
import { Transaction } from "sequelize";
import { EvidenceHubModel } from "../domain.layer/models/evidenceHub/evidenceHub.model";
import { getEvidenceFilesForEntity, getEvidenceFilesForEntities, createFileEntityLink, deleteFileEntityLink } from "./files/evidenceFiles.utils";

// Get all evidences
export const getAllEvidencesQuery = async (organizationId: number) => {
    const evidences = await sequelize.query(
        `SELECT * FROM evidence_hub WHERE organization_id = :organizationId ORDER BY created_at DESC, id ASC`,
        {
            replacements: { organizationId },
            mapToModel: true,
            model: EvidenceHubModel,
        }
    );

    // Batch fetch evidence files from file_entity_links
    const evidenceIds = evidences.map((e) => e.id!);
    let filesMap = new Map<number, any[]>();
    if (evidenceIds.length > 0) {
        filesMap = await getEvidenceFilesForEntities(
            organizationId,
            "evidence_hub",
            "evidence",
            evidenceIds
        );
    }

    // Attach evidence_files to each evidence for backward compatibility
    for (const evidence of evidences) {
        (evidence as any).evidence_files = filesMap.get(evidence.id!) || [];
    }

    return evidences;
};

// Get evidence by ID
export const getEvidenceByIdQuery = async (id: number, organizationId: number) => {
    const evidences = await sequelize.query(
        `SELECT * FROM evidence_hub WHERE organization_id = :organizationId AND id = :id`,
        {
            replacements: { organizationId, id },
            mapToModel: true,
            model: EvidenceHubModel,
        }
    );
    if (!evidences.length) return null;

    // Fetch evidence_files from file_entity_links
    const evidenceFiles = await getEvidenceFilesForEntity(
        organizationId,
        "evidence_hub",
        "evidence",
        id
    );
    (evidences[0] as any).evidence_files = evidenceFiles;

    return evidences[0];
};

// Create new evidence
export const createNewEvidenceQuery = async (
    evidence: EvidenceHubModel & { evidence_files?: { id: string | number }[] },
    organizationId: number,
    transaction: Transaction
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
                created_at,
                updated_at
            ) VALUES (
                :organizationId,
                :evidence_name,
                :evidence_type,
                :description,
                :expiry_date,
                :mapped_model_ids,
                :created_at,
                :updated_at
            ) RETURNING *`,
            {
                replacements: {
                    organizationId,
                    evidence_name: evidence.evidence_name,
                    evidence_type: evidence.evidence_type,
                    description: evidence.description,
                    expiry_date: evidence.expiry_date,
                    mapped_model_ids: evidence.mapped_model_ids
                        ? `{${evidence.mapped_model_ids.join(",")}}`
                        : null,
                    created_at,
                    updated_at: created_at,
                },
                mapToModel: true,
                model: EvidenceHubModel,
                transaction,
            }
        );

        const createdEvidence = result[0];

        // Create file entity links for uploaded files
        if (evidence.evidence_files && Array.isArray(evidence.evidence_files)) {
            for (const file of evidence.evidence_files) {
                const fileId = typeof file.id === 'string' ? parseInt(file.id) : file.id;
                await createFileEntityLink(
                    organizationId,
                    fileId,
                    "evidence_hub",
                    "evidence",
                    createdEvidence.id!,
                    "evidence",
                    undefined,
                    transaction
                );
            }
        }

        // Fetch evidence_files for response
        const evidenceFiles = await getEvidenceFilesForEntity(
            organizationId,
            "evidence_hub",
            "evidence",
            createdEvidence.id!
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
    transaction: Transaction
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
                    updated_at,
                },
                transaction,
            }
        );

        // Create file entity links for new uploaded files
        if (evidence.evidence_files && Array.isArray(evidence.evidence_files)) {
            for (const file of evidence.evidence_files) {
                const fileId = typeof file.id === 'string' ? parseInt(file.id) : file.id;
                await createFileEntityLink(
                    organizationId,
                    fileId,
                    "evidence_hub",
                    "evidence",
                    id,
                    "evidence",
                    undefined,
                    transaction
                );
            }
        }

        // Remove file entity links for deleted files
        if (evidence.deleteFiles && Array.isArray(evidence.deleteFiles)) {
            for (const fileId of evidence.deleteFiles) {
                const fId = typeof fileId === 'string' ? parseInt(fileId) : fileId;
                await deleteFileEntityLink(
                    organizationId,
                    fId,
                    "evidence_hub",
                    "evidence",
                    id,
                    transaction
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
            }
        );

        // Fetch evidence_files for response
        const evidenceFiles = await getEvidenceFilesForEntity(
            organizationId,
            "evidence_hub",
            "evidence",
            id
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
    transaction: Transaction
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
            }
        );

        const result = (await sequelize.query(
            `DELETE FROM evidence_hub WHERE organization_id = :organizationId AND id = :id RETURNING *`,
            { replacements: { organizationId, id }, transaction }
        )) as [EvidenceHubModel[], number];

        return result[0][0];
    } catch (error) {
        console.error("Error deleting evidence:", error);
        throw error;
    }
};
