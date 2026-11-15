import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";
import { toId } from "../utils/validations/validation.utils";
import {
  withNormalizedIdentifiers,
  withoutV1OnlyVendorFields,
} from "../utils/validations/vendorValidation.utils";
import {
  createNewVendorQuery,
  deleteVendorByIdQuery,
  getAllVendorsQuery,
  getVendorByIdQuery,
  getVendorByProjectIdQuery,
  updateVendorByIdQuery,
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
  trackVendorChanges,
  recordMultipleFieldChanges,
} from "../utils/vendorChangeHistory.utils";
import { notifyUserAssigned } from "../services/inAppNotification.service";
import { getVendorRiskSuggestions as getVendorRiskSuggestionsService } from "../services/vendors/riskSuggestions";
import { triggerVendorOnboarding } from "../services/workflows/triggers";
import { notifyVendorRiskCandidates } from "../services/riskLinks/vendorCandidates";
import { triggerAutoResearch } from "../services/vendorResearch/trigger";
import { isUserOfOrganization } from "../services/vendorResearch/assignee";
import { enqueueVendorRiskLinkRecomputeBatch } from "../services/automations/automationProducer";
import { getActiveVendorRiskIdsQuery } from "../utils/vendorRiskLink.utils";
import logger from "../utils/logger/fileLogger";
import { QueryTypes, Transaction } from "sequelize";

import { translateError } from "../utils/i18n.utils";
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

/**
 * An id off the wire that is a positive whole number a float holds exactly, or NaN: "12abc", "abc",
 * "-3" and "1.5" are not ids (`parseInt` would read "12abc" as 12).
 */
const positiveId = (value: unknown): number => {
  const id = toId(value);
  return Number.isSafeInteger(id) && id > 0 ? id : NaN;
};

/** Whether a user field of a vendor holds a user: the model reads null, 0 and nothing as no user. */
const namesAUser = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== "" && Number(value) !== 0;

/**
 * Refuses an assignee or a reviewer who is not a user of the organization. The user is told of the
 * assignment by email with the vendor's name and what it provides, and nothing in the database ties
 * these fields to the vendor's organization, so a user of another organization would be sent them.
 *
 * `before` is the stored vendor on an update: a user who is already stored there is not checked
 * again, because the form sends every field back and is not told of it a second time. Without that,
 * a vendor whose assignee has since left the organization could not be edited at all.
 *
 * @throws ValidationException when the assignee or the reviewer is not a user of the organization
 */
