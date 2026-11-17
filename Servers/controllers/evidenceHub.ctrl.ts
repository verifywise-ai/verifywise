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
import { sanitizeUserHtml } from "../utils/sanitization.utils";
import { translateError } from "../utils/i18n.utils";
import {
  recordEvidenceAddedToModel,
  recordEvidenceRemovedFromModel,
  recordEvidenceFieldChangeForModel,
} from "../utils/modelInventoryChangeHistory.utils";
import { runEvidenceFreshnessSweep } from "../services/automations/actions/evidenceFreshnessSweep";
import { trackEntityChanges, recordMultipleFieldChanges } from "../utils/changeHistory.base.utils";
import { requestHasPermission } from "../utils/rolePermissions.utils";
import type { PermissionKey } from "../config/rolePermissions.config";

const hasLinks = (ids: unknown): boolean => Array.isArray(ids) && ids.length > 0;

/**
 * Each link field of a piece of evidence and the permission that changes
 * what it links to. There is no evidence edit permission of its own
 * (evidence.admin only runs the freshness sweep): evidence is written from the
 * model pages, the training registry and the risk screens.
 */
const EVIDENCE_LINK_PERMISSIONS = [
  ["mapped_model_ids", "model.edit"],
  ["mapped_training_ids", "training.edit"],
  ["mapped_risk_ids", "risks.edit"],
] as const satisfies readonly (readonly [string, PermissionKey])[];

/**
 * Whether the caller may write evidence whose rows (the stored one and the
 * request body) carry these links. Deny by default: at least one of the
 * permissions above, and for every link field set on either row, its own.
 */
async function canWriteEvidence(
  req: Request,
  rows: (Record<string, unknown> | null | undefined)[],
): Promise<boolean> {
  const held = new Map<PermissionKey, boolean>();
  for (const [, key] of EVIDENCE_LINK_PERMISSIONS) {
    held.set(key, await requestHasPermission(req, key));
  }
  if (![...held.values()].some(Boolean)) return false;
  return EVIDENCE_LINK_PERMISSIONS.every(
    ([field, key]) => held.get(key) || !rows.some((row) => hasLinks(row?.[field])),
  );
}

/** The fields a request may set on evidence; anything else in the body is ignored. */
const EVIDENCE_WRITABLE_FIELDS = [
  "evidence_name",
  "evidence_type",
  "description",
  "mapped_model_ids",
  "mapped_training_ids",
  "mapped_risk_ids",
  "evidence_files",
  "deleteFiles",
] as const;

