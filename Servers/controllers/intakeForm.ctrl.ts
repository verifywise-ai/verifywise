import { Request, Response } from "express";
import { sequelize } from "../database/db";
import {
  getAllIntakeFormsQuery,
  getIntakeFormByIdQuery,
  getActivePublicFormQuery,
  getFormByPublicIdQuery,
  createIntakeFormQuery,
  updateIntakeFormQuery,
  deleteIntakeFormQuery,
  archiveIntakeFormQuery,
  getPendingSubmissionsQuery,
  getSubmissionByIdQuery,
  getSubmissionsByFormIdQuery,
  approveSubmissionQuery,
  rejectSubmissionQuery,
  getSubmissionStatsQuery,
  checkRateLimitQuery,
  getTenantHashBySlug,
  getTenantSlugById,
  updateSubmissionRiskOverrideQuery,
  getTenantByPublicId,
  getSubmissionByEntityQuery,
} from "../utils/intakeForm.utils";
import { IntakeFormStatus } from "../domain.layer/enums/intake-form-status.enum";
import { IntakeSubmissionStatus } from "../domain.layer/enums/intake-submission-status.enum";
import { IntakeEntityType } from "../domain.layer/enums/intake-entity-type.enum";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger from "../utils/logger/fileLogger";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import {
  sendSubmissionApprovedEmail,
  sendSubmissionRejectedEmail,
} from "../services/intakeFormEmail.service";
import { generateSuggestedQuestions, generateFieldGuidance } from "../services/intakeLLM.service";
import { translateError } from "../utils/i18n.utils";
import { buildEntityDataFromSubmission } from "../utils/intakeForm/intakeFormValidation.utils";
import { sanitizeUserHtml } from "../utils/sanitization/sanitizeUserHtml.utils";
import {
  createSignedToken,
  generateCaptchaChallenge,
} from "../services/intakeForm/intakeFormToken.service";
import {
  buildOrganizationLogoDataUrl,
  resolveResubmissionPrefill,
  validateSubmissionInput,
  createPublicSubmission,
  ValidationError,
  SubmissionValidationResult,
} from "../services/intakeForm/publicIntakeForm.service";
import {
  createEntityFromSubmission,
  UnsupportedEntityTypeError,
} from "../services/intakeForm/intakeFormApproval.service";

const FILE_NAME = "intakeForm.ctrl.ts";

const paramStr = (val: string | string[]): string => (Array.isArray(val) ? val[0] : val);
const parseId = (param: string | string[]): number => parseInt(paramStr(param), 10);

// ============================================================================
// INTAKE FORM CRUD (Admin - Authenticated)
// ============================================================================

