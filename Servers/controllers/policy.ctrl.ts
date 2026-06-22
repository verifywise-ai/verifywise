import { Request, Response } from "express";
import {
  IPolicy,
  POLICY_TAGS,
  PolicyTag,
  PolicyTagsSet,
} from "../domain.layer/interfaces/i.policy";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  createPolicyQuery,
  deletePolicyByIdQuery,
  getAllPoliciesQuery,
  getPolicyByIdQuery,
  updatePolicyByIdQuery,
  updatePolicyReviewStatusQuery,
  bulkArchivePoliciesQuery,
  bulkSetPoliciesReviewerQuery,
  bulkSetPoliciesTagsQuery,
} from "../utils/policyManager.utils";
import { parseBulkIds, assertOrgOwnsIds, withBulkTransaction } from "../utils/bulkAction.utils";
import {
  ForbiddenException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import {
  recordPolicyCreation,
  trackPolicyChanges,
  recordMultipleFieldChanges,
} from "../utils/policyChangeHistory.utils";
import {
  generatePolicyPDF,
  generatePolicyDOCX,
  generateFilename,
} from "../services/policies/policyExporter";
import { convertDocxToHtml, DOCX_ALLOWED_MIMES } from "../services/policies/policyImporter";
import {
  notifyReviewRequested,
  notifyReviewApproved,
  notifyReviewRejected,
} from "../services/inAppNotification.service";
import { NotificationEntityType } from "../domain.layer/interfaces/i.notification";
import logger from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import { sanitizeUserHtml } from "../utils/sanitizeUserHtml";

export class PolicyController {
  // Get all policies
  static async getAllPolicies(req: Request, res: Response) {
    try {
      const policies = await getAllPoliciesQuery(req.organizationId!);

      return res.status(200).json(STATUS_CODE[200](policies));
    } catch (error) {
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
  }

  // Get policy by ID
  static async getPolicyById(req: Request, res: Response) {
    try {
      const policyId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
      const policy = await getPolicyByIdQuery(req.organizationId!, policyId);

      if (policy) {
        return res.status(200).json(STATUS_CODE[200](policy));
      }

      return res.status(404).json(STATUS_CODE[404](null));
    } catch (error) {
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
  }

  // Create new policy
  static async createPolicy(req: Request, res: Response) {
    const transaction = await sequelize.transaction();
    try {
      const userId = req.userId!;
      const policyData = {
        ...req.body,
        ...(req.body?.content_html !== undefined && {
          content_html: sanitizeUserHtml(req.body.content_html),
        }),
        author_id: userId,
        last_updated_by: userId,
      } as IPolicy;

      const policy = await createPolicyQuery(policyData, req.organizationId!, userId, transaction);

      if (policy) {
        // Record creation in change history
        if (policy.id) {
          await recordPolicyCreation(
            policy.id,
            userId,
            req.organizationId!,
            policyData,
            transaction,
          );
        }

        await transaction.commit();
        return res.status(201).json(STATUS_CODE[201](policy));
      }
      await transaction.rollback();
      return res.status(503).json(STATUS_CODE[503]({}));
    } catch (error) {
      await transaction.rollback();
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
  }

  // Update policy
  static async updatePolicy(req: Request, res: Response) {
    const transaction = await sequelize.transaction();
    try {
      const policyId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
      const userId = req.userId!;
      // Get existing policy for change tracking
      const existingPolicyResult = await getPolicyByIdQuery(req.organizationId!, policyId);

      if (!existingPolicyResult || existingPolicyResult.length === 0) {
        await transaction.rollback();
        return res.status(404).json(STATUS_CODE[404]({}));
      }

      const existingPolicy = existingPolicyResult[0];

      const policyData = {
        ...req.body,
        ...(req.body?.content_html !== undefined && {
          content_html: sanitizeUserHtml(req.body.content_html),
        }),
        last_updated_by: userId,
      } as Partial<IPolicy>;

      const policy = await updatePolicyByIdQuery(
        policyId,
        policyData,
        req.organizationId!,
        userId,
        transaction,
      );

      if (policy) {
        // Track and record changes
        const changes = await trackPolicyChanges(existingPolicy as unknown as IPolicy, policyData);
        if (changes.length > 0) {
          await recordMultipleFieldChanges(
            policyId,
            userId,
            req.organizationId!,
            changes,
            transaction,
          );
        }

        await transaction.commit();
        return res.status(202).json(STATUS_CODE[202](policy));
      }
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({}));
    } catch (error) {
      await transaction.rollback();
      logger.error("Error updating policy:", error);
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
  }

  // Get available policy tags
  static async getPolicyTags(_req: Request, res: Response) {
    try {
      return res.status(200).json(STATUS_CODE[200](POLICY_TAGS));
    } catch (error) {
      return res.status(500).json(STATUS_CODE[500](translateError(_req, error)));
    }
  }

  // In PolicyController
  static async deletePolicyById(req: Request, res: Response) {
    const transaction = await sequelize.transaction();
    try {
      const policyId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

      const deleted = await deletePolicyByIdQuery(req.organizationId!, policyId, transaction);

      if (deleted) {
        await transaction.commit();
        return res.status(202).json(STATUS_CODE[202](deleted));
      }

      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({}));
    } catch (error) {
      await transaction.rollback();
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
  }

  // Export policy as PDF
  static async exportPolicyPDF(req: Request, res: Response) {
    try {
      const policyId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
      if (isNaN(policyId)) {
        return res.status(400).json(STATUS_CODE[400](req.t!("Invalid policy ID")));
      }

      const policyResult = await getPolicyByIdQuery(req.organizationId!, policyId);

      if (!policyResult || policyResult.length === 0) {
        return res.status(404).json(STATUS_CODE[404](null));
      }

      const policy = policyResult[0] as IPolicy;
      const pdfBuffer = await generatePolicyPDF(
        policy.title,
        policy.content_html || "",
        req.organizationId!,
      );

      const filename = generateFilename(policy.title, "pdf");

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);

      return res.send(pdfBuffer);
    } catch (error) {
      logger.error("Error exporting policy as PDF:", error);
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
  }

  // Export policy as DOCX
  static async exportPolicyDOCX(req: Request, res: Response) {
    try {
      const policyId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
      if (isNaN(policyId)) {
        return res.status(400).json(STATUS_CODE[400](req.t!("Invalid policy ID")));
      }

      const policyResult = await getPolicyByIdQuery(req.organizationId!, policyId);

      if (!policyResult || policyResult.length === 0) {
        return res.status(404).json(STATUS_CODE[404](null));
      }

      const policy = policyResult[0] as IPolicy;
      logger.debug(`Exporting DOCX for policy ${policyId}: ${policy.title}`);

      const docxBuffer = await generatePolicyDOCX(
        policy.title,
        policy.content_html || "",
        req.organizationId!,
      );
      logger.debug(`Generated DOCX buffer for policy ${policyId}: ${docxBuffer.length} bytes`);

      const filename = generateFilename(policy.title, "docx");

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", docxBuffer.length);

      return res.send(docxBuffer);
    } catch (error) {
      logger.error("Error exporting policy as DOCX:", error as Error);
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
  }

  // Import DOCX and convert to HTML
  static async importDocx(req: Request, res: Response) {
    const userId = req.userId!;
    const organizationId = req.organizationId!;

    logProcessing({
      description: "Starting DOCX import",
      functionName: "importDocx",
      fileName: "policy.ctrl.ts",
      userId,
      organizationId,
    });

    try {
      if (!req.file) {
        return res.status(400).json(STATUS_CODE[400](req.t!("No file uploaded")));
      }

      // Validate MIME type and file extension
      const hasDocxExtension = req.file.originalname?.toLowerCase().endsWith(".docx");
      if (
        !DOCX_ALLOWED_MIMES.includes(req.file.mimetype as (typeof DOCX_ALLOWED_MIMES)[number]) ||
        !hasDocxExtension
      ) {
        return res.status(400).json(STATUS_CODE[400](req.t!("Only .docx files are supported")));
      }

      const { html, warnings } = await convertDocxToHtml(req.file.buffer);

      await logSuccess({
        eventType: "Read",
        description: `DOCX import completed (${warnings.length} warning(s))`,
        functionName: "importDocx",
        fileName: "policy.ctrl.ts",
        userId,
        organizationId,
      });

      return res.status(200).json(STATUS_CODE[200]({ html, warnings }));
    } catch (error) {
      await logFailure({
        eventType: "Read",
        description: "Failed to import DOCX file",
        functionName: "importDocx",
        fileName: "policy.ctrl.ts",
        error: error as Error,
        userId,
        organizationId,
      });
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
  }

  // Request review for a policy
  static async requestReview(req: Request, res: Response) {
    const transaction = await sequelize.transaction();
    try {
      const policyId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
      if (isNaN(policyId)) {
        await transaction.rollback();
        return res.status(400).json(STATUS_CODE[400](req.t!("Invalid policy ID")));
      }

      const userId = req.userId!;
      const { reviewer_ids, message } = req.body;

      if (!reviewer_ids || !Array.isArray(reviewer_ids) || reviewer_ids.length === 0) {
        await transaction.rollback();
        return res.status(400).json(STATUS_CODE[400](req.t!("reviewer_ids is required")));
      }

      const policyResult = await getPolicyByIdQuery(req.organizationId!, policyId);
      if (!policyResult || policyResult.length === 0) {
        await transaction.rollback();
        return res.status(404).json(STATUS_CODE[404](null));
      }
      const policy = policyResult[0] as any;

      // Update review status to pending_review
      await updatePolicyReviewStatusQuery(
        req.organizationId!,
        policyId,
        "pending_review",
        userId,
        message,
        transaction,
      );

      await transaction.commit();

      // Send notifications to each reviewer
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const requesterUser = (await sequelize.query(
        `SELECT name, surname FROM users WHERE id = :userId`,
        { replacements: { userId }, type: QueryTypes.SELECT },
      )) as { name: string; surname: string }[];
      const requesterName = requesterUser[0]
        ? `${requesterUser[0].name} ${requesterUser[0].surname}`
        : "User";

      for (const rid of reviewer_ids) {
        const reviewerId = Number(rid);
        if (isNaN(reviewerId)) continue;
        try {
          await notifyReviewRequested(
            req.organizationId!,
            reviewerId,
            {
              type: NotificationEntityType.POLICY,
              id: policyId,
              name: policy.title,
              projectName: "",
            },
            requesterName,
            message || "Please review this policy.",
            baseUrl,
          );
        } catch (notifyError) {
          logger.error("Failed to notify reviewer %d:", reviewerId, notifyError);
        }
      }

      const updatedPolicy = await getPolicyByIdQuery(req.organizationId!, policyId);
      return res.status(200).json(STATUS_CODE[200](updatedPolicy?.[0] || null));
    } catch (error) {
      await transaction.rollback();
      logger.error("Error requesting policy review:", error);
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
  }

  // Approve a policy review
  static async approveReview(req: Request, res: Response) {
    const transaction = await sequelize.transaction();
    try {
      const policyId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
      if (isNaN(policyId)) {
        await transaction.rollback();
        return res.status(400).json(STATUS_CODE[400](req.t!("Invalid policy ID")));
      }

      const reviewerId = req.userId!;
      const { comment } = req.body;

      const policyResult = await getPolicyByIdQuery(req.organizationId!, policyId);
      if (!policyResult || policyResult.length === 0) {
        await transaction.rollback();
        return res.status(404).json(STATUS_CODE[404](null));
      }
      const policy = policyResult[0] as any;

      // Update review status to approved
      await updatePolicyReviewStatusQuery(
        req.organizationId!,
        policyId,
        "approved",
        reviewerId,
        comment,
        transaction,
      );

      await transaction.commit();

      // Notify the policy author
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const reviewerUser = (await sequelize.query(
        `SELECT name, surname FROM users WHERE id = :reviewerId`,
        { replacements: { reviewerId }, type: QueryTypes.SELECT },
      )) as { name: string; surname: string }[];
      const reviewerName = reviewerUser[0]
        ? `${reviewerUser[0].name} ${reviewerUser[0].surname}`
        : "Reviewer";

      try {
        await notifyReviewApproved(
          req.organizationId!,
          policy.author_id,
          {
            type: NotificationEntityType.POLICY,
            id: policyId,
            name: policy.title,
            projectName: "",
          },
          reviewerName,
          comment || "Looks good!",
          baseUrl,
        );
      } catch (notifyError) {
        logger.error("Failed to send review approved notification:", notifyError);
      }

      const updatedPolicy = await getPolicyByIdQuery(req.organizationId!, policyId);
      return res.status(200).json(STATUS_CODE[200](updatedPolicy?.[0] || null));
    } catch (error) {
      await transaction.rollback();
      logger.error("Error approving policy review:", error);
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
  }

  // Reject a policy review (request changes)
  static async rejectReview(req: Request, res: Response) {
    const transaction = await sequelize.transaction();
    try {
      const policyId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
      if (isNaN(policyId)) {
        await transaction.rollback();
        return res.status(400).json(STATUS_CODE[400](req.t!("Invalid policy ID")));
      }

      const reviewerId = req.userId!;
      const { comment } = req.body;

      if (!comment) {
        await transaction.rollback();
        return res
          .status(400)
          .json(STATUS_CODE[400](req.t!("comment is required when requesting changes")));
      }

      const policyResult = await getPolicyByIdQuery(req.organizationId!, policyId);
      if (!policyResult || policyResult.length === 0) {
        await transaction.rollback();
        return res.status(404).json(STATUS_CODE[404](null));
      }
      const policy = policyResult[0] as any;

      // Update review status to changes_requested
      await updatePolicyReviewStatusQuery(
        req.organizationId!,
        policyId,
        "changes_requested",
        reviewerId,
        comment,
        transaction,
      );

      await transaction.commit();

      // Notify the policy author
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const reviewerUser = (await sequelize.query(
        `SELECT name, surname FROM users WHERE id = :reviewerId`,
        { replacements: { reviewerId }, type: QueryTypes.SELECT },
      )) as { name: string; surname: string }[];
      const reviewerName = reviewerUser[0]
        ? `${reviewerUser[0].name} ${reviewerUser[0].surname}`
        : "Reviewer";

      try {
        await notifyReviewRejected(
          req.organizationId!,
          policy.author_id,
          {
            type: NotificationEntityType.POLICY,
            id: policyId,
            name: policy.title,
            projectName: "",
          },
          reviewerName,
          comment,
          baseUrl,
        );
      } catch (notifyError) {
        logger.error("Failed to send review rejected notification:", notifyError);
      }

      const updatedPolicy = await getPolicyByIdQuery(req.organizationId!, policyId);
      return res.status(200).json(STATUS_CODE[200](updatedPolicy?.[0] || null));
    } catch (error) {
      await transaction.rollback();
      logger.error("Error rejecting policy review:", error);
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
  }

  /**
   * PATCH /api/policies/bulk
   *
   * Body: { ids: number[], action: 'archive' | 'set_reviewer' | 'set_tags',
   *         reviewerId?: number, tags?: string[] }
   *
   * Tenant-scoped bulk update. Authorized for Admin and Editor roles.
   */
  static async bulkUpdatePolicies(req: Request, res: Response): Promise<any> {
    logProcessing({
      description: "starting bulkUpdatePolicies",
      functionName: "bulkUpdatePolicies",
      fileName: "policy.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    try {
      const ids = parseBulkIds(req.body?.ids);
      const action = req.body?.action as "archive" | "set_reviewer" | "set_tags" | undefined;

      if (action !== "archive" && action !== "set_reviewer" && action !== "set_tags") {
        throw new ValidationException(
          "action must be one of: archive, set_reviewer, set_tags",
          "action",
          req.body?.action,
        );
      }

      let reviewerId: number | undefined;
      if (action === "set_reviewer") {
        const raw = req.body?.reviewerId;
        const parsed = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new ValidationException("reviewerId must be a positive integer", "reviewerId", raw);
        }
        reviewerId = parsed;
      }

      let tags: PolicyTag[] | undefined;
      if (action === "set_tags") {
        const raw = req.body?.tags;
        if (!Array.isArray(raw)) {
          throw new ValidationException("tags must be an array", "tags", raw);
        }
        for (const t of raw) {
          if (typeof t !== "string" || !PolicyTagsSet.has(t as PolicyTag)) {
            throw new ValidationException(`Invalid policy tag: ${String(t)}`, "tags", t);
          }
        }
        tags = raw as PolicyTag[];
      }

      await withBulkTransaction(
        {
          audit: {
            action,
            ids,
            fileName: "policy.ctrl.ts",
            functionName: "bulkUpdatePolicies",
            userId: req.userId!,
            organizationId: req.organizationId!,
          },
        },
        async (transaction) => {
          await assertOrgOwnsIds({
            table: "policy_manager",
            ids,
            organizationId: req.organizationId!,
            transaction,
          });

          if (action === "archive") {
            await bulkArchivePoliciesQuery(req.organizationId!, ids, req.userId!, transaction);
          } else if (action === "set_reviewer") {
            await bulkSetPoliciesReviewerQuery(req.organizationId!, ids, reviewerId!, transaction);
          } else {
            await bulkSetPoliciesTagsQuery(req.organizationId!, ids, tags!, transaction);
          }
        },
      );

      return res.status(200).json(STATUS_CODE[200]({ updated: ids.length, action }));
    } catch (error) {
      if (error instanceof ValidationException) {
        return res.status(400).json(STATUS_CODE[400](error.message));
      }
      if (error instanceof ForbiddenException) {
        return res.status(403).json(STATUS_CODE[403](error.message));
      }
      return res.status(500).json(STATUS_CODE[500]((error as Error).message));
    }
  }
}
