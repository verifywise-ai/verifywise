import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";
import { toId } from "../utils/validations/validation.utils";
import { assertVendorRequestBody, parseRouteId } from "../utils/validations/vendorRequest.utils";
import {
  createNewVendorQuery,
  deleteVendorByIdQuery,
  getAllVendorsQuery,
  getVendorByIdQuery,
  getVendorByProjectIdQuery,
  updateVendorByIdQuery,
  visibleVendorProjectIds,
} from "../utils/vendor.utils";
import { sequelize } from "../database/db";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { VendorModel } from "../domain.layer/models/vendor/vendor.model";
import {
  ValidationException,
  BusinessLogicException,
} from "../domain.layer/exceptions/custom.exception";
import {
  recordVendorCreation,
  recordMultipleFieldChanges,
} from "../utils/vendorChangeHistory.utils";
import { trackEntityChanges } from "../utils/changeHistory.base.utils";
import { notifyUserAssigned } from "../services/inAppNotification.service";
import { getVendorRiskSuggestions as getVendorRiskSuggestionsService } from "../services/vendors/riskSuggestions";
import { triggerVendorOnboarding } from "../services/workflows/triggers";
import { notifyVendorRiskCandidates } from "../services/riskLinks/vendorCandidates";
import { enqueueVendorRiskLinkRecomputeBatch } from "../services/automations/automationProducer";
import { getActiveVendorRiskIdsQuery } from "../utils/vendorRiskLink.utils";
import logger from "../utils/logger/fileLogger";
import { QueryTypes } from "sequelize";

