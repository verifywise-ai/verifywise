import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  createNewVendorQuery,
  deleteVendorByIdQuery,
  getAllVendorsQuery,
  getVendorByIdQuery,
  getVendorByProjectIdQuery,
  updateVendorByIdQuery,
} from "../utils/vendor.utils";
import { sequelize } from "../database/db";
import {
  logFailure,
  logProcessing,
  logSuccess,
} from "../utils/logger/logHelper";
import { VendorModel } from "../domain.layer/models/vendor/vendor.model";
import {
  ValidationException,
  BusinessLogicException,
} from "../domain.layer/exceptions/custom.exception";
import {
  recordVendorCreation,
  trackVendorChanges,
  recordMultipleFieldChanges,
} from "../utils/vendorChangeHistory.utils";
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

export async function getAllVendors(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getAllVendors",
    functionName: "getAllVendors",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const vendors = await getAllVendorsQuery(req.organizationId!);

    if (vendors) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved ${vendors.length} vendors`,
        functionName: "getAllVendors",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](vendors));
    }

    await logSuccess({
      eventType: "Read",
      description: "No vendors found",
      functionName: "getAllVendors",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(204).json(STATUS_CODE[204](vendors));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve vendors",
      functionName: "getAllVendors",
      fileName: "vendor.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getVendorById(req: Request, res: Response): Promise<any> {
  const vendorId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getVendorById for ID ${vendorId}`,
    functionName: "getVendorById",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const vendor = await getVendorByIdQuery(vendorId, req.organizationId!);

    if (vendor) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved vendor ID ${vendorId}`,
        functionName: "getVendorById",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](vendor));
    }

    await logSuccess({
      eventType: "Read",
      description: `Vendor not found: ID ${vendorId}`,
      functionName: "getVendorById",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404](vendor));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve vendor by ID",
      functionName: "getVendorById",
      fileName: "vendor.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getVendorByProjectId(
  req: Request,
  res: Response
): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getVendorByProjectId for ID ${projectId}`,
    functionName: "getVendorByProjectId",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const vendor = await getVendorByProjectIdQuery(projectId, req.organizationId!);

    if (vendor !== null) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved vendor by project ID ${projectId}`,
        functionName: "getVendorByProjectId",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](vendor));
    }

    await logSuccess({
      eventType: "Read",
      description: `Vendor not found for project ID ${projectId}`,
      functionName: "getVendorByProjectId",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]([]));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve vendor by project ID",
      functionName: "getVendorByProjectId",
      fileName: "vendor.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createVendor(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const vendorData = req.body;

  logProcessing({
    description: "starting createVendor",
    functionName: "createVendor",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    // Create vendor using the enhanced VendorModel method
    const vendorModel = await VendorModel.createNewVendor(
      vendorData.vendor_name,
      vendorData.vendor_provides,
      vendorData.assignee,
      vendorData.website,
      vendorData.vendor_contact_person,
      vendorData.review_result,
      vendorData.review_status,
      vendorData.reviewer,
      vendorData.review_date,
      vendorData.order_no,
      vendorData.is_demo || false,
      vendorData.projects,
      vendorData.data_sensitivity,
      vendorData.business_criticality,
      vendorData.past_issues,
      vendorData.regulatory_exposure,
      vendorData.risk_score
    );

    // Validate vendor data before saving
    await vendorModel.validateVendorData();

    // Check if vendor can be modified (demo restrictions)
    vendorModel.canBeModified();

    const createdVendor = await createNewVendorQuery(
      vendorModel,
      req.organizationId!,
      transaction
    );

    if (createdVendor) {
      // Record creation in change history
      if (req.userId) {
        await recordVendorCreation(
          createdVendor.id!,
          req.userId,
          req.organizationId!,
          vendorData,
          transaction
        );
      }

      await transaction.commit();
      await logSuccess({
        eventType: "Create",
        description: `Created vendor: ${createdVendor.vendor_name}`,
        functionName: "createVendor",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      // Send assignment notifications (fire-and-forget)
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const assignerName = await getUserNameById(req.userId!);

      // Build entity context for vendor
      const vendorContext = {
        description: createdVendor.vendor_provides || undefined,
      };

      // Notify assignee if assigned
      if (createdVendor.assignee) {
        notifyUserAssigned(
          req.organizationId!,
          createdVendor.assignee,
          {
            entityType: "vendor",
            entityId: createdVendor.id!,
            entityName: createdVendor.vendor_name,
            roleType: "Assignee",
            entityUrl: `/vendors?vendorId=${createdVendor.id}`,
          },
          assignerName,
          baseUrl,
          vendorContext
        ).catch((err) => console.error("Failed to send assignee notification:", err));
      }

      // Notify reviewer if assigned
      if (createdVendor.reviewer) {
        notifyUserAssigned(
          req.organizationId!,
          createdVendor.reviewer,
          {
            entityType: "vendor",
            entityId: createdVendor.id!,
            entityName: createdVendor.vendor_name,
            roleType: "Reviewer",
            entityUrl: `/vendors?vendorId=${createdVendor.id}`,
          },
          assignerName,
          baseUrl,
          vendorContext
        ).catch((err) => console.error("Failed to send reviewer notification:", err));
      }

      return res.status(201).json(STATUS_CODE[201](createdVendor));
    }

    await logSuccess({
      eventType: "Create",
      description: "Vendor creation returned null",
      functionName: "createVendor",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(503).json(STATUS_CODE[503]({}));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      await logFailure({
        eventType: "Create",
        description: `Validation failed: ${error.message}`,
        functionName: "createVendor",
        fileName: "vendor.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Create",
        description: `Business logic error: ${error.message}`,
        functionName: "createVendor",
        fileName: "vendor.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    await logFailure({
      eventType: "Create",
      description: "Failed to create vendor",
      functionName: "createVendor",
      fileName: "vendor.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateVendorById(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const vendorId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const updateData = req.body;

  logProcessing({
    description: `starting updateVendorById for ID ${vendorId}`,
    functionName: "updateVendorById",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      await logFailure({
        eventType: "Update",
        description: "Unauthorized access attempt to update vendor",
        functionName: "updateVendorById",
        fileName: "vendor.ctrl.ts",
        error: new Error("Unauthorized"),
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Find existing vendor
    const existingVendor = await getVendorByIdQuery(vendorId, req.organizationId!);

    if (!existingVendor) {
      await logSuccess({
        eventType: "Update",
        description: `Vendor not found for update: ID ${vendorId}`,
        functionName: "updateVendorById",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    // Create VendorModel instance and update it
    const vendorModel = new VendorModel(existingVendor);

    // Track changes before updating
    const changes = await trackVendorChanges(vendorModel, updateData);

    // Update vendor using the enhanced method
    await vendorModel.updateVendor({
      vendor_name: updateData.vendor_name,
      vendor_provides: updateData.vendor_provides,
      assignee: updateData.assignee,
      website: updateData.website,
      vendor_contact_person: updateData.vendor_contact_person,
      review_result: updateData.review_result,
      review_status: updateData.review_status,
      reviewer: updateData.reviewer,
      review_date: updateData.review_date,
      order_no: updateData.order_no,
      projects: updateData.projects,
      data_sensitivity: updateData.data_sensitivity,
      business_criticality: updateData.business_criticality,
      past_issues: updateData.past_issues,
      regulatory_exposure: updateData.regulatory_exposure,
      risk_score: updateData.risk_score,
    });

    // Validate updated data
    await vendorModel.validateVendorData();

    const vendor = await updateVendorByIdQuery(
      {
        id: vendorId,
        vendor: vendorModel,
        userId,
        role,
        transaction,
      },
      req.organizationId!
    );

    if (vendor) {
      // Record changes in change history
      if (changes.length > 0) {
        await recordMultipleFieldChanges(
          vendorId,
          userId,
          req.organizationId!,
          changes,
          transaction
        );
      }

      await transaction.commit();
      await logSuccess({
        eventType: "Update",
        description: `Updated vendor ID ${vendorId}`,
        functionName: "updateVendorById",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      // Send assignment notifications for newly assigned users (fire-and-forget)
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const assignerName = await getUserNameById(userId);

      // Build entity context for vendor
      const vendorContext = {
        description: vendor.vendor_provides || undefined,
      };

      // Check if assignee changed
      const oldAssignee = existingVendor.assignee;
      const newAssignee = vendor.assignee;
      if (newAssignee && newAssignee !== oldAssignee && newAssignee !== userId) {
        notifyUserAssigned(
          req.organizationId!,
          newAssignee,
          {
            entityType: "vendor",
            entityId: vendorId,
            entityName: vendor.vendor_name,
            roleType: "Assignee",
            entityUrl: `/vendors?vendorId=${vendorId}`,
          },
          assignerName,
          baseUrl,
          vendorContext
        ).catch((err) => console.error("Failed to send assignee notification:", err));
      }

      // Check if reviewer changed
      const oldReviewer = existingVendor.reviewer;
      const newReviewer = vendor.reviewer;
      if (newReviewer && newReviewer !== oldReviewer && newReviewer !== userId) {
        notifyUserAssigned(
          req.organizationId!,
          newReviewer,
          {
            entityType: "vendor",
            entityId: vendorId,
            entityName: vendor.vendor_name,
            roleType: "Reviewer",
            entityUrl: `/vendors?vendorId=${vendorId}`,
          },
          assignerName,
          baseUrl,
          vendorContext
        ).catch((err) => console.error("Failed to send reviewer notification:", err));
      }

      return res.status(202).json(STATUS_CODE[202](vendor));
    }

    await logSuccess({
      eventType: "Update",
      description: `Vendor not found for update: ID ${vendorId}`,
      functionName: "updateVendorById",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      await logFailure({
        eventType: "Update",
        description: `Validation failed: ${error.message}`,
        functionName: "updateVendorById",
        fileName: "vendor.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Update",
        description: `Business logic error: ${error.message}`,
        functionName: "updateVendorById",
        fileName: "vendor.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    await logFailure({
      eventType: "Update",
      description: "Failed to update vendor",
      functionName: "updateVendorById",
      fileName: "vendor.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteVendorById(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const vendorId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting deleteVendorById for ID ${vendorId}`,
    functionName: "deleteVendorById",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const deletedVendor = await deleteVendorByIdQuery(
      vendorId,
      req.organizationId!,
      transaction
    );

    if (deletedVendor) {
      await transaction.commit();
      await logSuccess({
        eventType: "Delete",
        description: `Deleted vendor ID ${vendorId}`,
        functionName: "deleteVendorById",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(202).json(STATUS_CODE[202](deletedVendor));
    }

    await logSuccess({
      eventType: "Delete",
      description: `Vendor not found for deletion: ID ${vendorId}`,
      functionName: "deleteVendorById",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: "Failed to delete vendor",
      functionName: "deleteVendorById",
      fileName: "vendor.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
