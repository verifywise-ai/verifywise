import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  createNewVendorRiskQuery,
  deleteVendorRiskByIdQuery,
  getAllVendorRisksAllProjectsQuery,
  getVendorRiskByIdQuery,
  getVendorRisksByProjectIdQuery,
  getVendorRisksByVendorIdQuery,
  updateVendorRiskByIdQuery,
} from "../utils/vendorRisk.utils";
import { VendorRiskModel } from "../domain.layer/models/vendorRisk/vendorRisk.model";
import { logProcessing, logSuccess, logFailure } from '../utils/logger/logHelper';
import {
  recordVendorRiskCreation,
  trackVendorRiskChanges,
  recordMultipleFieldChanges,
} from "../utils/vendorRiskChangeHistory.utils";
import { notifyUserAssigned } from "../services/inAppNotification.service";
import { QueryTypes } from "sequelize";

// Helper function to get user name
async function getUserNameById(userId: number): Promise<string> {
  const result = await sequelize.query<{ name: string; surname: string }>(
    `SELECT name, surname FROM users WHERE id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  if (result[0]) {
    return `${result[0].name} ${result[0].surname}`.trim();
  }
  return "Someone";
}

export async function getAllVendorRisksAllProjects(
  req: Request,
  res: Response
): Promise<any> {
  const filter = (req.query.filter as 'active' | 'deleted' | 'all') || 'active';

  logProcessing({
    description: `starting getAllVendorRisksAllProjects with filter: ${filter}`,
    functionName: 'getAllVendorRisksAllProjects',
    fileName: 'vendorRisk.ctrl.ts',
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const risks = await getAllVendorRisksAllProjectsQuery(req.organizationId!, filter);
    await logSuccess({
      eventType: 'Read',
      description: 'Retrieved all vendor risks across all projects',
      functionName: 'getAllVendorRisksAllProjects',
      fileName: 'vendorRisk.ctrl.ts',
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](risks));
  } catch (error) {
    await logFailure({
      eventType: 'Read',
      description: 'Failed to retrieve vendor risks',
      functionName: 'getAllVendorRisksAllProjects',
      fileName: 'vendorRisk.ctrl.ts',
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAllVendorRisks(
  req: Request,
  res: Response
): Promise<any> {
  const projectIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const projectId = parseInt(projectIdParam);
  const filter = (req.query.filter as 'active' | 'deleted' | 'all') || 'active';

  // Return empty array for non-numeric project IDs (e.g., plugin-sourced IDs like "plugin-prefix-2")
  if (isNaN(projectId)) {
    return res.status(200).json(STATUS_CODE[200]([]));
  }

  logProcessing({
    description: `starting getAllVendorRisks for project ID ${projectId} with filter: ${filter}`,
    functionName: 'getAllVendorRisks',
    fileName: 'vendorRisk.ctrl.ts',
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const vendorRisks = await getVendorRisksByProjectIdQuery(projectId, req.organizationId!, filter);

    if (vendorRisks) {
      await logSuccess({
        eventType: 'Read',
        description: `Retrieved vendor risks for project ID ${projectId} with filter: ${filter}`,
        functionName: 'getAllVendorRisks',
        fileName: 'vendorRisk.ctrl.ts',
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](vendorRisks));
    }

    await logSuccess({
      eventType: 'Read',
      description: `No vendor risks found for project ID ${projectId} with filter: ${filter}`,
      functionName: 'getAllVendorRisks',
      fileName: 'vendorRisk.ctrl.ts',
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(204).json(STATUS_CODE[204](vendorRisks));
  } catch (error) {
    await logFailure({
      eventType: 'Read',
      description: 'Failed to retrieve vendor risks by project',
      functionName: 'getAllVendorRisks',
      fileName: 'vendorRisk.ctrl.ts',
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAllVendorRisksByVendorId(
  req: Request,
  res: Response
) {
  const vendorId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const filter = (req.query.filter as 'active' | 'deleted' | 'all') || 'active';

  logProcessing({
    description: `starting getAllVendorRisksByVendorId for vendor ID ${vendorId} with filter: ${filter}`,
    functionName: 'getAllVendorRisksByVendorId',
    fileName: 'vendorRisk.ctrl.ts',
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const vendorRisks = await getVendorRisksByVendorIdQuery(vendorId, req.organizationId!, filter);

    if (vendorRisks) {
      await logSuccess({
        eventType: 'Read',
        description: `Retrieved vendor risks for vendor ID ${vendorId} with filter: ${filter}`,
        functionName: 'getAllVendorRisksByVendorId',
        fileName: 'vendorRisk.ctrl.ts',
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](vendorRisks));
    }

    await logSuccess({
      eventType: 'Read',
      description: `No vendor risks found for vendor ID ${vendorId} with filter: ${filter}`,
      functionName: 'getAllVendorRisksByVendorId',
      fileName: 'vendorRisk.ctrl.ts',
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(204).json(STATUS_CODE[204](vendorRisks));
  } catch (error) {
    await logFailure({
      eventType: 'Read',
      description: 'Failed to retrieve vendor risks by vendor ID',
      functionName: 'getAllVendorRisksByVendorId',
      fileName: 'vendorRisk.ctrl.ts',
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getVendorRiskById(
  req: Request,
  res: Response
): Promise<any> {
  const vendorRiskId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getVendorRiskById for ID ${vendorRiskId}`,
    functionName: 'getVendorRiskById',
    fileName: 'vendorRisk.ctrl.ts',
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const vendorRisk = await getVendorRiskByIdQuery(vendorRiskId, req.organizationId!);

    if (vendorRisk) {
      await logSuccess({
        eventType: 'Read',
        description: `Retrieved vendor risk ID ${vendorRiskId}`,
        functionName: 'getVendorRiskById',
        fileName: 'vendorRisk.ctrl.ts',
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](vendorRisk));
    }

    await logSuccess({
      eventType: 'Read',
      description: `Vendor risk not found: ID ${vendorRiskId}`,
      functionName: 'getVendorRiskById',
      fileName: 'vendorRisk.ctrl.ts',
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404](vendorRisk));
  } catch (error) {
    await logFailure({
      eventType: 'Read',
      description: 'Failed to retrieve vendor risk by ID',
      functionName: 'getVendorRiskById',
      fileName: 'vendorRisk.ctrl.ts',
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createVendorRisk(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();

  logProcessing({
    description: 'starting createVendorRisk',
    functionName: 'createVendorRisk',
    fileName: 'vendorRisk.ctrl.ts',
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const newVendorRisk: VendorRiskModel = req.body;
    const vendorRiskModel = await VendorRiskModel.createNewVendorRisk(newVendorRisk);

    const createdVendorRisk = await createNewVendorRiskQuery(
      vendorRiskModel,
      req.organizationId!,
      transaction
    );

    if (createdVendorRisk) {
      // Record creation in change history
      const userId = req.userId;
      if (userId && createdVendorRisk.id) {
        await recordVendorRiskCreation(
          createdVendorRisk.id,
          userId,
          req.organizationId!,
          createdVendorRisk,
          transaction
        );
      }

      await transaction.commit();

      // Notify action_owner if assigned
      const actionOwnerId = createdVendorRisk.action_owner;
      if (actionOwnerId && createdVendorRisk.id) {
        const assignerName = await getUserNameById(req.userId!);
        const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";

        // Get vendor name for context
        let vendorName: string | undefined;
        if (createdVendorRisk.vendor_id) {
          const vendorResult = await sequelize.query<{ vendor_name: string }>(
            `SELECT vendor_name FROM vendors WHERE organization_id = :organizationId AND id = :vendorId`,
            { replacements: { organizationId: req.organizationId!, vendorId: createdVendorRisk.vendor_id }, type: QueryTypes.SELECT }
          );
          vendorName = vendorResult[0]?.vendor_name;
        }

        notifyUserAssigned(
          req.organizationId!,
          actionOwnerId,
          {
            entityType: "Vendor Risk",
            entityId: createdVendorRisk.id,
            entityName: createdVendorRisk.risk_description || `Vendor Risk #${createdVendorRisk.id}`,
            roleType: "Action Owner",
            entityUrl: `${baseUrl}/vendors?vendorRiskId=${createdVendorRisk.id}`,
          },
          assignerName,
          baseUrl,
          {
            parentType: vendorName ? "Vendor" : undefined,
            parentName: vendorName,
            description: createdVendorRisk.impact_description || undefined,
          }
        ).catch((err) => console.error("Failed to send action owner notification:", err));
      }

      await logSuccess({
        eventType: 'Create',
        description: 'Created new vendor risk',
        functionName: 'createVendorRisk',
        fileName: 'vendorRisk.ctrl.ts',
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(201).json(STATUS_CODE[201](createdVendorRisk));
    }

    await logSuccess({
      eventType: 'Create',
      description: 'Vendor risk creation returned null',
      functionName: 'createVendorRisk',
      fileName: 'vendorRisk.ctrl.ts',
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(503).json(STATUS_CODE[503]({}));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: 'Create',
      description: 'Failed to create vendor risk',
      functionName: 'createVendorRisk',
      fileName: 'vendorRisk.ctrl.ts',
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateVendorRiskById(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const vendorRiskId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const updatedVendorRisk = req.body;

  logProcessing({
    description: `starting updateVendorRiskById for ID ${vendorRiskId}`,
    functionName: 'updateVendorRiskById',
    fileName: 'vendorRisk.ctrl.ts',
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    // Fetch existing vendor risk for change tracking
    const existingVendorRisk = await getVendorRiskByIdQuery(vendorRiskId, req.organizationId!);

    if (!existingVendorRisk) {
      await transaction.rollback();
      await logSuccess({
        eventType: 'Update',
        description: `Vendor risk not found for update: ID ${vendorRiskId}`,
        functionName: 'updateVendorRiskById',
        fileName: 'vendorRisk.ctrl.ts',
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    // Create model from existing data for change tracking
    const oldVendorRiskModel = new VendorRiskModel(existingVendorRisk as any);

    const vendorRiskModel = new VendorRiskModel();
    await vendorRiskModel.updateVendorRisk(updatedVendorRisk);

    const vendorRisk = await updateVendorRiskByIdQuery(
      vendorRiskId,
      vendorRiskModel,
      req.organizationId!,
      transaction
    );

    if (vendorRisk) {
      // Track and record changes
      const userId = req.userId;
      if (userId) {
        const changes = await trackVendorRiskChanges(oldVendorRiskModel, updatedVendorRisk);
        if (changes.length > 0) {
          await recordMultipleFieldChanges(
            vendorRiskId,
            userId,
            req.organizationId!,
            changes,
            transaction
          );
        }
      }

      await transaction.commit();

      // Notify action_owner if changed to a new user
      const oldActionOwner = (existingVendorRisk as any).action_owner;
      const newActionOwner = updatedVendorRisk.action_owner;
      if (newActionOwner && newActionOwner !== oldActionOwner) {
        const assignerName = await getUserNameById(req.userId!);
        const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";

        // Get vendor name for context
        let vendorName: string | undefined;
        if (vendorRisk.vendor_id) {
          const vendorResult = await sequelize.query<{ vendor_name: string }>(
            `SELECT vendor_name FROM vendors WHERE organization_id = :organizationId AND id = :vendorId`,
            { replacements: { organizationId: req.organizationId!, vendorId: vendorRisk.vendor_id }, type: QueryTypes.SELECT }
          );
          vendorName = vendorResult[0]?.vendor_name;
        }

        notifyUserAssigned(
          req.organizationId!,
          newActionOwner,
          {
            entityType: "Vendor Risk",
            entityId: vendorRiskId,
            entityName: vendorRisk.risk_description || `Vendor Risk #${vendorRiskId}`,
            roleType: "Action Owner",
            entityUrl: `${baseUrl}/vendors?vendorRiskId=${vendorRiskId}`,
          },
          assignerName,
          baseUrl,
          {
            parentType: vendorName ? "Vendor" : undefined,
            parentName: vendorName,
            description: vendorRisk.impact_description || undefined,
          }
        ).catch((err) => console.error("Failed to send action owner notification:", err));
      }

      await logSuccess({
        eventType: 'Update',
        description: `Updated vendor risk ID ${vendorRiskId}`,
        functionName: 'updateVendorRiskById',
        fileName: 'vendorRisk.ctrl.ts',
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(202).json(STATUS_CODE[202](vendorRisk));
    }

    await logSuccess({
      eventType: 'Update',
      description: `Vendor risk not found for update: ID ${vendorRiskId}`,
      functionName: 'updateVendorRiskById',
      fileName: 'vendorRisk.ctrl.ts',
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: 'Update',
      description: 'Failed to update vendor risk',
      functionName: 'updateVendorRiskById',
      fileName: 'vendorRisk.ctrl.ts',
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteVendorRiskById(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const vendorRiskId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting deleteVendorRiskById for ID ${vendorRiskId}`,
    functionName: 'deleteVendorRiskById',
    fileName: 'vendorRisk.ctrl.ts',
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const deletedVendorRisk = await deleteVendorRiskByIdQuery(
      vendorRiskId,
      req.organizationId!,
      transaction
    );

    if (deletedVendorRisk) {
      await transaction.commit();
      await logSuccess({
        eventType: 'Delete',
        description: `Deleted vendor risk ID ${vendorRiskId}`,
        functionName: 'deleteVendorRiskById',
        fileName: 'vendorRisk.ctrl.ts',
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(202).json(STATUS_CODE[202](deletedVendorRisk));
    }

    await logSuccess({
      eventType: 'Delete',
      description: `Deleted vendor risk ID ${vendorRiskId}`,
      functionName: 'deleteVendorRiskById',
      fileName: 'vendorRisk.ctrl.ts',
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: 'Delete',
      description: 'Failed to delete vendor risk',
      functionName: 'deleteVendorRiskById',
      fileName: 'vendorRisk.ctrl.ts',
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