import { translateError } from "../utils/i18n.utils";
import { calculateVendorRiskScore } from "../utils/vendorScorecard.utils";
// Helper function to get user name
async function getUserNameById(userId: number): Promise<string> {
  const result = await sequelize.query<{ name: string; surname: string }>(
    `SELECT name, surname FROM users WHERE id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT },
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
    organizationId: req.organizationId!,
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
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](vendors));
    }

    await logSuccess({
      eventType: "Read",
      description: "No vendors found",
      functionName: "getAllVendors",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
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
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getVendorById(req: Request, res: Response): Promise<any> {
  const vendorId = parseRouteId(req.params.id);
  if (vendorId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor ID")));
  }

  logProcessing({
    description: `starting getVendorById for ID ${vendorId}`,
    functionName: "getVendorById",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
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
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](vendor));
    }

    await logSuccess({
      eventType: "Read",
      description: `Vendor not found: ID ${vendorId}`,
      functionName: "getVendorById",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
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
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getVendorByProjectId(req: Request, res: Response): Promise<any> {
  const projectId = parseRouteId(req.params.id);
  if (projectId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid project ID")));
  }

  logProcessing({
    description: `starting getVendorByProjectId for ID ${projectId}`,
    functionName: "getVendorByProjectId",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
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
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](vendor));
    }

    await logSuccess({
      eventType: "Read",
      description: `Vendor not found for project ID ${projectId}`,
      functionName: "getVendorByProjectId",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
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
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Read-only report: the vendor risks this vendor's questionnaire answers imply,
 * minus the ones it already has. Writes nothing and opens no transaction.
 */
export async function getVendorRiskSuggestions(req: Request, res: Response): Promise<any> {
  const vendorId = toId(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (isNaN(vendorId) || vendorId <= 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor ID")));
  }

  logProcessing({
    description: `starting getVendorRiskSuggestions for ID ${vendorId}`,
    functionName: "getVendorRiskSuggestions",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const report = await getVendorRiskSuggestionsService(vendorId, req.organizationId!);

    if (!report) {
      await logSuccess({
        eventType: "Read",
        description: `Vendor not found for risk suggestions: ID ${vendorId}`,
        functionName: "getVendorRiskSuggestions",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    await logSuccess({
      eventType: "Read",
      description: `Derived ${report.suggestions.length} risk suggestions for vendor ID ${vendorId}`,
      functionName: "getVendorRiskSuggestions",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](report));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to fetch vendor risk suggestions",
      functionName: "getVendorRiskSuggestions",
      fileName: "vendor.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function createVendor(req: Request, res: Response): Promise<any> {
  try {
    assertVendorRequestBody(req.body);
  } catch (error) {
    return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
  }
  const transaction = await sequelize.transaction();
  const vendorData = req.body;

  logProcessing({
    description: "starting createVendor",
    functionName: "createVendor",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
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
      // Only use cases the user can see, as on update.
      Array.isArray(vendorData.projects)
        ? await visibleVendorProjectIds(
            vendorData.projects,
            { userId: req.userId!, role: req.role!, transaction },
            req.organizationId!,
          )
        : [],
      vendorData.data_sensitivity,
      vendorData.business_criticality,
      vendorData.past_issues,
      vendorData.regulatory_exposure,
      vendorData.risk_score,
    );

    // Validate vendor data before saving
    await vendorModel.validateVendorData();

    // Check if vendor can be modified (demo restrictions)
    vendorModel.canBeModified();

    const createdVendor = await createNewVendorQuery(vendorModel, req.organizationId!, transaction);

    if (createdVendor) {
      // Record creation in change history
      if (req.userId) {
        await recordVendorCreation(
          createdVendor.id!,
          req.userId,
          req.organizationId!,
          {
            ...vendorData,
            risk_score: createdVendor.risk_score,
            // The links written (visible use cases only), none if empty.
            projects: createdVendor.projects?.length ? createdVendor.projects : undefined,
          },
          transaction,
        );
      }

      await transaction.commit();
      await logSuccess({
        eventType: "Create",
        description: `Created vendor: ${createdVendor.vendor_name}`,
        functionName: "createVendor",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });

      // Phase 6 / issue 3813 — kick off the vendor_onboarding autopilot
      // workflow after a successful create. Fire-and-forget; never blocks
      // or fails the response.
      triggerVendorOnboarding(req.organizationId!, createdVendor.id!).catch((err) =>
        console.error("Failed to trigger vendor_onboarding workflow:", err),
      );

      // A new vendor normally has no vendor risks yet, so this usually finds
      // nothing. Fire-and-forget, like the model counterpart.
      notifyVendorRiskCandidates({
        organizationId: req.organizationId!,
        vendorId: createdVendor.id!,
        vendorName: createdVendor.vendor_name,
        projectIds: createdVendor.projects ?? [],
      }).catch((err) => logger.error("Vendor risk candidate notice failed:", err));

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
          vendorContext,
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
          vendorContext,
        ).catch((err) => console.error("Failed to send reviewer notification:", err));
      }

      return res.status(201).json(STATUS_CODE[201](createdVendor));
    }

    await transaction.rollback();
    await logSuccess({
      eventType: "Create",
      description: "Vendor creation returned null",
      functionName: "createVendor",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
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
        organizationId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }

    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Create",
        description: `Business logic error: ${error.message}`,
        functionName: "createVendor",
        fileName: "vendor.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }

    await logFailure({
      eventType: "Create",
      description: "Failed to create vendor",
      functionName: "createVendor",
      fileName: "vendor.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function updateVendorById(req: Request, res: Response): Promise<any> {
  const vendorId = parseRouteId(req.params.id);
  if (vendorId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor ID")));
  }
  try {
    assertVendorRequestBody(req.body);
  } catch (error) {
    return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
  }
  const transaction = await sequelize.transaction();
  const updateData = req.body;

  logProcessing({
    description: `starting updateVendorById for ID ${vendorId}`,
    functionName: "updateVendorById",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      await transaction.rollback();
      await logFailure({
        eventType: "Update",
        description: "Unauthorized access attempt to update vendor",
        functionName: "updateVendorById",
        fileName: "vendor.ctrl.ts",
        error: new Error("Unauthorized"),
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(401).json(STATUS_CODE[401](req.t!("Unauthorized")));
    }

    // Find existing vendor
    // Read and lock on the write's transaction: the before/after diffs below
    // (links, assignee, reviewer) must see the row this save overwrites.
    const existingVendor = await getVendorByIdQuery(vendorId, req.organizationId!, {
      transaction,
      forUpdate: true,
    });

    if (!existingVendor) {
      await transaction.rollback();
      await logSuccess({
        eventType: "Update",
        description: `Vendor not found for update: ID ${vendorId}`,
        functionName: "updateVendorById",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    // Create VendorModel instance and update it. The stored use case links
    // are not carried over: links are written only when the request sends
    // `projects`, so a field-only save never touches them.
    const vendorModel = new VendorModel({ ...existingVendor, projects: undefined });

    // Track changes before updating
    // The risk score as it will be stored: computed from the answers this
    // request writes, else the stored ones (as updateVendorByIdQuery does).
    const answer = (
      field: "data_sensitivity" | "business_criticality" | "past_issues" | "regulatory_exposure",
    ) => (updateData[field] !== undefined ? updateData[field] : existingVendor[field]);
    // Name lookups are scoped to this organization and run on the write's
    // transaction. Use case links are diffed after the write, from storage.
    const historyContext = { organizationId: req.organizationId!, transaction };
    const changes = await trackEntityChanges(
      "vendor",
      vendorModel,
      {
        ...updateData,
        projects: undefined,
        risk_score: calculateVendorRiskScore({
          data_sensitivity: answer("data_sensitivity"),
          business_criticality: answer("business_criticality"),
          past_issues: answer("past_issues"),
          regulatory_exposure: answer("regulatory_exposure"),
        }),
      },
      historyContext,
    );

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

    // updateVendor checked each field the request sent. The whole row is not
    // validated again: an imported vendor can have empty required fields, and
    // a save that doesn't touch them must not fail on them.

    const vendor = await updateVendorByIdQuery(
      {
        id: vendorId,
        vendor: vendorModel,
        userId,
        role,
        transaction,
      },
      req.organizationId!,
    );

    if (vendor) {
      // The use case links as stored before and after: the request may name
      // use cases the user can't see, which are neither added nor removed.
      // History records the count only (changeHistory.config.ts).
      const projectIdsBefore = (existingVendor.projects ?? []).map(Number);
      const projectIdsAfter = (vendor.projects ?? []).map(Number);
      changes.push(
        ...(await trackEntityChanges(
          "vendor",
          { projects: projectIdsBefore },
          { projects: projectIdsAfter },
          historyContext,
        )),
      );

      // Record changes in change history
      if (changes.length > 0) {
        await recordMultipleFieldChanges(
          vendorId,
          userId,
          req.organizationId!,
          changes,
          transaction,
        );
      }

      await transaction.commit();
      await logSuccess({
        eventType: "Update",
        description: `Updated vendor ID ${vendorId}`,
        functionName: "updateVendorById",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });

      // Only use cases this update added or removed, read from the links as
      // stored before and after the write. A plain field edit sends no
      // projects, so both lists match and nothing fires.
      const addedProjectIds = projectIdsAfter.filter((id) => !projectIdsBefore.includes(id));
      if (addedProjectIds.length > 0) {
        notifyVendorRiskCandidates({
          organizationId: req.organizationId!,
          vendorId,
          vendorName: vendor.vendor_name,
          projectIds: addedProjectIds,
        }).catch((err) => logger.error("Vendor risk candidate notice failed:", err));
      }

      // Use cases shared with another vendor feed the related vendor risk
      // score, so a change in either direction rescores this vendor's risks.
      const removedProjectIds = projectIdsBefore.filter((id) => !projectIdsAfter.includes(id));
      if (addedProjectIds.length > 0 || removedProjectIds.length > 0) {
        getActiveVendorRiskIdsQuery(req.organizationId!, vendorId)
          .then((ids) =>
            enqueueVendorRiskLinkRecomputeBatch(req.organizationId!, ids, `vendor-${vendorId}`),
          )
          .catch((err) => logger.error("Vendor risk link recompute enqueue failed:", err));
      }

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
          vendorContext,
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
          vendorContext,
        ).catch((err) => console.error("Failed to send reviewer notification:", err));
      }

      return res.status(202).json(STATUS_CODE[202](vendor));
    }

    await transaction.rollback();
    await logSuccess({
      eventType: "Update",
      description: `Vendor not found for update: ID ${vendorId}`,
      functionName: "updateVendorById",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
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
        organizationId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }

    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Update",
        description: `Business logic error: ${error.message}`,
        functionName: "updateVendorById",
        fileName: "vendor.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }

    await logFailure({
      eventType: "Update",
      description: "Failed to update vendor",
      functionName: "updateVendorById",
      fileName: "vendor.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function deleteVendorById(req: Request, res: Response): Promise<any> {
  const vendorId = parseRouteId(req.params.id);
  if (vendorId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor ID")));
  }
  const transaction = await sequelize.transaction();

  logProcessing({
    description: `starting deleteVendorById for ID ${vendorId}`,
    functionName: "deleteVendorById",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const deletedVendor = await deleteVendorByIdQuery(
      vendorId,
      req.organizationId!,
      transaction,
      req.userId!,
    );

    if (deletedVendor) {
      await transaction.commit();
      await logSuccess({
        eventType: "Delete",
        description: `Deleted vendor ID ${vendorId}`,
        functionName: "deleteVendorById",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(202).json(STATUS_CODE[202](deletedVendor));
    }

    await transaction.rollback();
    await logSuccess({
      eventType: "Delete",
      description: `Vendor not found for deletion: ID ${vendorId}`,
      functionName: "deleteVendorById",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
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
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