async function checkVendorUsers(
  vendor: { assignee?: unknown; reviewer?: unknown },
  organizationId: number,
  transaction: Transaction,
  before?: { assignee?: unknown; reviewer?: unknown },
): Promise<void> {
  const isNew = (value: unknown, stored: unknown): boolean =>
    namesAUser(value) && (before === undefined || Number(value) !== Number(stored));

  if (
    isNew(vendor.assignee, before?.assignee) &&
    !(await isUserOfOrganization(positiveId(vendor.assignee), organizationId, transaction))
  ) {
    throw new ValidationException(
      "The assignee must be a user of your organization",
      "assignee",
      vendor.assignee,
    );
  }
  if (
    isNew(vendor.reviewer, before?.reviewer) &&
    !(await isUserOfOrganization(positiveId(vendor.reviewer), organizationId, transaction))
  ) {
    throw new ValidationException(
      "The reviewer must be a user of your organization",
      "reviewer",
      vendor.reviewer,
    );
  }
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
  const vendorId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

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
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

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

/**
 * POST /vendors, the legacy create: the frozen legacy contract, which never had the other names and
 * the identifiers (ADR 0001, sections 1 and 2), so it ignores them. They are dropped here, before
 * anything reads the body.
 */
export async function createVendor(req: Request, res: Response): Promise<any> {
  return createVendorFrom(req, res, withoutV1OnlyVendorFields(req.body));
}

/**
 * POST /v1/vendors: the same create, which also takes the other names and the identifiers (ADR
 * 0001, sections 2 and 5).
 */
export async function createVendorV1(req: Request, res: Response): Promise<any> {
  if (!isJsonObject(req.body)) return refuseBody(req, res);
  return createVendorFrom(req, res, req.body);
}

/**
 * True for a body that is a JSON object. Express leaves `req.body` undefined for a request without
 * a body or with another content type than JSON, and a JSON body can also be a list, a text, a
 * number or null; the shared create and update read fields of it, so such a body failed there with
 * a TypeError (a 500). The legacy routes keep that behaviour (ADR 0001, section 1).
 */
const isJsonObject = (body: unknown): body is Record<string, unknown> =>
  typeof body === "object" && body !== null && !Array.isArray(body);

/** The 400 for a v1 vendor write whose body is not a JSON object, before any transaction. */
const refuseBody = (req: Request, res: Response) =>
  res.status(400).json(STATUS_CODE[400](req.t!("The request body must be a JSON object")));

async function createVendorFrom(req: Request, res: Response, vendorData: Request["body"]) {
  const transaction = await sequelize.transaction();

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
      vendorData.projects,
      vendorData.data_sensitivity,
      vendorData.business_criticality,
      vendorData.past_issues,
      vendorData.regulatory_exposure,
      vendorData.risk_score,
      vendorData.other_names,
      {
        country: vendorData.country,
        registration_number: vendorData.registration_number,
        lei: vendorData.lei,
        sec_cik: vendorData.sec_cik,
      },
    );

    // Validate vendor data before saving
    await vendorModel.validateVendorData();

    // Check if vendor can be modified (demo restrictions)
    vendorModel.canBeModified();

    await checkVendorUsers(vendorModel, req.organizationId!, transaction);

    const createdVendor = await createNewVendorQuery(vendorModel, req.organizationId!, transaction);

    if (createdVendor) {
      // Record creation in change history
      if (req.userId) {
        await recordVendorCreation(
          createdVendor.id!,
          req.userId,
          req.organizationId!,
          withNormalizedIdentifiers(vendorData),
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
        projectIds: vendorData.projects || [],
      }).catch((err) => logger.error("Vendor risk candidate notice failed:", err));

      // Research the new vendor's risks in the background. Not awaited, so it cannot fail the
      // response. triggerAutoResearch is written never to reject; the catch is for the day it does,
      // because a rejection that nothing handles ends the process.
      triggerAutoResearch({
        organizationId: req.organizationId!,
        vendorId: createdVendor.id!,
        isDemo: !!createdVendor.is_demo,
      }).catch((err) => logger.error("Vendor research auto-start failed:", err));

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

/**
 * PATCH /vendors/:id, the legacy update: the frozen legacy contract, which never had the other names
 * and the identifiers (ADR 0001, sections 1 and 2), so it ignores them. They are dropped here,
 * before anything reads the body.
 */
export async function updateVendorById(req: Request, res: Response): Promise<any> {
  // The frozen legacy contract keeps its own reading of the id.
  const vendorId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  return updateVendorByIdFrom(req, res, withoutV1OnlyVendorFields(req.body), vendorId);
}

/**
 * PATCH /v1/vendors/:id: the same update, which also takes the other names and the identifiers (ADR
 * 0001, sections 2 and 5).
 */
export async function updateVendorByIdV1(req: Request, res: Response): Promise<any> {
  // Refused before the shared update opens its transaction: "abc" would reach the query as NaN (a
  // 500), and "12abc" would update vendor 12, as the other v1 vendor routes already refuse.
  const vendorId = positiveId(req.params.id);
  if (Number.isNaN(vendorId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor ID")));
  }
  if (!isJsonObject(req.body)) return refuseBody(req, res);
  return updateVendorByIdFrom(req, res, req.body, vendorId);
}

async function updateVendorByIdFrom(
  req: Request,
  res: Response,
  updateData: Request["body"],
  vendorId: number,
) {
  const transaction = await sequelize.transaction();

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
    const existingVendor = await getVendorByIdQuery(vendorId, req.organizationId!);

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

    // Create VendorModel instance and update it
    const vendorModel = new VendorModel(existingVendor);

    // Track changes before updating, with the identifiers in the form they are stored
    const changes = await trackVendorChanges(vendorModel, withNormalizedIdentifiers(updateData));

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
      other_names: updateData.other_names,
      country: updateData.country,
      registration_number: updateData.registration_number,
      lei: updateData.lei,
      sec_cik: updateData.sec_cik,
    });

    // Validate updated data
    await vendorModel.validateVendorData();

    await checkVendorUsers(vendorModel, req.organizationId!, transaction, existingVendor);

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

      // Only use cases this update added. A plain field edit sends no
      // projects, so the diff is empty and nothing fires.
      const projectIdsBefore = (existingVendor.projects ?? []).map(Number);
      const addedProjectIds = Array.isArray(updateData.projects)
        ? (updateData.projects as unknown[])
            .map(Number)
            .filter((id) => Number.isInteger(id) && !projectIdsBefore.includes(id))
        : [];
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
      const removedProjectIds = Array.isArray(updateData.projects)
        ? projectIdsBefore.filter(
            (id) => !(updateData.projects as unknown[]).map(Number).includes(id),
          )
        : [];
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
  const transaction = await sequelize.transaction();
  const vendorId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting deleteVendorById for ID ${vendorId}`,
    functionName: "deleteVendorById",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const deletedVendor = await deleteVendorByIdQuery(vendorId, req.organizationId!, transaction);

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
