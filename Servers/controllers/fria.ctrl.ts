import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import { FriaStatus } from "../domain.layer/enums/fria-status.enum";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import { appendToAuditLedger } from "../utils/auditLedger.utils";
import {
  getEvidenceFilesForEntity,
  getEvidenceFilesForEntityTypes,
  createFileEntityLink,
  deleteFileEntityLinkById,
} from "../utils/files/evidenceFiles.utils";
import {
  getFriaByProjectIdQuery,
  getFriaByIdQuery,
  createFriaQuery,
  updateFriaQuery,
  getFriaRightsQuery,
  initializeFriaRightsQuery,
  bulkUpsertFriaRightsQuery,
  getFriaRiskItemsQuery,
  addFriaRiskItemQuery,
  updateFriaRiskItemQuery,
  deleteFriaRiskItemQuery,
  getFriaModelLinksQuery,
  linkModelToFriaQuery,
  unlinkModelFromFriaQuery,
  createFriaSnapshotQuery,
  getFriaSnapshotsQuery,
  getFriaSnapshotByVersionQuery,
  computeFriaScore,
  recomputeAndPersistScore,
} from "../utils/fria.utils";

const FILE_NAME = "fria.ctrl.ts";

/**
 * Get FRIA for a project. Auto-creates if none exists.
 */