export async function getAllIntakeForms(req: Request, res: Response) {
  logProcessing({
    description: "starting getAllIntakeForms",
    functionName: "getAllIntakeForms",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const forms = await getAllIntakeFormsQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](forms));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve intake forms",
      functionName: "getAllIntakeForms",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getIntakeFormById(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form ID")));
  }

  try {
    const form = await getIntakeFormByIdQuery(formId, req.organizationId!);
    if (!form) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Intake form not found")));
    }
    return res.status(200).json(STATUS_CODE[200](form));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `failed to retrieve intake form: ${formId}`,
      functionName: "getIntakeFormById",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function createIntakeForm(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  try {
    const {
      name,
      description,
      slug,
      entityType,
      schema,
      submitButtonText,
      status,
      ttlExpiresAt,
      recipients,
      riskTierSystem,
      riskAssessmentConfig,
      llmKeyId,
      suggestedQuestionsEnabled,
      designSettings,
    } = req.body;

    if (!name || !entityType) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Name and entity type are required")));
    }
    if (!Object.values(IntakeEntityType).includes(entityType)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid entity type")));
    }
    if (status && !Object.values(IntakeFormStatus).includes(status)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form status")));
    }

    const form = await createIntakeFormQuery(
      {
        name,
        description: sanitizeUserHtml(description) as unknown as string,
        slug,
        entityType,
        schema,
        submitButtonText,
        status,
        ttlExpiresAt: ttlExpiresAt ? new Date(ttlExpiresAt) : null,
        recipients,
        riskTierSystem,
        riskAssessmentConfig,
        llmKeyId,
        suggestedQuestionsEnabled,
        designSettings,
        createdBy: req.userId!,
      },
      req.organizationId!,
      transaction,
    );
    await transaction.commit();

    await logSuccess({
      eventType: "Create",
      description: `intake form created: ${form.id}`,
      functionName: "createIntakeForm",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](form));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Create",
      description: "failed to create intake form",
      functionName: "createIntakeForm",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function updateIntakeForm(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form ID")));
  }

  const transaction = await sequelize.transaction();
  try {
    const existingForm = await getIntakeFormByIdQuery(formId, req.organizationId!);
    if (!existingForm) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Intake form not found")));
    }

    const {
      name,
      description,
      slug,
      entityType,
      schema,
      submitButtonText,
      status,
      ttlExpiresAt,
      recipients,
      riskTierSystem,
      riskAssessmentConfig,
      llmKeyId,
      suggestedQuestionsEnabled,
      designSettings,
    } = req.body;

    if (status && !Object.values(IntakeFormStatus).includes(status)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form status")));
    }
    if (entityType && !Object.values(IntakeEntityType).includes(entityType)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid entity type")));
    }

    const form = await updateIntakeFormQuery(
      formId,
      {
        name,
        description: sanitizeUserHtml(description) as unknown as string,
        slug,
        entityType,
        schema,
        submitButtonText,
        status,
        ttlExpiresAt: ttlExpiresAt ? new Date(ttlExpiresAt) : undefined,
        recipients,
        riskTierSystem,
        riskAssessmentConfig,
        llmKeyId,
        suggestedQuestionsEnabled,
        designSettings,
      },
      req.organizationId!,
      transaction,
    );
    await transaction.commit();

    await logSuccess({
      eventType: "Update",
      description: `intake form updated: ${formId}`,
      functionName: "updateIntakeForm",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](form));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `failed to update intake form: ${formId}`,
      functionName: "updateIntakeForm",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function deleteIntakeForm(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form ID")));
  }

  const transaction = await sequelize.transaction();
  try {
    const existingForm = await getIntakeFormByIdQuery(formId, req.organizationId!);
    if (!existingForm) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Intake form not found")));
    }
    if (existingForm.status === IntakeFormStatus.ACTIVE) {
      await transaction.rollback();
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Active forms cannot be deleted. Archive the form first.")));
    }

    await deleteIntakeFormQuery(formId, req.organizationId!, transaction);
    await transaction.commit();

    await logSuccess({
      eventType: "Delete",
      description: `intake form deleted: ${formId}`,
      functionName: "deleteIntakeForm",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ message: req.t!("Form deleted successfully") }));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `failed to delete intake form: ${formId}`,
      functionName: "deleteIntakeForm",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function archiveIntakeForm(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form ID")));
  }

  const transaction = await sequelize.transaction();
  try {
    const existingForm = await getIntakeFormByIdQuery(formId, req.organizationId!);
    if (!existingForm) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Intake form not found")));
    }

    const form = await archiveIntakeFormQuery(formId, req.organizationId!, transaction);
    await transaction.commit();

    await logSuccess({
      eventType: "Update",
      description: `intake form archived: ${formId}`,
      functionName: "archiveIntakeForm",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](form));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `failed to archive intake form: ${formId}`,
      functionName: "archiveIntakeForm",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

// ============================================================================
// SUBMISSION CRUD (Admin - Authenticated)
// ============================================================================

export async function getPendingSubmissions(req: Request, res: Response) {
  try {
    const status = req.query.status as IntakeSubmissionStatus | undefined;
    const submissions = await getPendingSubmissionsQuery(req.organizationId!, status);
    return res.status(200).json(STATUS_CODE[200](submissions));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve pending submissions",
      functionName: "getPendingSubmissions",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getFormSubmissions(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form ID")));
  }
  const status = req.query.status as IntakeSubmissionStatus | undefined;

  try {
    const submissions = await getSubmissionsByFormIdQuery(formId, req.organizationId!, status);
    return res.status(200).json(STATUS_CODE[200](submissions));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `failed to retrieve submissions for form: ${formId}`,
      functionName: "getFormSubmissions",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getSubmissionById(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }

  try {
    const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!);
    if (!submission) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }
    return res.status(200).json(STATUS_CODE[200](submission));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `failed to retrieve submission: ${submissionId}`,
      functionName: "getSubmissionById",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getSubmissionStats(req: Request, res: Response) {
  try {
    const stats = await getSubmissionStatsQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](stats));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve submission stats",
      functionName: "getSubmissionStats",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getSubmissionPreview(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }

  try {
    const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!);
    if (!submission) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }

    const form = await getIntakeFormByIdQuery(submission.formId, req.organizationId!);
    if (!form) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Form not found")));
    }

    const entityData = buildEntityDataFromSubmission(
      submission.data as Record<string, unknown>,
      form.schema,
    );

    return res.status(200).json(
      STATUS_CODE[200]({
        submission,
        form: {
          id: form.id,
          name: form.name,
          entityType: form.entityType,
          schema: form.schema,
          riskTierSystem: form.riskTierSystem,
        },
        riskAssessment: submission.riskAssessment,
        riskTier: submission.riskTier,
        riskOverride: submission.riskOverride,
        entityPreview: entityData,
      }),
    );
  } catch (error) {
    logger.error("Error in getSubmissionPreview:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getSubmissionByEntity(req: Request, res: Response) {
  const entityType = paramStr(req.params.entityType);
  const entityId = parseId(req.params.entityId);

  if (!entityType || isNaN(entityId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid entity type or ID")));
  }

  const validEntityTypes = ["use_case", "model"];
  if (!validEntityTypes.includes(entityType)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Unsupported entity type")));
  }

  try {
    const result = await getSubmissionByEntityQuery(entityType, entityId, req.organizationId!);
    if (!result) {
      return res
        .status(404)
        .json(STATUS_CODE[404](req.t!("No intake submission found for this entity")));
    }

    const { submission, formName, formSchema } = result;
    const submissionData = submission.data as Record<string, unknown>;

    const schemaFields = (formSchema as any)?.fields || [];
    const fields = schemaFields
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      .map((field: any) => ({
        fieldId: field.id,
        label: field.label,
        type: field.type,
        value: submissionData[field.id] ?? null,
        options: field.options || null,
        entityFieldMapping: field.entityFieldMapping || null,
        isMapped: Boolean(field.entityFieldMapping),
      }));

    return res.status(200).json(
      STATUS_CODE[200]({
        submissionId: submission.id,
        formName,
        submitterName: submission.submitterName,
        submitterEmail: submission.submitterEmail,
        submittedAt: submission.createdAt,
        reviewedAt: submission.reviewedAt,
        riskTier: submission.riskTier,
        fields,
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `failed to fetch submission for ${entityType}:${entityId}`,
      functionName: "getSubmissionByEntity",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function overrideSubmissionRisk(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }

  try {
    const { tier, dimensionOverrides, justification } = req.body;
    if (!tier || !justification) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Tier and justification are required")));
    }

    const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!);
    if (!submission) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }

    const override = {
      tier,
      dimensionOverrides: dimensionOverrides || {},
      justification,
      overriddenBy: req.userId!,
      overriddenAt: new Date().toISOString(),
    };
    await updateSubmissionRiskOverrideQuery(submissionId, override, req.organizationId!);

    await logSuccess({
      eventType: "Update",
      description: `risk override applied to submission: ${submissionId}`,
      functionName: "overrideSubmissionRisk",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res
      .status(200)
      .json(STATUS_CODE[200]({ message: req.t!("Risk override applied"), override }));
  } catch (error) {
    logger.error("Error in overrideSubmissionRisk:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function approveSubmission(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }

  const transaction = await sequelize.transaction();
  try {
    const submission = await getSubmissionByIdQuery(
      submissionId,
      req.organizationId!,
      transaction,
      true,
    );
    if (!submission) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }
    if (submission.status !== IntakeSubmissionStatus.PENDING) {
      await transaction.rollback();
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Only pending submissions can be approved")));
    }

    const form = await getIntakeFormByIdQuery(submission.formId, req.organizationId!);
    if (!form) {
      await transaction.rollback();
      return res
        .status(404)
        .json(
          STATUS_CODE[404](
            req.t!(
              "The form associated with this submission no longer exists. Cannot create entity.",
            ),
          ),
        );
    }
    const formName = form.name;

    const { confirmedEntityData, riskOverride } = req.body;
    const entityData =
      confirmedEntityData ||
      buildEntityDataFromSubmission(submission.data as Record<string, unknown>, form.schema);

    if (riskOverride && riskOverride.tier && riskOverride.justification) {
      await updateSubmissionRiskOverrideQuery(
        submissionId,
        {
          ...riskOverride,
          overriddenBy: req.userId!,
          overriddenAt: new Date().toISOString(),
        },
        req.organizationId!,
        transaction,
      );
    }

    let entityId: number;
    try {
      entityId = await createEntityFromSubmission(
        submission.entityType as IntakeEntityType,
        entityData,
        req.userId!,
        req.organizationId!,
        transaction,
      );
    } catch (error) {
      if (error instanceof UnsupportedEntityTypeError) {
        await transaction.rollback();
        return res.status(400).json(STATUS_CODE[400](req.t!("Unsupported entity type")));
      }
      throw error;
    }

    const updatedSubmission = await approveSubmissionQuery(
      submissionId,
      entityId,
      req.userId!,
      req.organizationId!,
      transaction,
    );
    await transaction.commit();

    if (submission.submitterEmail) {
      sendSubmissionApprovedEmail(
        submission.submitterEmail,
        submission.submitterName || "Submitter",
        formName,
        submissionId,
        submission.entityType,
        req.lang,
      ).catch((err) => logger.error("Failed to send approval email:", err));
    }

    await logSuccess({
      eventType: "Update",
      description: `submission approved: ${submissionId}, entity created: ${entityId}`,
      functionName: "approveSubmission",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](updatedSubmission));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `failed to approve submission: ${submissionId}`,
      functionName: "approveSubmission",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function rejectSubmission(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }

  const transaction = await sequelize.transaction();
  try {
    const rejectionReason = req.body.rejectionReason || req.body.reason;
    if (!rejectionReason || !rejectionReason.trim()) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Rejection reason is required")));
    }

    const submission = await getSubmissionByIdQuery(
      submissionId,
      req.organizationId!,
      transaction,
      true,
    );
    if (!submission) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }
    if (submission.status !== IntakeSubmissionStatus.PENDING) {
      await transaction.rollback();
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Only pending submissions can be rejected")));
    }

    const form = await getIntakeFormByIdQuery(submission.formId, req.organizationId!);
    const formName = form?.name || "Unknown Form";
    const formPublicId = form?.publicId;
    const tenantSlug = await getTenantSlugById(req.organizationId!);
    const formSlug = form?.slug || "";

    const updatedSubmission = await rejectSubmissionQuery(
      submissionId,
      rejectionReason,
      req.userId!,
      req.organizationId!,
      transaction,
    );
    await transaction.commit();

    if (submission.submitterEmail) {
      const resubmissionToken = createSignedToken({
        submissionId: submission.id,
        formId: submission.formId,
        email: submission.submitterEmail,
        timestamp: Date.now(),
      });
      if (formPublicId || (tenantSlug && formSlug)) {
        sendSubmissionRejectedEmail(
          submission.submitterEmail,
          submission.submitterName || "Submitter",
          formName,
          submissionId,
          rejectionReason,
          resubmissionToken,
          formPublicId || "",
          tenantSlug || "",
          formSlug,
          req.lang,
        ).catch((err) => logger.error("Failed to send rejection email:", err));
      } else {
        logger.warn(
          `Could not send rejection email for submission #${submissionId}: missing routing info`,
        );
      }
    }

    await logSuccess({
      eventType: "Update",
      description: `submission rejected: ${submissionId}`,
      functionName: "rejectSubmission",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](updatedSubmission));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `failed to reject submission: ${submissionId}`,
      functionName: "rejectSubmission",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

// ============================================================================
// LLM helpers (Admin - Authenticated)
// ============================================================================

export async function getLLMSuggestedQuestions(req: Request, res: Response) {
  try {
    const { entityType, context, llmKeyId } = req.body;
    if (!llmKeyId) {
      return res.status(400).json(STATUS_CODE[400](req.t!("LLM key ID is required")));
    }

    const questions = await generateSuggestedQuestions(
      entityType || "use_case",
      context || "",
      llmKeyId,
      req.organizationId!,
    );
    if (!questions) {
      return res.status(500).json(STATUS_CODE[500](req.t!("Failed to generate questions")));
    }
    return res.status(200).json(STATUS_CODE[200](questions));
  } catch (error) {
    logger.error("Error in getLLMSuggestedQuestions:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getFieldGuidance(req: Request, res: Response) {
  try {
    const { fieldLabel, entityType, llmKeyId } = req.body;
    if (!fieldLabel || !llmKeyId) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Field label and LLM key ID are required")));
    }

    const guidanceText = await generateFieldGuidance(
      fieldLabel,
      entityType || "use_case",
      llmKeyId,
      req.organizationId!,
    );
    if (!guidanceText) {
      return res.status(500).json(STATUS_CODE[500](req.t!("Failed to generate guidance")));
    }
    return res.status(200).json(STATUS_CODE[200]({ guidanceText }));
  } catch (error) {
    logger.error("Error in getFieldGuidance:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

// ============================================================================
// PUBLIC FORM endpoints
// ============================================================================

export async function previewForm(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form ID")));
  }

  try {
    const form = await getIntakeFormByIdQuery(formId, req.organizationId!);
    if (!form) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Form not found")));
    }

    return res.status(200).json(
      STATUS_CODE[200]({
        form: {
          id: form.id,
          name: form.name,
          description: form.description,
          slug: form.slug,
          entityType: form.entityType,
          schema: form.schema,
          submitButtonText: form.submitButtonText,
          publicId: form.publicId,
          designSettings: form.designSettings ?? null,
        },
        isPreview: true,
      }),
    );
  } catch (error) {
    logger.error("Error in previewForm:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

const buildPublicFormPayload = async (
  form: any,
  orgId: number,
  resubmissionToken: string | undefined,
) => {
  const [organizationLogo, prefill] = await Promise.all([
    buildOrganizationLogoDataUrl(orgId),
    resolveResubmissionPrefill(resubmissionToken, form.id, orgId),
  ]);

  return STATUS_CODE[200]({
    form: {
      id: form.id,
      name: form.name,
      description: form.description,
      slug: form.slug,
      entityType: form.entityType,
      schema: form.schema,
      submitButtonText: form.submitButtonText,
      publicId: form.publicId,
      designSettings: form.designSettings ?? null,
    },
    organizationLogo,
    ...prefill,
  });
};

export async function getPublicFormByPublicId(req: Request, res: Response) {
  const publicId = paramStr(req.params.publicId);
  const resubmissionToken = req.query.token as string | undefined;

  try {
    const tenantInfo = await getTenantByPublicId(publicId);
    if (!tenantInfo) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Form not found")));
    }

    const form = await getFormByPublicIdQuery(publicId, tenantInfo.orgId);
    if (!form) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Form not found or not available")));
    }

    return res.status(200).json(await buildPublicFormPayload(form, tenantInfo.orgId, resubmissionToken));
  } catch (error) {
    logger.error(`Error in getPublicFormByPublicId: ${publicId}`, error);
    return res
      .status(500)
      .json(STATUS_CODE[500](req.t!("An error occurred while loading the form. Please try again.")));
  }
}

export async function getPublicForm(req: Request, res: Response) {
  const tenantSlug = paramStr(req.params.tenantSlug);
  const formSlug = paramStr(req.params.formSlug);
  const resubmissionToken = req.query.token as string | undefined;

  try {
    const tenantInfo = await getTenantHashBySlug(tenantSlug);
    if (!tenantInfo) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Organization not found")));
    }

    const form = await getActivePublicFormQuery(formSlug, tenantInfo.id);
    if (!form) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Form not found or not available")));
    }

    return res.status(200).json(await buildPublicFormPayload(form, tenantInfo.id, resubmissionToken));
  } catch (error) {
    logger.error(`Error in getPublicForm: ${tenantSlug}/${formSlug}`, error);
    return res
      .status(500)
      .json(STATUS_CODE[500](req.t!("An error occurred while loading the form. Please try again.")));
  }
}

const submissionErrorToResponse = (
  res: Response,
  t: (key: string) => string,
  validation: Extract<SubmissionValidationResult, { ok: false }>,
): Response => {
  const messages: Record<ValidationError, string> = {
    submitter_email_required: t("Submitter email is required"),
    invalid_email: t("Invalid email format"),
    form_data_required: t("Form data is required"),
    form_data_not_object: t("Form data must be an object"),
    captcha_missing: t("CAPTCHA verification required"),
    captcha_invalid: t("Invalid CAPTCHA token"),
    captcha_expired: t("CAPTCHA expired. Please refresh and try again."),
    captcha_wrong: t("Incorrect CAPTCHA answer"),
    resubmission_expired: t("Resubmission link has expired. Please request a new one."),
    resubmission_email_mismatch: t("Email does not match the original submission."),
  };

  if (validation.formErrors && validation.formErrors.length > 0) {
    return res.status(400).json(
      STATUS_CODE[400]({
        message: t("Form validation failed"),
        errors: validation.formErrors,
      }),
    );
  }

  return res.status(400).json(STATUS_CODE[400](messages[validation.error]));
};

interface PublicSubmitContext {
  orgId: number;
  formResolver: () => Promise<any | null>;
  legacyContext?: { tenantSlug: string; formSlug: string };
  legacyFallbackOrgRecipients?: boolean;
  errorLogTag: string;
}

const handlePublicSubmit = async (
  req: Request,
  res: Response,
  ctx: PublicSubmitContext,
): Promise<Response> => {
  try {
    const clientIp =
      req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0] || "unknown";

    const withinLimit = await checkRateLimitQuery(clientIp, ctx.orgId);
    if (!withinLimit) {
      return res
        .status(429)
        .json(STATUS_CODE[429](req.t!("Too many submissions. Please try again later.")));
    }

    const form = await ctx.formResolver();
    if (!form) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Form not found or not available")));
    }

    const fullFormForValidation = await getIntakeFormByIdQuery(form.id, ctx.orgId);

    const validation = await validateSubmissionInput(
      req.body,
      fullFormForValidation ? { schema: fullFormForValidation.schema } : null,
    );

    if (!validation.ok) {
      return submissionErrorToResponse(res, req.t!, validation);
    }

    const transaction = await sequelize.transaction();
    try {
      const result = await createPublicSubmission({
        form,
        orgId: ctx.orgId,
        clientIp,
        resolvedEmail: validation.resolvedEmail,
        resolvedName: validation.resolvedName,
        formData: validation.formData,
        originalSubmissionId: validation.originalSubmissionId,
        lang: req.lang,
        legacyContext: ctx.legacyContext,
        legacyFallbackOrgRecipients: ctx.legacyFallbackOrgRecipients,
        transaction,
      });

      await transaction.commit();

      return res.status(201).json(
        STATUS_CODE[201]({
          message: validation.resolvedEmail
            ? "Form submitted successfully. You will receive an email when your submission is reviewed."
            : "Form submitted successfully.",
          submissionId: result.submissionId,
          resubmissionToken: result.newResubmissionToken,
        }),
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    logger.error(`Error in ${ctx.errorLogTag}`, error);
    return res
      .status(500)
      .json(
        STATUS_CODE[500](req.t!("An error occurred while submitting the form. Please try again.")),
      );
  }
};

export async function submitPublicFormByPublicId(req: Request, res: Response) {
  const publicId = paramStr(req.params.publicId);
  const tenantInfo = await getTenantByPublicId(publicId);
  if (!tenantInfo) {
    return res.status(404).json(STATUS_CODE[404](req.t!("Form not found")));
  }

  return handlePublicSubmit(req, res, {
    orgId: tenantInfo.orgId,
    formResolver: () => getFormByPublicIdQuery(publicId, tenantInfo.orgId),
    errorLogTag: `submitPublicFormByPublicId: ${publicId}`,
  });
}

export async function submitPublicForm(req: Request, res: Response) {
  const tenantSlug = paramStr(req.params.tenantSlug);
  const formSlug = paramStr(req.params.formSlug);

  const tenantInfo = await getTenantHashBySlug(tenantSlug);
  if (!tenantInfo) {
    return res.status(404).json(STATUS_CODE[404](req.t!("Organization not found")));
  }

  return handlePublicSubmit(req, res, {
    orgId: tenantInfo.id,
    formResolver: () => getActivePublicFormQuery(formSlug, tenantInfo.id),
    legacyContext: { tenantSlug, formSlug },
    legacyFallbackOrgRecipients: true,
    errorLogTag: `submitPublicForm: ${tenantSlug}/${formSlug}`,
  });
}

export async function getCaptcha(_req: Request, res: Response) {
  const { question, token } = generateCaptchaChallenge();
  return res.status(200).json(STATUS_CODE[200]({ question, token }));
}
