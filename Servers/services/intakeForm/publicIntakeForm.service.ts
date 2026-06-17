/**
 * Shared logic for public (unauthenticated) intake-form GET / POST endpoints.
 *
 * Both the new public-id URL (`/forms/:publicId`) and the legacy slug URL
 * (`/forms/:tenantSlug/:formSlug`) ultimately need the same things:
 *   1. resolve an organization + form
 *   2. optionally pre-fill from a resubmission token
 *   3. fetch + base64-encode the organization logo
 *   4. validate inputs and create a submission
 *   5. fan out email + risk-scoring
 *
 * This module hosts the shared pieces so the two HTTP entry points stay thin.
 */

import { Transaction } from "sequelize";
import logger from "../../utils/logger/fileLogger";
import {
  createSubmissionQuery,
  getIntakeFormByIdQuery,
  getSubmissionByIdQuery,
  updateSubmissionRiskQuery,
} from "../../utils/intakeForm.utils";
import { getCompanyLogoQuery } from "../../utils/aiTrustCentre.utils";
import {
  createSignedToken,
  validateCaptcha,
  validateResubmissionToken,
  verifySignedToken,
  SEVEN_DAYS_MS,
} from "./intakeFormToken.service";
import {
  isValidEmail,
  validateFormData,
} from "../../utils/intakeForm/intakeFormValidation.utils";
import { sendSubmissionReceivedEmail, sendNewSubmissionAdminNotification } from "../intakeFormEmail.service";
import { calculateSubmissionRisk } from "../intakeRiskScoring.service";
import { IntakeSubmissionStatus } from "../../domain.layer/enums/intake-submission-status.enum";
import { IntakeEntityType } from "../../domain.layer/enums/intake-entity-type.enum";

/**
 * Fetch the organization's logo and return a base64 data: URL,
 * or null if no logo is set. Errors are swallowed so a missing logo
 * never blocks a public form load.
 */
