import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { EvidenceHubModel } from "../domain.layer/models/evidenceHub/evidenceHub.model";
import {
  getAllEvidencesQuery,
  getEvidenceByIdQuery,
  createNewEvidenceQuery,
  updateEvidenceByIdQuery,
  deleteEvidenceByIdQuery,
} from "../utils/evidenceHub.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import {
  recordEvidenceAddedToModel,
  recordEvidenceRemovedFromModel,
  recordEvidenceFieldChangeForModel,
} from "../utils/modelInventoryChangeHistory.utils";
import { sanitizeUserHtml } from "../utils/sanitization/sanitizeUserHtml.utils";
import { safeRollback } from "../utils/safeRollback.utils";
import { logFailure } from "../utils/logger/logHelper";

export async function getAllEvidences(req: Request, res: Response) {
  logStructured(
    "processing",
    "starting getAllEvidences",
    "getAllEvidences",
    "evidenceHub.controller.ts",
  );
  logger.debug("🔍 Fetching all evidences");

  try {
    const evidences = await getAllEvidencesQuery(req.organizationId!);

    if (evidences && evidences.length > 0) {
      logStructured(
        "successful",
        "evidences found",
        "getAllEvidences",
        "evidenceHub.controller.ts",
      );
      return res.status(200).json(STATUS_CODE[200](evidences));
    }

    logStructured(
      "successful",
      "no evidences found",
      "getAllEvidences",
      "evidenceHub.controller.ts",
    );
    return res.status(200).json(STATUS_CODE[200](evidences));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve evidences",
      "getAllEvidences",
      "evidenceHub.controller.ts",
    );
    logger.error("❌ Error in getAllEvidences:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get evidence by ID
 */
export async function getEvidenceById(req: Request, res: Response) {
  const evidenceId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  if (isNaN(evidenceId)) {
    logStructured(
      "error",
      `Invalid evidence ID parameter: ${req.params.id}`,
      "getEvidenceById",
      "evidenceHub.controller.ts",
    );
    return res.status(400).json({
      status: "error",
      message: "Invalid evidence ID",
      code: "INVALID_PARAMETER",
    });
  }

  try {
    const evidence = (await getEvidenceByIdQuery(
      evidenceId,
      req.organizationId!,
    )) as EvidenceHubModel;
    if (evidence) {
      logStructured(
        "successful",
        `evidence found: ${evidenceId}`,
        "getEvidenceById",
        "evidenceHub.controller.ts",
      );
      return res.status(200).json(STATUS_CODE[200](evidence.toSafeJSON()));
    }

    logStructured(
      "successful",
      `no evidence found: ${evidenceId}`,
      "getEvidenceById",
      "evidenceHub.controller.ts",
    );
    return res.status(204).json(STATUS_CODE[204](null));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve evidence",
      "getEvidenceById",
      "evidenceHub.controller.ts",
    );
    logger.error("❌ Error in getEvidenceById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Create new evidence
 */
export async function createNewEvidence(req: Request, res: Response) {
  // You can add proper validation here if needed
  const transaction = await sequelize.transaction();
  try {
    const evidence = new EvidenceHubModel({
      ...req.body,
      description: sanitizeUserHtml(req.body.description),
      uploaded_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    // evidence_files is not a @Column — Sequelize's constructor strips it.
    // Re-attach so createNewEvidenceQuery can create file_entity_links rows.
    (evidence as any).evidence_files = req.body.evidence_files;

    const savedEvidence = await createNewEvidenceQuery(evidence, req.organizationId!, transaction);

    // Track evidence addition for all mapped models
    if (savedEvidence.mapped_model_ids && savedEvidence.mapped_model_ids.length > 0) {
      for (const modelId of savedEvidence.mapped_model_ids) {
        await recordEvidenceAddedToModel(
          modelId,
          req.userId!,
          req.organizationId!,
          savedEvidence.evidence_name,
          savedEvidence.evidence_type,
          transaction,
        );
      }
    }

    await transaction.commit();

    logStructured(
      "successful",
      "new evidence created",
      "createNewEvidence",
      "evidenceHub.controller.ts",
    );
    return res.status(201).json(STATUS_CODE[201](savedEvidence.toSafeJSON()));
  } catch (error) {
    await safeRollback(transaction, {
      req,
      functionName: "createNewEvidence",
      fileName: "evidenceHub.ctrl.ts",
      originatingError: error,
    });
    await logFailure({
      eventType: "Create",
      description: `Failed to create new evidence at ${req.method} ${req.originalUrl ?? req.url}`,
      functionName: "createNewEvidence",
      fileName: "evidenceHub.ctrl.ts",
      error: error as Error,
      userId: req.userId ?? 0,
      organizationId: req.organizationId,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Update evidence by ID
 */
export async function updateEvidenceById(req: Request, res: Response) {
  const evidenceId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (isNaN(evidenceId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid evidence ID",
      code: "INVALID_PARAMETER",
    });
  }

  const transaction = await sequelize.transaction();
  try {
    const existingEvidence = (await getEvidenceByIdQuery(
      evidenceId,
      req.organizationId!,
    )) as EvidenceHubModel;
    if (!existingEvidence) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Evidence not found")));
    }

    // Track model mapping changes
    const oldMappedModels = existingEvidence.mapped_model_ids || [];
    const newMappedModels = req.body.mapped_model_ids || [];

    // Models that were added
    const addedModels = newMappedModels.filter((id: number) => !oldMappedModels.includes(id));
    // Models that were removed
    const removedModels = oldMappedModels.filter((id) => !newMappedModels.includes(id));

    // Track field changes for models that remain mapped
    const continuingModels = newMappedModels.filter((id: number) => oldMappedModels.includes(id));

    const sanitizedBody =
      req.body && Object.prototype.hasOwnProperty.call(req.body, "description")
        ? { ...req.body, description: sanitizeUserHtml(req.body.description) }
        : req.body;
    Object.assign(existingEvidence, { ...sanitizedBody, updated_at: new Date() });
    const updatedEvidence = await updateEvidenceByIdQuery(
      evidenceId,
      existingEvidence,
      req.organizationId!,
      transaction,
    );

    // Record evidence added to new models
    for (const modelId of addedModels) {
      await recordEvidenceAddedToModel(
        modelId,
        req.userId!,
        req.organizationId!,
        updatedEvidence.evidence_name,
        updatedEvidence.evidence_type,
        transaction,
      );
    }

    // Record evidence removed from old models
    for (const modelId of removedModels) {
      await recordEvidenceRemovedFromModel(
        modelId,
        req.userId!,
        req.organizationId!,
        existingEvidence.evidence_name,
        existingEvidence.evidence_type,
        transaction,
      );
    }

    // Track field changes for continuing models
    if (continuingModels.length > 0) {
      // Check each field for changes
      const fieldsToTrack = [
        { field: "evidence_name", label: "Name" },
        { field: "evidence_type", label: "Type" },
        { field: "description", label: "Description" },
        { field: "expiry_date", label: "Expiry Date" },
      ];

      for (const { field, label } of fieldsToTrack) {
        const oldValue = (existingEvidence as any)[field];
        const newValue = req.body[field];

        if (newValue !== undefined && oldValue !== newValue) {
          const oldStr = oldValue ? String(oldValue) : "-";
          const newStr = newValue ? String(newValue) : "-";

          if (oldStr !== newStr) {
            // Record for all continuing models
            for (const modelId of continuingModels) {
              await recordEvidenceFieldChangeForModel(
                modelId,
                req.userId!,
                req.organizationId!,
                updatedEvidence.evidence_name,
                label,
                oldStr,
                newStr,
                transaction,
              );
            }
          }
        }
      }
    }

    await transaction.commit();

    return res.status(200).json(STATUS_CODE[200](updatedEvidence.toSafeJSON()));
  } catch (error) {
    await safeRollback(transaction, {
      req,
      functionName: "updateEvidenceById",
      fileName: "evidenceHub.ctrl.ts",
      originatingError: error,
    });
    await logFailure({
      eventType: "Update",
      description: `Failed to update evidence at ${req.method} ${req.originalUrl ?? req.url}`,
      functionName: "updateEvidenceById",
      fileName: "evidenceHub.ctrl.ts",
      error: error as Error,
      userId: req.userId ?? 0,
      organizationId: req.organizationId,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Delete evidence by ID
 */
export async function deleteEvidenceById(req: Request, res: Response) {
  const evidenceId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (isNaN(evidenceId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid evidence ID",
      code: "INVALID_PARAMETER",
    });
  }

  const transaction = await sequelize.transaction();
  try {
    const existingEvidence = (await getEvidenceByIdQuery(
      evidenceId,
      req.organizationId!,
    )) as EvidenceHubModel;
    if (!existingEvidence) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Evidence not found")));
    }

    // Track evidence removal for all mapped models
    if (existingEvidence.mapped_model_ids && existingEvidence.mapped_model_ids.length > 0) {
      for (const modelId of existingEvidence.mapped_model_ids) {
        await recordEvidenceRemovedFromModel(
          modelId,
          req.userId!,
          req.organizationId!,
          existingEvidence.evidence_name,
          existingEvidence.evidence_type,
          transaction,
        );
      }
    }

    await deleteEvidenceByIdQuery(evidenceId, req.organizationId!, transaction);
    await transaction.commit();

    return res.status(200).json(STATUS_CODE[200](req.t!("Evidence deleted successfully")));
  } catch (error) {
    await safeRollback(transaction, {
      req,
      functionName: "deleteEvidenceById",
      fileName: "evidenceHub.ctrl.ts",
      originatingError: error,
    });
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete evidence at ${req.method} ${req.originalUrl ?? req.url}`,
      functionName: "deleteEvidenceById",
      fileName: "evidenceHub.ctrl.ts",
      error: error as Error,
      userId: req.userId ?? 0,
      organizationId: req.organizationId,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