export async function getFria(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting getFria",
    functionName: "getFria",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const projectId = parseInt(req.params.projectId as string);

    if (!projectId || isNaN(projectId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid project ID"));
    }

    // Verify project access and resolve owner name
    const projectResult = await sequelize.query<{
      id: number;
      project_title: string;
      owner: number | null;
      owner_name: string | null;
    }>(
      `SELECT p.id, p.project_title, p.owner,
              u.name || ' ' || u.surname AS owner_name
       FROM projects p
       LEFT JOIN users u ON p.owner = u.id
       WHERE p.id = :projectId AND p.organization_id = :organizationId`,
      { replacements: { projectId, organizationId }, type: QueryTypes.SELECT },
    );

    if (!projectResult || projectResult.length === 0) {
      return res.status(404).json(STATUS_CODE[404]("Project not found"));
    }

    let fria = await getFriaByProjectIdQuery(projectId, organizationId);

    // Auto-create FRIA if none exists
    if (!fria) {
      const transaction = await sequelize.transaction();
      try {
        const project = projectResult[0];

        const newFria = await createFriaQuery(
          {
            project_id: projectId,
            created_by: userId,
            assessment_owner: project.owner_name || undefined,
          },
          organizationId,
          transaction,
        );

        if (!newFria) {
          await transaction.rollback();
          return res.status(500).json(STATUS_CODE[500]("Failed to create FRIA"));
        }

        // Initialize all 10 rights rows
        await initializeFriaRightsQuery(newFria.id!, organizationId, transaction);

        await transaction.commit();

        try {
          await appendToAuditLedger({
            organizationId,
            entryType: "event_log",
            userId,
            eventType: "Create",
            entityType: "fria",
            entityId: newFria.id!,
            description: `FRIA auto-created for project ${projectId}`,
          });
        } catch {}

        fria = await getFriaByProjectIdQuery(projectId, organizationId);
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }

    if (!fria) {
      return res.status(500).json(STATUS_CODE[500]("Failed to load FRIA"));
    }

    // Fetch related data
    const [rights, riskItems, modelLinks] = await Promise.all([
      getFriaRightsQuery(fria.id!, organizationId),
      getFriaRiskItemsQuery(fria.id!, organizationId),
      getFriaModelLinksQuery(fria.id!, organizationId),
    ]);

    await logSuccess({
      eventType: "Read",
      description: `Retrieved FRIA for project ${projectId}`,
      functionName: "getFria",
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        assessment: fria,
        rights,
        riskItems,
        modelLinks,
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve FRIA",
      functionName: "getFria",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Update FRIA assessment fields and recompute score.
 */
export async function updateFria(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting updateFria",
    functionName: "updateFria",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const projectId = parseInt(req.params.projectId as string);
    const data = req.body;

    if (!projectId || isNaN(projectId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid project ID"));
    }

    const existing = await getFriaByProjectIdQuery(projectId, organizationId);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404]("FRIA not found for this project"));
    }

    const transaction = await sequelize.transaction();
    try {
      // Fetch rights and risk items in parallel for score computation
      const [rights, riskItems] = await Promise.all([
        getFriaRightsQuery(existing.id!, organizationId),
        getFriaRiskItemsQuery(existing.id!, organizationId),
      ]);

      // Merge user data with fresh scores in a single UPDATE
      const merged = { ...existing, ...data };
      const scores = computeFriaScore(merged, rights, riskItems);

      await updateFriaQuery(
        existing.id!,
        { ...data, ...scores },
        organizationId,
        userId,
        transaction,
      );

      await transaction.commit();

      const result = await getFriaByProjectIdQuery(projectId, organizationId);

      try {
        await appendToAuditLedger({
          organizationId,
          entryType: "event_log",
          userId,
          eventType: "Update",
          entityType: "fria",
          entityId: existing.id!,
          description: `FRIA updated for project ${projectId}`,
        });
      } catch {}

      await logSuccess({
        eventType: "Update",
        description: `Updated FRIA for project ${projectId}`,
        functionName: "updateFria",
        fileName: FILE_NAME,
        userId,
        organizationId,
      });

      return res.status(200).json(STATUS_CODE[200](result));
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "Failed to update FRIA",
      functionName: "updateFria",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Bulk upsert all 10 rights for a FRIA.
 */
export async function updateFriaRights(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting updateFriaRights",
    functionName: "updateFriaRights",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const friaId = parseInt(req.params.friaId as string);
    const { rights } = req.body;

    if (!friaId || isNaN(friaId) || !Array.isArray(rights)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid FRIA ID or rights data"));
    }

    const fria = await getFriaByIdQuery(friaId, organizationId);
    if (!fria) {
      return res.status(404).json(STATUS_CODE[404]("FRIA not found"));
    }

    const transaction = await sequelize.transaction();
    try {
      await bulkUpsertFriaRightsQuery(friaId, rights, organizationId, transaction);

      const [updatedRights, riskItems] = await Promise.all([
        getFriaRightsQuery(friaId, organizationId),
        getFriaRiskItemsQuery(friaId, organizationId),
      ]);
      const scores = computeFriaScore(fria, updatedRights, riskItems);

      await updateFriaQuery(friaId, scores, organizationId, userId, transaction);

      await transaction.commit();

      try {
        await appendToAuditLedger({
          organizationId,
          entryType: "event_log",
          userId,
          eventType: "Update",
          entityType: "fria",
          entityId: friaId,
          description: "FRIA rights updated",
        });
      } catch {}

      await logSuccess({
        eventType: "Update",
        description: `Updated FRIA rights for assessment ${friaId}`,
        functionName: "updateFriaRights",
        fileName: FILE_NAME,
        userId,
        organizationId,
      });

      return res.status(200).json(STATUS_CODE[200](updatedRights));
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "Failed to update FRIA rights",
      functionName: "updateFriaRights",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get risk items for a FRIA.
 */
export async function getRiskItems(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting getRiskItems",
    functionName: "getRiskItems",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const friaId = parseInt(req.params.friaId as string);

    if (!friaId || isNaN(friaId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid FRIA ID"));
    }

    const items = await getFriaRiskItemsQuery(friaId, organizationId);
    return res.status(200).json(STATUS_CODE[200](items));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve FRIA risk items",
      functionName: "getRiskItems",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Add a risk item to a FRIA.
 */
export async function addRiskItem(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting addRiskItem",
    functionName: "addRiskItem",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const friaId = parseInt(req.params.friaId as string);
    const data = req.body;

    if (!friaId || isNaN(friaId) || !data.risk_description) {
      return res.status(400).json(STATUS_CODE[400]("Invalid FRIA ID or missing risk description"));
    }

    const item = await addFriaRiskItemQuery(friaId, data, organizationId);

    await recomputeAndPersistScore(friaId, organizationId, userId);

    try {
      await appendToAuditLedger({
        organizationId,
        entryType: "event_log",
        userId,
        eventType: "Create",
        entityType: "fria",
        entityId: friaId,
        description: "Risk item added to FRIA",
      });
    } catch {}

    await logSuccess({
      eventType: "Create",
      description: `Added risk item to FRIA ${friaId}`,
      functionName: "addRiskItem",
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res.status(201).json(STATUS_CODE[201](item));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to add FRIA risk item",
      functionName: "addRiskItem",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Update a risk item.
 */
export async function updateRiskItem(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting updateRiskItem",
    functionName: "updateRiskItem",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const friaId = parseInt(req.params.friaId as string);
    const itemId = parseInt(req.params.itemId as string);

    if (!itemId || isNaN(itemId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid item ID"));
    }

    const updated = await updateFriaRiskItemQuery(
      itemId,
      req.body,
      organizationId,
      undefined,
      friaId,
    );
    if (!updated) {
      return res.status(404).json(STATUS_CODE[404]("Risk item not found"));
    }

    await recomputeAndPersistScore(friaId, organizationId, userId);

    await logSuccess({
      eventType: "Update",
      description: `Updated risk item ${itemId} in FRIA ${friaId}`,
      functionName: "updateRiskItem",
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "Failed to update FRIA risk item",
      functionName: "updateRiskItem",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Delete a risk item.
 */
export async function deleteRiskItem(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting deleteRiskItem",
    functionName: "deleteRiskItem",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const friaId = parseInt(req.params.friaId as string);
    const itemId = parseInt(req.params.itemId as string);

    if (!itemId || isNaN(itemId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid item ID"));
    }

    await deleteFriaRiskItemQuery(itemId, organizationId, undefined, friaId);

    await recomputeAndPersistScore(friaId, organizationId, userId);

    try {
      await appendToAuditLedger({
        organizationId,
        entryType: "event_log",
        userId,
        eventType: "Delete",
        entityType: "fria",
        entityId: friaId,
        description: "Risk item deleted from FRIA",
      });
    } catch {}

    await logSuccess({
      eventType: "Delete",
      description: `Deleted risk item ${itemId} from FRIA ${friaId}`,
      functionName: "deleteRiskItem",
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res.status(200).json(STATUS_CODE[200]({ deleted: true }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "Failed to delete FRIA risk item",
      functionName: "deleteRiskItem",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get linked models for a FRIA.
 */
export async function getModelLinks(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting getModelLinks",
    functionName: "getModelLinks",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const friaId = parseInt(req.params.friaId as string);

    if (!friaId || isNaN(friaId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid FRIA ID"));
    }

    const links = await getFriaModelLinksQuery(friaId, organizationId);
    return res.status(200).json(STATUS_CODE[200](links));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve FRIA model links",
      functionName: "getModelLinks",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Link a model to a FRIA.
 */
export async function linkModel(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting linkModel",
    functionName: "linkModel",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const friaId = parseInt(req.params.friaId as string);
    const modelId = parseInt(req.params.modelId as string);

    if (!friaId || isNaN(friaId) || !modelId || isNaN(modelId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid FRIA or model ID"));
    }

    const link = await linkModelToFriaQuery(friaId, modelId, organizationId);

    await logSuccess({
      eventType: "Create",
      description: `Linked model ${modelId} to FRIA ${friaId}`,
      functionName: "linkModel",
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res.status(201).json(STATUS_CODE[201](link));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to link model to FRIA",
      functionName: "linkModel",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Unlink a model from a FRIA.
 */
export async function unlinkModel(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting unlinkModel",
    functionName: "unlinkModel",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const friaId = parseInt(req.params.friaId as string);
    const modelId = parseInt(req.params.modelId as string);

    if (!friaId || isNaN(friaId) || !modelId || isNaN(modelId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid FRIA or model ID"));
    }

    await unlinkModelFromFriaQuery(friaId, modelId, organizationId);

    await logSuccess({
      eventType: "Delete",
      description: `Unlinked model ${modelId} from FRIA ${friaId}`,
      functionName: "unlinkModel",
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res.status(200).json(STATUS_CODE[200]({ deleted: true }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "Failed to unlink model from FRIA",
      functionName: "unlinkModel",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Submit FRIA: create snapshot, change status to completed.
 */
export async function submitFria(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting submitFria",
    functionName: "submitFria",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const friaId = parseInt(req.params.friaId as string);
    const { reason } = req.body;

    if (!friaId || isNaN(friaId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid FRIA ID"));
    }

    const fria = await getFriaByIdQuery(friaId, organizationId);
    if (!fria) {
      return res.status(404).json(STATUS_CODE[404]("FRIA not found"));
    }

    const transaction = await sequelize.transaction();
    try {
      const rights = await getFriaRightsQuery(friaId, organizationId);
      const riskItems = await getFriaRiskItemsQuery(friaId, organizationId);
      const modelLinks = await getFriaModelLinksQuery(friaId, organizationId);

      const snapshotData = {
        assessment: fria,
        rights,
        riskItems,
        modelLinks,
      };

      await createFriaSnapshotQuery(
        friaId,
        fria.version,
        reason || "Submitted for review",
        userId,
        organizationId,
        snapshotData,
        transaction,
      );

      await updateFriaQuery(
        friaId,
        { status: FriaStatus.SUBMITTED, version: fria.version + 1 },
        organizationId,
        userId,
        transaction,
      );

      await transaction.commit();

      try {
        await appendToAuditLedger({
          organizationId,
          entryType: "event_log",
          userId,
          eventType: "Update",
          entityType: "fria",
          entityId: friaId,
          description: `FRIA submitted for review (version ${fria.version})`,
        });
      } catch {}

      await logSuccess({
        eventType: "Update",
        description: `Submitted FRIA ${friaId} for review`,
        functionName: "submitFria",
        fileName: FILE_NAME,
        userId,
        organizationId,
      });

      return res.status(200).json(STATUS_CODE[200]({ submitted: true, version: fria.version }));
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "Failed to submit FRIA",
      functionName: "submitFria",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get all version snapshots for a FRIA.
 */
export async function getVersions(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting getVersions",
    functionName: "getVersions",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const friaId = parseInt(req.params.friaId as string);

    if (!friaId || isNaN(friaId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid FRIA ID"));
    }

    const versions = await getFriaSnapshotsQuery(friaId, organizationId);
    return res.status(200).json(STATUS_CODE[200](versions));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve FRIA version snapshots",
      functionName: "getVersions",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get a specific version snapshot.
 */
export async function getVersion(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting getVersion",
    functionName: "getVersion",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const friaId = parseInt(req.params.friaId as string);
    const version = parseInt(req.params.version as string);

    if (!friaId || isNaN(friaId) || !version || isNaN(version)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid FRIA ID or version"));
    }

    const snapshot = await getFriaSnapshotByVersionQuery(friaId, version, organizationId);
    if (!snapshot) {
      return res.status(404).json(STATUS_CODE[404]("Version not found"));
    }

    return res.status(200).json(STATUS_CODE[200](snapshot));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve FRIA version snapshot",
      functionName: "getVersion",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ========================================
// EVIDENCE ATTACHMENTS
// ========================================

const FRIA_SECTION_TYPES = [
  "section_1",
  "section_2",
  "section_3",
  "section_4",
  "section_5",
  "section_6",
  "section_7",
  "section_8",
];

/**
 * Get evidence files for a FRIA assessment.
 * If ?section=section_1 is provided, returns evidence for that section only.
 * Otherwise returns evidence for all 8 sections grouped by entity type.
 */
export async function getFriaEvidence(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting getFriaEvidence",
    functionName: "getFriaEvidence",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const friaId = parseInt(req.params.friaId as string);
    const section = req.query.section as string | undefined;

    if (!friaId || isNaN(friaId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid FRIA ID"));
    }

    const fria = await getFriaByIdQuery(friaId, organizationId);
    if (!fria) {
      return res.status(404).json(STATUS_CODE[404]("FRIA not found"));
    }

    let evidence: unknown;

    if (section) {
      evidence = await getEvidenceFilesForEntity(
        organizationId,
        "fria",
        section,
        friaId,
        "evidence",
      );
    } else {
      evidence = await getEvidenceFilesForEntityTypes(
        organizationId,
        "fria",
        FRIA_SECTION_TYPES,
        friaId,
        "evidence",
      );
    }

    await logSuccess({
      eventType: "Read",
      description: `Retrieved FRIA evidence for assessment ${friaId}${section ? ` section ${section}` : ""}`,
      functionName: "getFriaEvidence",
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res.status(200).json(STATUS_CODE[200](evidence));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve FRIA evidence",
      functionName: "getFriaEvidence",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Link a file as evidence to a FRIA section.
 * Body: { file_id, entity_type } where entity_type is like "section_1", "right_dignity", etc.
 */
export async function linkFriaEvidence(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting linkFriaEvidence",
    functionName: "linkFriaEvidence",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const friaId = parseInt(req.params.friaId as string);
    const { file_id, entity_type } = req.body;

    if (!friaId || isNaN(friaId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid FRIA ID"));
    }

    if (!file_id || !entity_type) {
      return res.status(400).json(STATUS_CODE[400]("Missing file_id or entity_type"));
    }

    const fria = await getFriaByIdQuery(friaId, organizationId);
    if (!fria) {
      return res.status(404).json(STATUS_CODE[404]("FRIA not found"));
    }

    await createFileEntityLink(
      organizationId,
      file_id,
      "fria",
      entity_type,
      friaId,
      "evidence",
      userId,
    );

    await logSuccess({
      eventType: "Create",
      description: `Linked evidence file ${file_id} to FRIA ${friaId} section ${entity_type}`,
      functionName: "linkFriaEvidence",
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res.status(201).json(STATUS_CODE[201]({ linked: true }));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to link FRIA evidence",
      functionName: "linkFriaEvidence",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Unlink an evidence file from a FRIA by link ID.
 */
export async function unlinkFriaEvidence(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting unlinkFriaEvidence",
    functionName: "unlinkFriaEvidence",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const friaId = parseInt(req.params.friaId as string);
    const linkId = parseInt(req.params.linkId as string);

    if (!friaId || isNaN(friaId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid FRIA ID"));
    }

    if (!linkId || isNaN(linkId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid link ID"));
    }

    const deleted = await deleteFileEntityLinkById(linkId, organizationId);

    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]("Evidence link not found"));
    }

    await logSuccess({
      eventType: "Delete",
      description: `Unlinked evidence link ${linkId} from FRIA ${friaId}`,
      functionName: "unlinkFriaEvidence",
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res.status(200).json(STATUS_CODE[200]({ deleted: true }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "Failed to unlink FRIA evidence",
      functionName: "unlinkFriaEvidence",
      fileName: FILE_NAME,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
