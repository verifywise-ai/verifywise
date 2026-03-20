import { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
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
  createSubmissionQuery,
  approveSubmissionQuery,
  rejectSubmissionQuery,
  getSubmissionStatsQuery,
  checkRateLimitQuery,
  getTenantHashBySlug,
  getTenantSlugById,
  updateSubmissionRiskQuery,
  updateSubmissionRiskOverrideQuery,
  getTenantByPublicId,
  getSubmissionByEntityQuery,
} from "../utils/intakeForm.utils";
import { createNewModelInventoryQuery } from "../utils/modelInventory.utils";
import { createNewProjectQuery } from "../utils/project.utils";
import { IntakeFormStatus } from "../domain.layer/enums/intake-form-status.enum";
import { IntakeSubmissionStatus } from "../domain.layer/enums/intake-submission-status.enum";
import { IntakeEntityType } from "../domain.layer/enums/intake-entity-type.enum";
import { ModelInventoryStatus } from "../domain.layer/enums/model-inventory-status.enum";
import { ProjectStatus } from "../domain.layer/enums/project-status.enum";
import { AiRiskClassification } from "../domain.layer/enums/ai-risk-classification.enum";
import { ModelInventoryModel } from "../domain.layer/models/modelInventory/modelInventory.model";
import { IIntakeFormSchema } from "../domain.layer/interfaces/i.intakeForm";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger from "../utils/logger/fileLogger";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import {
  sendSubmissionReceivedEmail,
  sendNewSubmissionAdminNotification,
  sendSubmissionApprovedEmail,
  sendSubmissionRejectedEmail,
} from "../services/intakeFormEmail.service";
import { calculateSubmissionRisk } from "../services/intakeRiskScoring.service";
import {
  generateSuggestedQuestions,
  generateFieldGuidance,
} from "../services/intakeLLM.service";
import { getCompanyLogoQuery } from "../utils/aiTrustCentre.utils";

/** Safely extract a single string from req.params (which may be string | string[]). */
const paramStr = (val: string | string[]): string =>
  Array.isArray(val) ? val[0] : val;

/** Secret key for signing CAPTCHA and resubmission tokens. */
const TOKEN_SECRET = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY;
if (!TOKEN_SECRET) {
  throw new Error("JWT_SECRET or ENCRYPTION_KEY must be set for intake form token signing");
}

/** Map lowercase form option values to valid AiRiskClassification enum values. */
function mapToAiRiskClassification(value: string): AiRiskClassification | string {
  const map: Record<string, AiRiskClassification> = {
    minimal: AiRiskClassification.MINIMAL_RISK,
    limited: AiRiskClassification.LIMITED_RISK,
    high: AiRiskClassification.HIGH_RISK,
    unacceptable: AiRiskClassification.PROHIBITED,
    // Also accept display values directly
    "minimal risk": AiRiskClassification.MINIMAL_RISK,
    "limited risk": AiRiskClassification.LIMITED_RISK,
    "high risk": AiRiskClassification.HIGH_RISK,
    "prohibited": AiRiskClassification.PROHIBITED,
  };
  return map[value?.toLowerCase()?.trim()] || value || "";
}

/** Create an HMAC-signed token from a payload object. */
function createSignedToken(payload: Record<string, unknown>): string {
  const data = JSON.stringify(payload);
  const signature = createHmac("sha256", TOKEN_SECRET!).update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
}

/** Verify and decode an HMAC-signed token. Returns null if invalid. */
function verifySignedToken<T = Record<string, unknown>>(token: string): T | null {
  try {
    const { data, signature } = JSON.parse(Buffer.from(token, "base64").toString());
    const expectedSignature = createHmac("sha256", TOKEN_SECRET!).update(data).digest("hex");
    // Use timing-safe comparison to prevent timing attacks
    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expectedSignature, "hex");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/** Parse and validate an integer ID parameter. Returns NaN for invalid values. */
function parseId(param: string | string[]): number {
  return parseInt(paramStr(param), 10);
}

// ============================================================================
// SERVER-SIDE FORM DATA VALIDATION
// ============================================================================

/**
 * Validate submitted form data against the form schema.
 * Returns an array of error messages (empty if valid).
 */
function validateFormData(
  formData: Record<string, unknown>,
  schema: IIntakeFormSchema
): string[] {
  const errors: string[] = [];

  for (const field of schema.fields) {
    const value = formData[field.id];
    const isEmpty = value === undefined || value === null || value === "";

    // Required check — field.required (backend interface) or field.validation.required (frontend schema)
    const isRequired = field.required || field.validation?.required;
    if (isRequired && isEmpty) {
      errors.push(`"${field.label}" is required`);
      continue;
    }

    // Skip validation for empty optional fields
    if (isEmpty) continue;

    // Type-specific validation
    switch (field.type) {
      case "email": {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (typeof value !== "string" || !emailRegex.test(value)) {
          errors.push(`"${field.label}" must be a valid email address`);
        }
        break;
      }
      case "url": {
        if (typeof value !== "string") {
          errors.push(`"${field.label}" must be a valid URL`);
        } else {
          try {
            new URL(value);
          } catch {
            errors.push(`"${field.label}" must be a valid URL`);
          }
        }
        break;
      }
      case "number": {
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(`"${field.label}" must be a number`);
        } else if (field.validation) {
          if (field.validation.min !== undefined && num < field.validation.min) {
            errors.push(`"${field.label}" must be at least ${field.validation.min}`);
          }
          if (field.validation.max !== undefined && num > field.validation.max) {
            errors.push(`"${field.label}" must be at most ${field.validation.max}`);
          }
        }
        break;
      }
      case "text":
      case "textarea": {
        if (typeof value !== "string") {
          errors.push(`"${field.label}" must be text`);
        } else if (field.validation) {
          if (field.validation.minLength !== undefined && value.length < field.validation.minLength) {
            errors.push(`"${field.label}" must be at least ${field.validation.minLength} characters`);
          }
          if (field.validation.maxLength !== undefined && value.length > field.validation.maxLength) {
            errors.push(`"${field.label}" must be at most ${field.validation.maxLength} characters`);
          }
        }
        break;
      }
      case "select": {
        if (typeof value !== "string") {
          errors.push(`"${field.label}" must be a single selection`);
        } else if (field.options && field.options.length > 0) {
          const validValues = field.options.map((o) => o.value);
          if (!validValues.includes(value)) {
            errors.push(`"${field.label}" has an invalid selection`);
          }
        }
        break;
      }
      case "multiselect": {
        if (!Array.isArray(value)) {
          errors.push(`"${field.label}" must be an array of selections`);
        } else if (field.options && field.options.length > 0) {
          const validValues = field.options.map((o) => o.value);
          for (const v of value) {
            if (!validValues.includes(v as string)) {
              errors.push(`"${field.label}" contains an invalid selection`);
              break;
            }
          }
        }
        break;
      }
      case "checkbox": {
        if (typeof value !== "boolean") {
          errors.push(`"${field.label}" must be true or false`);
        }
        break;
      }
      case "date": {
        if (typeof value !== "string" || isNaN(Date.parse(value))) {
          errors.push(`"${field.label}" must be a valid date`);
        }
        break;
      }
    }
  }

  return errors;
}