export async function buildOrganizationLogoDataUrl(orgId: number): Promise<string | null> {
  try {
    const logoRow = await getCompanyLogoQuery(orgId);
    if (!logoRow || !(logoRow as any).content) return null;
    const buf = Buffer.isBuffer((logoRow as any).content)
      ? (logoRow as any).content
      : Buffer.from((logoRow as any).content);
    const mimeType = (logoRow as any).type || "image/png";
    return `data:${mimeType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export interface ResubmissionPrefill {
  previousData?: Record<string, unknown>;
  previousSubmitterName?: string;
  previousSubmitterEmail?: string;
}

/**
 * If a valid 7-day-old token is present, fetch the prior submission's data
 * so the form can pre-fill — only when the submission is not yet approved
 * and the email matches.
 */
export async function resolveResubmissionPrefill(
  resubmissionToken: string | undefined,
  formId: number,
  orgId: number,
): Promise<ResubmissionPrefill> {
  if (!resubmissionToken) return {};

  const decoded = verifySignedToken<{
    submissionId: number;
    formId: number;
    email: string;
    timestamp: number;
  }>(resubmissionToken);

  if (!decoded || !decoded.submissionId || decoded.formId !== formId) return {};

  const tokenAge = Date.now() - (decoded.timestamp || 0);
  if (tokenAge > SEVEN_DAYS_MS) return {};

  const previousSubmission = await getSubmissionByIdQuery(decoded.submissionId, orgId);
  if (
    !previousSubmission ||
    previousSubmission.status === IntakeSubmissionStatus.APPROVED ||
    previousSubmission.submitterEmail !== decoded.email
  ) {
    return {};
  }

  return {
    previousData: previousSubmission.data as Record<string, unknown>,
    previousSubmitterName: previousSubmission.submitterName ?? undefined,
    previousSubmitterEmail: previousSubmission.submitterEmail ?? undefined,
  };
}

export interface SubmitInput {
  submitterEmail: unknown;
  submitterName: unknown;
  formData: unknown;
  captchaToken: unknown;
  captchaAnswer: unknown;
  resubmissionToken?: string;
}

export type ValidationError =
  | "submitter_email_required"
  | "invalid_email"
  | "form_data_required"
  | "form_data_not_object"
  | "captcha_missing"
  | "captcha_invalid"
  | "captcha_expired"
  | "captcha_wrong"
  | "resubmission_expired"
  | "resubmission_email_mismatch";

export type SubmissionValidationResult =
  | {
      ok: true;
      resolvedEmail: string;
      resolvedName: string | null;
      formData: Record<string, unknown>;
      originalSubmissionId?: number;
    }
  | { ok: false; error: ValidationError; formErrors?: string[] };

/**
 * Validate every input required by a public form submission. Caller is
 * responsible for mapping each error tag to a translated HTTP response.
 */
export async function validateSubmissionInput(
  input: SubmitInput,
  formSchema: { schema?: any } | null,
): Promise<SubmissionValidationResult> {
  const { submitterEmail, submitterName, formData, captchaToken, captchaAnswer, resubmissionToken } =
    input;

  if (!submitterEmail) return { ok: false, error: "submitter_email_required" };
  if (!isValidEmail(submitterEmail)) return { ok: false, error: "invalid_email" };

  if (!formData) return { ok: false, error: "form_data_required" };
  if (typeof formData !== "object" || Array.isArray(formData)) {
    return { ok: false, error: "form_data_not_object" };
  }

  const data = formData as Record<string, unknown>;

  if (formSchema?.schema) {
    const formErrors = validateFormData(data, formSchema.schema);
    if (formErrors.length > 0) {
      return { ok: false, error: "form_data_required", formErrors };
    }
  }

  const captcha = validateCaptcha(
    typeof captchaToken === "string" ? captchaToken : undefined,
    captchaAnswer,
  );
  if (!captcha.ok) {
    const map: Record<string, ValidationError> = {
      missing: "captcha_missing",
      invalid: "captcha_invalid",
      expired: "captcha_expired",
      wrong_answer: "captcha_wrong",
    };
    return { ok: false, error: map[captcha.error] };
  }

  const resolvedEmail = submitterEmail as string;
  const resolvedName =
    typeof submitterName === "string" && submitterName.trim() !== ""
      ? submitterName
      : resolvedEmail
        ? resolvedEmail.split("@")[0]
        : null;

  let originalSubmissionId: number | undefined;
  if (resubmissionToken && resolvedEmail) {
    const validation = validateResubmissionToken(resubmissionToken, resolvedEmail);
    if (validation.kind === "expired") return { ok: false, error: "resubmission_expired" };
    if (validation.kind === "email_mismatch") {
      return { ok: false, error: "resubmission_email_mismatch" };
    }
    if (validation.kind === "valid") {
      originalSubmissionId = validation.payload.submissionId;
    }
  }

  return {
    ok: true,
    resolvedEmail,
    resolvedName,
    formData: data,
    originalSubmissionId,
  };
}

export interface CreateSubmissionInput {
  form: {
    id: number;
    name: string;
    entityType: IntakeEntityType;
    publicId?: string | null;
  };
  orgId: number;
  clientIp: string;
  resolvedEmail: string;
  resolvedName: string | null;
  formData: Record<string, unknown>;
  originalSubmissionId?: number;
  lang?: string;
  /** Legacy URL only — when set, emails use the slug variant */
  legacyContext?: { tenantSlug: string; formSlug: string };
  /** When no per-form recipient list — legacy behaviour falls back to org admins */
  legacyFallbackOrgRecipients?: boolean;
  transaction: Transaction;
}

export interface SubmissionResult {
  submissionId: number;
  newResubmissionToken: string | undefined;
}

/**
 * Persist a submission, dispatch the post-commit notifications and trigger
 * async risk scoring. Caller owns the transaction and commits separately.
 */
export async function createPublicSubmission(
  input: CreateSubmissionInput,
): Promise<SubmissionResult> {
  const {
    form,
    orgId,
    clientIp,
    resolvedEmail,
    resolvedName,
    formData,
    originalSubmissionId,
    lang,
    legacyContext,
    legacyFallbackOrgRecipients,
    transaction,
  } = input;

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
    orgId,
    transaction,
  );

  const newResubmissionToken = resolvedEmail
    ? createSignedToken({
        submissionId: submission.id,
        formId: form.id,
        email: resolvedEmail,
        timestamp: Date.now(),
      })
    : undefined;

  const submissionName = resolvedName || "Anonymous";

  if (resolvedEmail) {
    sendSubmissionReceivedEmail(
      resolvedEmail,
      submissionName,
      form.name,
      submission.id,
      newResubmissionToken || "",
      form.publicId || legacyContext?.tenantSlug || "",
      legacyContext?.tenantSlug,
      legacyContext?.formSlug,
      lang,
    ).catch((err) => logger.error("Failed to send submission received email:", err));
  }

  const fullForm = await getIntakeFormByIdQuery(form.id, orgId);
  const recipientIds = (fullForm?.recipients as number[]) || [];

  if (recipientIds.length > 0) {
    sendNewSubmissionAdminNotification(
      recipientIds,
      form.name,
      submissionName,
      resolvedEmail || "No email provided",
      submission.id,
      form.entityType,
      lang,
    ).catch((err) => logger.error("Failed to send admin notification:", err));
  } else if (legacyFallbackOrgRecipients) {
    sendNewSubmissionAdminNotification(
      orgId,
      form.name,
      submissionName,
      resolvedEmail || "No email provided",
      submission.id,
      form.entityType,
      lang,
    ).catch((err) => logger.error("Failed to send admin notification:", err));
  } else {
    logger.warn(`No recipients configured for form ${form.id}, skipping admin notification`);
  }

  if (fullForm) {
    calculateSubmissionRisk(
      formData,
      fullForm.schema,
      fullForm.riskTierSystem || "eu_ai_act",
      fullForm.llmKeyId,
      orgId,
    )
      .then((result) => updateSubmissionRiskQuery(submission.id, result, orgId))
      .catch((err) => logger.error("Risk scoring failed:", err));
  }

  return { submissionId: submission.id, newResubmissionToken };
}