function pickEvidenceFields(body: unknown): Record<string, unknown> {
  const source = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of EVIDENCE_WRITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  if (out.description !== undefined) {
    out.description = sanitizeUserHtml(out.description as string);
  }
  return out;
}

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
    return res.status(400).json(
      STATUS_CODE[400]({
        status: "error",
        message: "Invalid evidence ID",
        code: "INVALID_PARAMETER",
      }),
    );
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
  const fields = pickEvidenceFields(req.body);
  if (!(await canWriteEvidence(req, [fields]))) {
    return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
  }
  const transaction = await sequelize.transaction();
  try {
    const evidence = new EvidenceHubModel({
      ...fields,
      description: sanitizeUserHtml(req.body?.description),
      uploaded_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    } as any);
    // evidence_files is not a @Column — Sequelize's constructor strips it.
    // Re-attach so createNewEvidenceQuery can create file_entity_links rows.
    (evidence as any).evidence_files = fields.evidence_files;

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
    await transaction.rollback();
    logStructured(
      "error",
      "failed to create new evidence",
      "createNewEvidence",
      "evidenceHub.controller.ts",
    );
    logger.error("❌ Error in createNewEvidence:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Update evidence by ID
 */
export async function updateEvidenceById(req: Request, res: Response) {
  const evidenceId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (isNaN(evidenceId)) {
    return res.status(400).json(
      STATUS_CODE[400]({
        status: "error",
        message: "Invalid evidence ID",
        code: "INVALID_PARAMETER",
      }),
    );
  }

  const transaction = await sequelize.transaction();
  try {
    const existingEvidence = (await getEvidenceByIdQuery(
      evidenceId,
      req.organizationId!,
    )) as EvidenceHubModel;
    if (!existingEvidence) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Evidence not found")));
    }
    const fields = pickEvidenceFields(req.body);
    if (!(await canWriteEvidence(req, [existingEvidence as any, fields]))) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
    }

    // Snapshot the fields the evidence hub change history tracks, before
    // the Object.assign below replaces them (#4915).
    const evidenceHubBefore = {
      evidence_name: existingEvidence.evidence_name,
      evidence_type: existingEvidence.evidence_type,
      description: existingEvidence.description,
    };

    // Track model mapping changes
    const oldMappedModels = existingEvidence.mapped_model_ids || [];
    const newMappedModels = (fields.mapped_model_ids as number[] | undefined) || [];

    // Models that were added
    const addedModels = newMappedModels.filter((id: number) => !oldMappedModels.includes(id));
    // Models that were removed
    const removedModels = oldMappedModels.filter((id) => !newMappedModels.includes(id));

    // Track field changes for models that remain mapped
    const continuingModels = newMappedModels.filter((id: number) => oldMappedModels.includes(id));

    Object.assign(existingEvidence, { ...fields, updated_at: new Date() });
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
        // The row was overwritten by the Object.assign above; the removal is
        // recorded under the evidence's name before this edit.
        evidenceHubBefore.evidence_name,
        evidenceHubBefore.evidence_type,
        transaction,
      );
    }

    // Record evidence hub field changes in its change history (#4915)
    const evidenceHubChanges = await trackEntityChanges(
      "evidence_hub",
      evidenceHubBefore,
      updatedEvidence,
    );
    if (evidenceHubChanges.length > 0) {
      await recordMultipleFieldChanges(
        "evidence_hub",
        evidenceId,
        req.userId!,
        req.organizationId!,
        evidenceHubChanges,
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
      ];

      for (const { field, label } of fieldsToTrack) {
        // From the snapshot: existingEvidence already holds the new values.
        const oldValue = (evidenceHubBefore as Record<string, unknown>)[field];
        const newValue = fields[field];

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
    await transaction.rollback();
    logger.error("❌ Error in updateEvidenceById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Run the evidence-freshness sweep for the caller's organization, synchronously.
 * Manual trigger for the 05:00 job — mirrors POST /riskLinks/recompute. The
 * sweep is idempotent, so a hand-run is safe and a second run reports zero
 * transitions.
 */
export async function runFreshnessSweep(req: Request, res: Response): Promise<any> {
  logStructured(
    "processing",
    "starting runFreshnessSweep",
    "runFreshnessSweep",
    "evidenceHub.controller.ts",
  );

  try {
    const summary = await runEvidenceFreshnessSweep(req.organizationId!);
    logStructured(
      "successful",
      "freshness sweep completed",
      "runFreshnessSweep",
      "evidenceHub.controller.ts",
    );
    return res.status(200).json(STATUS_CODE[200](summary));
  } catch (error) {
    logStructured(
      "error",
      "failed to run freshness sweep",
      "runFreshnessSweep",
      "evidenceHub.controller.ts",
    );
    logger.error("❌ Error in runFreshnessSweep:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Delete evidence by ID
 */
export async function deleteEvidenceById(req: Request, res: Response) {
  const evidenceId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (isNaN(evidenceId)) {
    return res.status(400).json(
      STATUS_CODE[400]({
        status: "error",
        message: "Invalid evidence ID",
        code: "INVALID_PARAMETER",
      }),
    );
  }

  const transaction = await sequelize.transaction();
  try {
    const existingEvidence = (await getEvidenceByIdQuery(
      evidenceId,
      req.organizationId!,
    )) as EvidenceHubModel;
    if (!existingEvidence) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Evidence not found")));
    }
    if (!(await canWriteEvidence(req, [existingEvidence as any]))) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
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
    await transaction.rollback();
    logger.error("❌ Error in deleteEvidenceById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