// ============================================================================
// ENTITY DATA MAPPING (fixes hardcoded mapper bug)
// ============================================================================

/**
 * Build entity data from submission using entityFieldMapping from schema fields.
 * This replaces the old mapSubmissionToProject / mapSubmissionToModelInventory
 * which used hardcoded keys like `data["project.project_title"]`.
 */
function buildEntityDataFromSubmission(
  submissionData: Record<string, unknown>,
  formSchema: IIntakeFormSchema
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of formSchema.fields) {
    if (field.entityFieldMapping && submissionData[field.id] !== undefined) {
      result[field.entityFieldMapping] = submissionData[field.id];
    }
  }
  return result;
}

// ============================================================================
// INTAKE FORM CONTROLLERS (Admin - Authenticated)
// ============================================================================

/**
 * Get all intake forms for the tenant
 */
export async function getAllIntakeForms(req: Request, res: Response) {
  logProcessing({
    description: "starting getAllIntakeForms",
    functionName: "getAllIntakeForms",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const forms = await getAllIntakeFormsQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](forms));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve intake forms",
      functionName: "getAllIntakeForms",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get intake form by ID
 */
export async function getIntakeFormById(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid form ID"));
  }

  logProcessing({
    description: `fetching intake form by id: ${formId}`,
    functionName: "getIntakeFormById",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const form = await getIntakeFormByIdQuery(formId, req.organizationId!);

    if (!form) {
      return res.status(404).json(STATUS_CODE[404]("Intake form not found"));
    }

    return res.status(200).json(STATUS_CODE[200](form));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `failed to retrieve intake form: ${formId}`,
      functionName: "getIntakeFormById",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Create new intake form
 */
export async function createIntakeForm(req: Request, res: Response) {
  logProcessing({
    description: "creating new intake form",
    functionName: "createIntakeForm",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const {
      name, description, slug, entityType, schema, submitButtonText,
      status, ttlExpiresAt, recipients, riskTierSystem, riskAssessmentConfig,
      llmKeyId, suggestedQuestionsEnabled, designSettings,
    } = req.body;

    if (!name || !entityType) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Name and entity type are required"));
    }

    if (!Object.values(IntakeEntityType).includes(entityType)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid entity type"));
    }

    if (status && !Object.values(IntakeFormStatus).includes(status)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid form status"));
    }

    const form = await createIntakeFormQuery(
      {
        name,
        description,
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
      transaction
    );

    await transaction.commit();

    await logSuccess({
      eventType: "Create",
      description: `intake form created: ${form.id}`,
      functionName: "createIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(201).json(STATUS_CODE[201](form));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Create",
      description: "failed to create intake form",
      functionName: "createIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Update intake form
 */
export async function updateIntakeForm(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid form ID"));
  }

  logProcessing({
    description: `updating intake form: ${formId}`,
    functionName: "updateIntakeForm",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const existingForm = await getIntakeFormByIdQuery(formId, req.organizationId!);

    if (!existingForm) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Intake form not found"));
    }

    const {
      name, description, slug, entityType, schema, submitButtonText,
      status, ttlExpiresAt, recipients, riskTierSystem, riskAssessmentConfig,
      llmKeyId, suggestedQuestionsEnabled, designSettings,
    } = req.body;

    if (status && !Object.values(IntakeFormStatus).includes(status)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid form status"));
    }

    if (entityType && !Object.values(IntakeEntityType).includes(entityType)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid entity type"));
    }

    const form = await updateIntakeFormQuery(
      formId,
      {
        name,
        description,
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
      transaction
    );

    await transaction.commit();

    await logSuccess({
      eventType: "Update",
      description: `intake form updated: ${formId}`,
      functionName: "updateIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](form));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `failed to update intake form: ${formId}`,
      functionName: "updateIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Delete intake form (only drafts)
 */
export async function deleteIntakeForm(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid form ID"));
  }

  logProcessing({
    description: `deleting intake form: ${formId}`,
    functionName: "deleteIntakeForm",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const existingForm = await getIntakeFormByIdQuery(formId, req.organizationId!);

    if (!existingForm) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Intake form not found"));
    }

    if (existingForm.status === IntakeFormStatus.ACTIVE) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Active forms cannot be deleted. Archive the form first."));
    }

    await deleteIntakeFormQuery(formId, req.organizationId!, transaction);
    await transaction.commit();

    await logSuccess({
      eventType: "Delete",
      description: `intake form deleted: ${formId}`,
      functionName: "deleteIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200]({ message: "Form deleted successfully" }));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `failed to delete intake form: ${formId}`,
      functionName: "deleteIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Archive intake form
 */
export async function archiveIntakeForm(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid form ID"));
  }

  logProcessing({
    description: `archiving intake form: ${formId}`,
    functionName: "archiveIntakeForm",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const existingForm = await getIntakeFormByIdQuery(formId, req.organizationId!);

    if (!existingForm) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Intake form not found"));
    }

    const form = await archiveIntakeFormQuery(formId, req.organizationId!, transaction);
    await transaction.commit();

    await logSuccess({
      eventType: "Update",
      description: `intake form archived: ${formId}`,
      functionName: "archiveIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](form));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `failed to archive intake form: ${formId}`,
      functionName: "archiveIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// SUBMISSION CONTROLLERS (Admin - Authenticated)
// ============================================================================

/**
 * Get all pending submissions (dashboard)
 */
export async function getPendingSubmissions(req: Request, res: Response) {
  logProcessing({
    description: "fetching pending submissions",
    functionName: "getPendingSubmissions",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const status = req.query.status as IntakeSubmissionStatus | undefined;
    const submissions = await getPendingSubmissionsQuery(req.organizationId!, status);
    return res.status(200).json(STATUS_CODE[200](submissions));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve pending submissions",
      functionName: "getPendingSubmissions",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get submissions for a specific form
 */
export async function getFormSubmissions(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid form ID"));
  }
  const status = req.query.status as IntakeSubmissionStatus | undefined;

  logProcessing({
    description: `fetching submissions for form: ${formId}`,
    functionName: "getFormSubmissions",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const submissions = await getSubmissionsByFormIdQuery(formId, req.organizationId!, status);
    return res.status(200).json(STATUS_CODE[200](submissions));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `failed to retrieve submissions for form: ${formId}`,
      functionName: "getFormSubmissions",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get submission by ID
 */
export async function getSubmissionById(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid submission ID"));
  }

  logProcessing({
    description: `fetching submission: ${submissionId}`,
    functionName: "getSubmissionById",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!);

    if (!submission) {
      return res.status(404).json(STATUS_CODE[404]("Submission not found"));
    }

    return res.status(200).json(STATUS_CODE[200](submission));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `failed to retrieve submission: ${submissionId}`,
      functionName: "getSubmissionById",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get submission stats (dashboard)
 */
export async function getSubmissionStats(req: Request, res: Response) {
  logProcessing({
    description: "fetching submission stats",
    functionName: "getSubmissionStats",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const stats = await getSubmissionStatsQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](stats));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve submission stats",
      functionName: "getSubmissionStats",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get submission preview for approval flow
 */
export async function getSubmissionPreview(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid submission ID"));
  }

  try {
    const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!);
    if (!submission) {
      return res.status(404).json(STATUS_CODE[404]("Submission not found"));
    }

    const form = await getIntakeFormByIdQuery(submission.formId, req.organizationId!);
    if (!form) {
      return res.status(404).json(STATUS_CODE[404]("Form not found"));
    }

    // Build entity preview from submission data using field mappings
    const entityData = buildEntityDataFromSubmission(
      submission.data as Record<string, unknown>,
      form.schema
    );

    return res.status(200).json(STATUS_CODE[200]({
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
    }));
  } catch (error) {
    logger.error("Error in getSubmissionPreview:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get the original intake submission for a given entity (project/model).
 * Returns the full submission data with form schema so the frontend
 * can render all fields with labels, including unmapped ones.
 * GET /intake/submissions/by-entity/:entityType/:entityId
 */
export async function getSubmissionByEntity(req: Request, res: Response) {
  const entityType = paramStr(req.params.entityType);
  const entityId = parseId(req.params.entityId);

  if (!entityType || isNaN(entityId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid entity type or ID"));
  }

  const validEntityTypes = ["use_case", "model"];
  if (!validEntityTypes.includes(entityType)) {
    return res.status(400).json(STATUS_CODE[400]("Unsupported entity type"));
  }

  logProcessing({
    description: `fetching submission for ${entityType}:${entityId}`,
    functionName: "getSubmissionByEntity",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const result = await getSubmissionByEntityQuery(
      entityType,
      entityId,
      req.organizationId!
    );

    if (!result) {
      return res.status(404).json(STATUS_CODE[404]("No intake submission found for this entity"));
    }

    const { submission, formName, formSchema } = result;
    const submissionData = submission.data as Record<string, unknown>;

    // Build a structured fields array using the form schema for labels/types
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

    return res.status(200).json(STATUS_CODE[200]({
      submissionId: submission.id,
      formName,
      submitterName: submission.submitterName,
      submitterEmail: submission.submitterEmail,
      submittedAt: submission.createdAt,
      reviewedAt: submission.reviewedAt,
      riskTier: submission.riskTier,
      fields,
    }));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `failed to fetch submission for ${entityType}:${entityId}`,
      functionName: "getSubmissionByEntity",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Override submission risk assessment
 */
export async function overrideSubmissionRisk(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid submission ID"));
  }

  try {
    const { tier, dimensionOverrides, justification } = req.body;

    if (!tier || !justification) {
      return res.status(400).json(STATUS_CODE[400]("Tier and justification are required"));
    }

    const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!);
    if (!submission) {
      return res.status(404).json(STATUS_CODE[404]("Submission not found"));
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
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200]({ message: "Risk override applied", override }));
  } catch (error) {
    logger.error("Error in overrideSubmissionRisk:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Approve submission — now accepts optional confirmedEntityData and riskOverride
 */
export async function approveSubmission(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid submission ID"));
  }

  logProcessing({
    description: `approving submission: ${submissionId}`,
    functionName: "approveSubmission",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!, transaction, true);

    if (!submission) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Submission not found"));
    }

    if (submission.status !== IntakeSubmissionStatus.PENDING) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Only pending submissions can be approved"));
    }

    const form = await getIntakeFormByIdQuery(submission.formId, req.organizationId!);
    if (!form) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](
        "The form associated with this submission no longer exists. Cannot create entity."
      ));
    }
    const formName = form.name;

    // Use confirmed entity data from admin if provided, otherwise build from mapping
    const { confirmedEntityData, riskOverride } = req.body;
    const entityData = confirmedEntityData ||
      buildEntityDataFromSubmission(submission.data as Record<string, unknown>, form.schema);

    // Apply risk override if provided
    if (riskOverride && riskOverride.tier && riskOverride.justification) {
      await updateSubmissionRiskOverrideQuery(
        submissionId,
        {
          ...riskOverride,
          overriddenBy: req.userId!,
          overriddenAt: new Date().toISOString(),
        },
        req.organizationId!,
        transaction
      );
    }

    // Create the entity based on entity type
    let entityId: number;

    if (submission.entityType === IntakeEntityType.MODEL) {
      const model = ModelInventoryModel.createNewModelInventory({
        provider: (entityData.provider as string) || "",
        model: (entityData.name as string) || (entityData.model as string) || "",
        version: (entityData.modelVersion as string) || (entityData.version as string) || "",
        approver: entityData.approver ? Number(entityData.approver) : undefined,
        capabilities: (entityData.capabilities as string) || (entityData.intendedUse as string) || "",
        security_assessment: (entityData.security_assessment as boolean) || false,
        reference_link: (entityData.reference_link as string) || "",
        biases: (entityData.biases as string) || "",
        limitations: (entityData.limitations as string) || "",
        hosting_provider: (entityData.hosting_provider as string) || (entityData.modelType as string) || "",
        status: ModelInventoryStatus.PENDING,
      });

      const createdModel = await createNewModelInventoryQuery(
        model,
        req.organizationId!,
        [],
        [],
        transaction
      );
      entityId = createdModel.id!;
    } else if (submission.entityType === IntakeEntityType.USE_CASE) {
      const createdProject = await createNewProjectQuery(
        {
          project_title: (entityData.project_title as string) || "",
          description: (entityData.description as string) || "",
          start_date: entityData.start_date ? new Date(entityData.start_date as string) : new Date(),
          goal: (entityData.goal as string) || (entityData.description as string) || "",
          owner: req.userId!,
          ai_risk_classification: mapToAiRiskClassification(entityData.ai_risk_classification as string) as any,
          type_of_high_risk_role: (entityData.type_of_high_risk_role as string as any) || undefined,
          geography: entityData.geography ? Number(entityData.geography) : 1,
          status: ProjectStatus.UNDER_REVIEW,
        },
        [],
        [],
        req.organizationId!,
        req.userId!,
        transaction
      );
      entityId = createdProject.id!;
    } else {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Unsupported entity type"));
    }

    const updatedSubmission = await approveSubmissionQuery(
      submissionId,
      entityId,
      req.userId!,
      req.organizationId!,
      transaction
    );

    await transaction.commit();

    if (submission.submitterEmail) {
      sendSubmissionApprovedEmail(
        submission.submitterEmail,
        submission.submitterName || "Submitter",
        formName,
        submissionId,
        submission.entityType
      ).catch((err) => logger.error("Failed to send approval email:", err));
    }

    await logSuccess({
      eventType: "Update",
      description: `submission approved: ${submissionId}, entity created: ${entityId}`,
      functionName: "approveSubmission",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](updatedSubmission));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `failed to approve submission: ${submissionId}`,
      functionName: "approveSubmission",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Reject submission
 */
export async function rejectSubmission(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid submission ID"));
  }

  logProcessing({
    description: `rejecting submission: ${submissionId}`,
    functionName: "rejectSubmission",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const rejectionReason = req.body.rejectionReason || req.body.reason;

    if (!rejectionReason || !rejectionReason.trim()) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Rejection reason is required"));
    }

    const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!, transaction, true);

    if (!submission) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Submission not found"));
    }

    if (submission.status !== IntakeSubmissionStatus.PENDING) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Only pending submissions can be rejected"));
    }

    // Fetch form and tenant info before commit so email data is available atomically
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
      transaction
    );

    await transaction.commit();

    if (submission.submitterEmail) {
      // Generate HMAC-signed resubmission token
      const resubmissionToken = createSignedToken({
        submissionId: submission.id,
        formId: submission.formId,
        email: submission.submitterEmail,
        timestamp: Date.now(),
      });

      // Use new URL format if publicId available, fall back to old format
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
          formSlug
        ).catch((err) => logger.error("Failed to send rejection email:", err));
      } else {
        logger.warn(`Could not send rejection email for submission #${submissionId}: missing routing info`);
      }
    }

    await logSuccess({
      eventType: "Update",
      description: `submission rejected: ${submissionId}`,
      functionName: "rejectSubmission",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](updatedSubmission));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `failed to reject submission: ${submissionId}`,
      functionName: "rejectSubmission",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// LLM FEATURE CONTROLLERS (Admin - Authenticated)
// ============================================================================

/**
 * Get LLM-suggested questions
 */
export async function getLLMSuggestedQuestions(req: Request, res: Response) {
  try {
    const { entityType, context, llmKeyId } = req.body;

    if (!llmKeyId) {
      return res.status(400).json(STATUS_CODE[400]("LLM key ID is required"));
    }

    const questions = await generateSuggestedQuestions(
      entityType || "use_case",
      context || "",
      llmKeyId,
      req.organizationId!
    );

    if (!questions) {
      return res.status(500).json(STATUS_CODE[500]("Failed to generate questions"));
    }

    return res.status(200).json(STATUS_CODE[200](questions));
  } catch (error) {
    logger.error("Error in getLLMSuggestedQuestions:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Generate field guidance text
 */
export async function getFieldGuidance(req: Request, res: Response) {
  try {
    const { fieldLabel, entityType, llmKeyId } = req.body;

    if (!fieldLabel || !llmKeyId) {
      return res.status(400).json(STATUS_CODE[400]("Field label and LLM key ID are required"));
    }

    const guidanceText = await generateFieldGuidance(
      fieldLabel,
      entityType || "use_case",
      llmKeyId,
      req.organizationId!
    );

    if (!guidanceText) {
      return res.status(500).json(STATUS_CODE[500]("Failed to generate guidance"));
    }

    return res.status(200).json(STATUS_CODE[200]({ guidanceText }));
  } catch (error) {
    logger.error("Error in getFieldGuidance:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// PUBLIC CONTROLLERS (Unauthenticated)
// ============================================================================

/**
 * Preview form by ID (authenticated - admin only)
 */
export async function previewForm(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid form ID"));
  }

  try {
    const form = await getIntakeFormByIdQuery(formId, req.organizationId!);

    if (!form) {
      return res.status(404).json(STATUS_CODE[404]("Form not found"));
    }

    return res.status(200).json(STATUS_CODE[200]({
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
    }));
  } catch (error) {
    logger.error("Error in previewForm:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get public form by public ID (new URL format, unauthenticated)
 */
export async function getPublicFormByPublicId(req: Request, res: Response) {
  const publicId = paramStr(req.params.publicId);
  const resubmissionToken = req.query.token as string | undefined;

  try {
    // Resolve tenant from publicId
    const tenantInfo = await getTenantByPublicId(publicId);
    if (!tenantInfo) {
      return res.status(404).json(STATUS_CODE[404]("Form not found"));
    }

    const form = await getFormByPublicIdQuery(publicId, tenantInfo.orgId);
    if (!form) {
      return res.status(404).json(STATUS_CODE[404]("Form not found or not available"));
    }

    // Fetch org logo (non-blocking — null if missing)
    let organizationLogo: string | null = null;
    try {
      const logoRow = await getCompanyLogoQuery(tenantInfo.orgId);
      if (logoRow && (logoRow as any).content) {
        const buf = Buffer.isBuffer((logoRow as any).content)
          ? (logoRow as any).content
          : Buffer.from((logoRow as any).content);
        const mimeType = (logoRow as any).type || "image/png";
        organizationLogo = `data:${mimeType};base64,${buf.toString("base64")}`;
      }
    } catch {
      // Logo is optional — swallow errors silently
    }

    // Check for resubmission token
    let previousData: Record<string, unknown> | undefined;
    let previousSubmitterName: string | undefined;
    let previousSubmitterEmail: string | undefined;
    if (resubmissionToken) {
      const decoded = verifySignedToken<{
        submissionId: number;
        formId: number;
        email: string;
        timestamp: number;
      }>(resubmissionToken);

      if (decoded && decoded.submissionId && decoded.formId === form.id) {
        // Check token expiry (7 days)
        const tokenAge = Date.now() - (decoded.timestamp || 0);
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (tokenAge <= SEVEN_DAYS_MS) {
          const previousSubmission = await getSubmissionByIdQuery(decoded.submissionId, tenantInfo.orgId);
          if (
            previousSubmission &&
            previousSubmission.status !== IntakeSubmissionStatus.APPROVED &&
            previousSubmission.submitterEmail === decoded.email
          ) {
            previousData = previousSubmission.data as Record<string, unknown>;
            previousSubmitterName = previousSubmission.submitterName ?? undefined;
            previousSubmitterEmail = previousSubmission.submitterEmail ?? undefined;
          }
        }
      }
    }

    return res.status(200).json(STATUS_CODE[200]({
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
      previousData,
      previousSubmitterName,
      previousSubmitterEmail,
    }));
  } catch (error) {
    logger.error(`Error in getPublicFormByPublicId: ${publicId}`, error);
    return res.status(500).json(STATUS_CODE[500]("An error occurred while loading the form. Please try again."));
  }
}

/**
 * Submit public form by public ID (new URL format, unauthenticated)
 */
export async function submitPublicFormByPublicId(req: Request, res: Response) {
  const publicId = paramStr(req.params.publicId);

  try {
    const tenantInfo = await getTenantByPublicId(publicId);
    if (!tenantInfo) {
      return res.status(404).json(STATUS_CODE[404]("Form not found"));
    }

    const clientIp = req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0] || "unknown";
    const withinLimit = await checkRateLimitQuery(clientIp, tenantInfo.orgId);

    if (!withinLimit) {
      return res.status(429).json(STATUS_CODE[429]("Too many submissions. Please try again later."));
    }

    const form = await getFormByPublicIdQuery(publicId, tenantInfo.orgId);
    if (!form) {
      return res.status(404).json(STATUS_CODE[404]("Form not found or not available"));
    }

    const { submitterEmail, submitterName, formData, captchaToken, captchaAnswer, resubmissionToken } = req.body;

    // Validate contact info (always required)
    const fullFormForValidation = await getIntakeFormByIdQuery(form.id, tenantInfo.orgId);

    if (!submitterEmail) {
      return res.status(400).json(STATUS_CODE[400]("Submitter email is required"));
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(submitterEmail)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid email format"));
    }

    if (!formData) {
      return res.status(400).json(STATUS_CODE[400]("Form data is required"));
    }

    if (typeof formData !== "object" || Array.isArray(formData)) {
      return res.status(400).json(STATUS_CODE[400]("Form data must be an object"));
    }

    // Validate form data against schema
    if (fullFormForValidation?.schema) {
      const validationErrors = validateFormData(formData, fullFormForValidation.schema);
      if (validationErrors.length > 0) {
        return res.status(400).json(STATUS_CODE[400]({
          message: "Form validation failed",
          errors: validationErrors,
        }));
      }
    }

    // Validate CAPTCHA
    if (!captchaToken || captchaAnswer === undefined) {
      return res.status(400).json(STATUS_CODE[400]("CAPTCHA verification required"));
    }

    const captchaPayload = verifySignedToken<{ answer: number; timestamp: number }>(captchaToken);
    if (!captchaPayload) {
      return res.status(400).json(STATUS_CODE[400]("Invalid CAPTCHA token"));
    }

    const tokenAge = Date.now() - captchaPayload.timestamp;
    if (tokenAge > 5 * 60 * 1000) {
      return res.status(400).json(STATUS_CODE[400]("CAPTCHA expired. Please refresh and try again."));
    }

    if (Number(captchaPayload.answer) !== Number(captchaAnswer)) {
      return res.status(400).json(STATUS_CODE[400]("Incorrect CAPTCHA answer"));
    }

    const resolvedEmail = submitterEmail;
    const resolvedName = submitterName || (submitterEmail ? submitterEmail.split("@")[0] : null);

    // Handle resubmission (7-day expiry on resubmission tokens)
    let originalSubmissionId: number | undefined;
    if (resubmissionToken && resolvedEmail) {
      const decoded = verifySignedToken<{
        submissionId: number;
        formId: number;
        email: string;
        timestamp: number;
      }>(resubmissionToken);

      if (decoded && decoded.submissionId) {
        const tokenAge = Date.now() - (decoded.timestamp || 0);
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (tokenAge > SEVEN_DAYS_MS) {
          return res.status(400).json(STATUS_CODE[400]("Resubmission link has expired. Please request a new one."));
        }
        if (decoded.email !== resolvedEmail) {
          return res.status(400).json(STATUS_CODE[400]("Email does not match the original submission."));
        }
        originalSubmissionId = decoded.submissionId;
      }
    }

    const transaction = await sequelize.transaction();

    try {
      const submission = await createSubmissionQuery(
        {
          formId: form.id,
          submitterEmail: resolvedEmail,
          submitterName: resolvedName,
          data: formData,
          entityType: form.entityType,
          originalSubmissionId,
          ipAddress: clientIp,
        },
        tenantInfo.orgId,
        transaction
      );

      await transaction.commit();

      // Generate resubmission token only if email is present
      let newResubmissionToken: string | undefined;
      if (resolvedEmail) {
        newResubmissionToken = createSignedToken({
          submissionId: submission.id,
          formId: form.id,
          email: resolvedEmail,
          timestamp: Date.now(),
        });
      }

      const submissionName = resolvedName || "Anonymous";

      // Send confirmation email to submitter (only if email present)
      if (resolvedEmail) {
        sendSubmissionReceivedEmail(
          resolvedEmail,
          submissionName,
          form.name,
          submission.id,
          newResubmissionToken || "",
          publicId
        ).catch((err) => logger.error("Failed to send submission received email:", err));
      }

      // Get full form with recipients to send notifications
      const fullForm = await getIntakeFormByIdQuery(form.id, tenantInfo.orgId);
      const recipientIds = (fullForm?.recipients as number[]) || [];

      if (recipientIds.length > 0) {
        sendNewSubmissionAdminNotification(
          recipientIds,
          form.name,
          submissionName,
          resolvedEmail || "No email provided",
          submission.id,
          form.entityType
        ).catch((err) => logger.error("Failed to send admin notification:", err));
      } else {
        logger.warn(`No recipients configured for form ${form.id}, skipping admin notification`);
      }

      // Trigger async risk scoring
      if (fullForm) {
        calculateSubmissionRisk(
          formData,
          fullForm.schema,
          fullForm.riskTierSystem || "eu_ai_act",
          fullForm.llmKeyId,
          tenantInfo.orgId
        )
          .then((result) =>
            updateSubmissionRiskQuery(submission.id, result, tenantInfo.orgId)
          )
          .catch((err) => logger.error("Risk scoring failed:", err));
      }

      return res.status(201).json(STATUS_CODE[201]({
        message: resolvedEmail
          ? "Form submitted successfully. You will receive an email when your submission is reviewed."
          : "Form submitted successfully.",
        submissionId: submission.id,
        resubmissionToken: newResubmissionToken,
      }));
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    logger.error(`Error in submitPublicFormByPublicId: ${publicId}`, error);
    return res.status(500).json(STATUS_CODE[500]("An error occurred while submitting the form. Please try again."));
  }
}

/**
 * Get public form by slug (legacy URL format, unauthenticated)
 */
export async function getPublicForm(req: Request, res: Response) {
  const tenantSlug = paramStr(req.params.tenantSlug);
  const formSlug = paramStr(req.params.formSlug);
  const resubmissionToken = req.query.token as string | undefined;

  try {
    const tenantInfo = await getTenantHashBySlug(tenantSlug);

    if (!tenantInfo) {
      return res.status(404).json(STATUS_CODE[404]("Organization not found"));
    }

    const form = await getActivePublicFormQuery(formSlug, tenantInfo.id);

    if (!form) {
      return res.status(404).json(STATUS_CODE[404]("Form not found or not available"));
    }

    // Fetch org logo (non-blocking — null if missing)
    let organizationLogo: string | null = null;
    try {
      const logoRow = await getCompanyLogoQuery(tenantInfo.id);
      if (logoRow && (logoRow as any).content) {
        const buf = Buffer.isBuffer((logoRow as any).content)
          ? (logoRow as any).content
          : Buffer.from((logoRow as any).content);
        const mimeType = (logoRow as any).type || "image/png";
        organizationLogo = `data:${mimeType};base64,${buf.toString("base64")}`;
      }
    } catch {
      // Logo is optional — swallow errors silently
    }

    let previousData: Record<string, unknown> | undefined;
    let previousSubmitterName: string | undefined;
    let previousSubmitterEmail: string | undefined;
    if (resubmissionToken) {
      const decoded = verifySignedToken<{
        submissionId: number;
        formId: number;
        email: string;
        timestamp: number;
      }>(resubmissionToken);

      if (decoded && decoded.submissionId && decoded.formId === form.id) {
        // Check token expiry (7 days)
        const tokenAge = Date.now() - (decoded.timestamp || 0);
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (tokenAge <= SEVEN_DAYS_MS) {
          const previousSubmission = await getSubmissionByIdQuery(decoded.submissionId, tenantInfo.id);
          if (
            previousSubmission &&
            previousSubmission.status !== IntakeSubmissionStatus.APPROVED &&
            previousSubmission.submitterEmail === decoded.email
          ) {
            previousData = previousSubmission.data as Record<string, unknown>;
            previousSubmitterName = previousSubmission.submitterName ?? undefined;
            previousSubmitterEmail = previousSubmission.submitterEmail ?? undefined;
          }
        }
      }
    }

    return res.status(200).json(STATUS_CODE[200]({
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
      previousData,
      previousSubmitterName,
      previousSubmitterEmail,
    }));
  } catch (error) {
    logger.error(`Error in getPublicForm: ${tenantSlug}/${formSlug}`, error);
    return res.status(500).json(STATUS_CODE[500]("An error occurred while loading the form. Please try again."));
  }
}

/**
 * Submit public form (legacy URL format, unauthenticated)
 */
export async function submitPublicForm(req: Request, res: Response) {
  const tenantSlug = paramStr(req.params.tenantSlug);
  const formSlug = paramStr(req.params.formSlug);

  try {
    const tenantInfo = await getTenantHashBySlug(tenantSlug);

    if (!tenantInfo) {
      return res.status(404).json(STATUS_CODE[404]("Organization not found"));
    }

    const clientIp = req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0] || "unknown";
    const withinLimit = await checkRateLimitQuery(clientIp, tenantInfo.id);

    if (!withinLimit) {
      return res.status(429).json(STATUS_CODE[429]("Too many submissions. Please try again later."));
    }

    const form = await getActivePublicFormQuery(formSlug, tenantInfo.id);

    if (!form) {
      return res.status(404).json(STATUS_CODE[404]("Form not found or not available"));
    }

    const { submitterEmail, submitterName, formData, captchaToken, captchaAnswer, resubmissionToken } = req.body;

    // Validate contact info (always required)
    const fullFormForValidation = await getIntakeFormByIdQuery(form.id, tenantInfo.id);

    if (!submitterEmail) {
      return res.status(400).json(STATUS_CODE[400]("Submitter email is required"));
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(submitterEmail)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid email format"));
    }

    if (!formData) {
      return res.status(400).json(STATUS_CODE[400]("Form data is required"));
    }

    if (typeof formData !== "object" || Array.isArray(formData)) {
      return res.status(400).json(STATUS_CODE[400]("Form data must be an object"));
    }

    // Validate form data against schema
    if (fullFormForValidation?.schema) {
      const validationErrors = validateFormData(formData, fullFormForValidation.schema);
      if (validationErrors.length > 0) {
        return res.status(400).json(STATUS_CODE[400]({
          message: "Form validation failed",
          errors: validationErrors,
        }));
      }
    }

    if (!captchaToken || captchaAnswer === undefined) {
      return res.status(400).json(STATUS_CODE[400]("CAPTCHA verification required"));
    }

    const captchaPayload = verifySignedToken<{ answer: number; timestamp: number }>(captchaToken);
    if (!captchaPayload) {
      return res.status(400).json(STATUS_CODE[400]("Invalid CAPTCHA token"));
    }

    const tokenAge = Date.now() - captchaPayload.timestamp;
    if (tokenAge > 5 * 60 * 1000) {
      return res.status(400).json(STATUS_CODE[400]("CAPTCHA expired. Please refresh and try again."));
    }

    if (Number(captchaPayload.answer) !== Number(captchaAnswer)) {
      return res.status(400).json(STATUS_CODE[400]("Incorrect CAPTCHA answer"));
    }

    const resolvedEmail = submitterEmail;
    const resolvedName = submitterName || (submitterEmail ? submitterEmail.split("@")[0] : null);

    // Handle resubmission (7-day expiry on resubmission tokens)
    let originalSubmissionId: number | undefined;
    if (resubmissionToken && resolvedEmail) {
      const decoded = verifySignedToken<{
        submissionId: number;
        formId: number;
        email: string;
        timestamp: number;
      }>(resubmissionToken);

      if (decoded && decoded.submissionId) {
        const tokenAge = Date.now() - (decoded.timestamp || 0);
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (tokenAge > SEVEN_DAYS_MS) {
          return res.status(400).json(STATUS_CODE[400]("Resubmission link has expired. Please request a new one."));
        }
        if (decoded.email !== resolvedEmail) {
          return res.status(400).json(STATUS_CODE[400]("Email does not match the original submission."));
        }
        originalSubmissionId = decoded.submissionId;
      }
    }

    const transaction = await sequelize.transaction();

    try {
      const submission = await createSubmissionQuery(
        {
          formId: form.id,
          submitterEmail: resolvedEmail,
          submitterName: resolvedName,
          data: formData,
          entityType: form.entityType,
          originalSubmissionId,
          ipAddress: clientIp,
        },
        tenantInfo.id,
        transaction
      );

      await transaction.commit();

      // Generate resubmission token only if email is present
      let newResubmissionToken: string | undefined;
      if (resolvedEmail) {
        newResubmissionToken = createSignedToken({
          submissionId: submission.id,
          formId: form.id,
          email: resolvedEmail,
          timestamp: Date.now(),
        });
      }

      const submissionName = resolvedName || "Anonymous";

      // Use publicId for emails if available
      const formPublicId = form.publicId;

      // Send confirmation email to submitter (only if email present)
      if (resolvedEmail) {
        sendSubmissionReceivedEmail(
          resolvedEmail,
          submissionName,
          form.name,
          submission.id,
          newResubmissionToken || "",
          formPublicId || "",
          tenantSlug,
          formSlug
        ).catch((err) => logger.error("Failed to send submission received email:", err));
      }

      // Use per-form recipients
      const fullForm = await getIntakeFormByIdQuery(form.id, tenantInfo.id);
      const recipientIds = (fullForm?.recipients as number[]) || [];

      if (recipientIds.length > 0) {
        sendNewSubmissionAdminNotification(
          recipientIds,
          form.name,
          submissionName,
          resolvedEmail || "No email provided",
          submission.id,
          form.entityType
        ).catch((err) => logger.error("Failed to send admin notification:", err));
      } else {
        // Fallback to org admins
        sendNewSubmissionAdminNotification(
          tenantInfo.id,
          form.name,
          submissionName,
          resolvedEmail || "No email provided",
          submission.id,
          form.entityType
        ).catch((err) => logger.error("Failed to send admin notification:", err));
      }

      // Trigger async risk scoring
      if (fullForm) {
        calculateSubmissionRisk(
          formData,
          fullForm.schema,
          fullForm.riskTierSystem || "eu_ai_act",
          fullForm.llmKeyId,
          tenantInfo.id
        )
          .then((result) =>
            updateSubmissionRiskQuery(submission.id, result, tenantInfo.id)
          )
          .catch((err) => logger.error("Risk scoring failed:", err));
      }

      return res.status(201).json(STATUS_CODE[201]({
        message: resolvedEmail
          ? "Form submitted successfully. You will receive an email when your submission is reviewed."
          : "Form submitted successfully.",
        submissionId: submission.id,
        resubmissionToken: newResubmissionToken,
      }));
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    logger.error(`Error in submitPublicForm: ${tenantSlug}/${formSlug}`, error);
    return res.status(500).json(STATUS_CODE[500]("An error occurred while submitting the form. Please try again."));
  }
}

/**
 * Get CAPTCHA question (unauthenticated)
 */
export async function getCaptcha(_req: Request, res: Response) {
  const num1 = Math.floor(Math.random() * 10) + 1;
  const num2 = Math.floor(Math.random() * 10) + 1;
  const operators = ["+", "-"] as const;
  const operator = operators[Math.floor(Math.random() * operators.length)];

  let answer: number;
  let question: string;

  if (operator === "+") {
    answer = num1 + num2;
    question = `${num1} + ${num2}`;
  } else {
    const larger = Math.max(num1, num2);
    const smaller = Math.min(num1, num2);
    answer = larger - smaller;
    question = `${larger} - ${smaller}`;
  }

  const token = createSignedToken({ answer, timestamp: Date.now() });

  return res.status(200).json(STATUS_CODE[200]({ question, token }));
}
