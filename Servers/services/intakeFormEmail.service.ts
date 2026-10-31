import { notificationService } from "./notificationService";
import { EMAIL_TEMPLATES } from "../constants/emailTemplates";
import { IntakeEntityType } from "../domain.layer/enums/intake-entity-type.enum";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import logger from "../utils/logger/fileLogger";
import {
  getEligibleReviewerIdsQuery,
  getIntakeFormByIdQuery,
  getSubmissionByIdQuery,
  getUsersByIds,
} from "../utils/intakeForm.utils";
import { translate } from "../utils/i18n.utils";
import { escapeHtml } from "../utils/sanitization.utils";

// `lang?: string` on each helper below currently uses the *requester's* locale
// (req.lang). For known recipients we should prefer their stored preference via
// `getPreferencesByUserQuery(recipientUserId).language`. Deferred until the
// recipient-language migration phase.

/**
 * Get entity type display name
 */
function getEntityTypeDisplayName(entityType: IntakeEntityType): string {
  switch (entityType) {
    case IntakeEntityType.MODEL:
      return "Model";
    case IntakeEntityType.USE_CASE:
      return "Use Case";
    default:
      return entityType;
  }
}

/**
 * Get admin users for an organization (fallback when no per-form recipients)
 */
async function getAdminUsersForOrganization(
  organizationId: number,
): Promise<Array<{ id: number; name: string; email: string }>> {
  try {
    const admins = await sequelize.query(
      `SELECT u.id, u.name, u.email
       FROM users u
       JOIN organization_members om ON om.user_id = u.id AND om.organization_id = :organizationId
       JOIN roles r ON om.role_id = r.id
       WHERE r.name = 'Admin'`,
      {
        replacements: { organizationId },
        type: QueryTypes.SELECT,
      },
    );
    return admins as Array<{ id: number; name: string; email: string }>;
  } catch (error) {
    logger.error("Failed to get admin users:", error);
    return [];
  }
}

/**
 * Build the frontend URL for a given path
 */
function buildFrontendUrl(path: string): string {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  return `${baseUrl}${path}`;
}

/**
 * Build resubmit link using new URL format (publicId) or legacy format
 */
function buildResubmitLink(
  resubmissionToken: string,
  publicId?: string,
  tenantSlug?: string,
  formSlug?: string,
): string {
  if (publicId) {
    return buildFrontendUrl(`/${publicId}/use-case-form-intake?token=${resubmissionToken}`);
  }
  if (tenantSlug && formSlug) {
    return buildFrontendUrl(`/intake/${tenantSlug}/${formSlug}?token=${resubmissionToken}`);
  }
  return buildFrontendUrl(`/intake-forms`);
}

/**
 * Send confirmation email to submitter after form submission
 */
export async function sendSubmissionReceivedEmail(
  submitterEmail: string,
  submitterName: string,
  formName: string,
  submissionId: number,
  resubmissionToken: string,
  publicId?: string,
  tenantSlug?: string,
  formSlug?: string,
  lang?: string,
): Promise<void> {
  try {
    const resubmitLink = buildResubmitLink(resubmissionToken, publicId, tenantSlug, formSlug);

    const subject = translate(lang, "Submission received: {formName}", { formName });
    await notificationService.sendEmailWithTemplate(
      submitterEmail,
      subject,
      EMAIL_TEMPLATES.INTAKE_SUBMISSION_RECEIVED,
      {
        submitterName: submitterName || submitterEmail.split("@")[0],
        formName,
        submissionId: String(submissionId),
        resubmitLink,
      },
    );

    logger.info(
      `Submission received email sent to ${submitterEmail} for submission #${submissionId}`,
    );
  } catch (error) {
    logger.error("Failed to send submission received email:", error);
  }
}

/** The initial assessment shown in the new-submission email. */
export interface IntakeNotificationResults {
  /** EU AI Act level from the rules; null when the submission was not rule-checked. */
  level: string | null;
  /** Already worded, e.g. "64 (High)", "at least 70 (rules only)", "No score yet". */
  scoreText: string;
  suggestionCount: number;
  /** The 2-minute wait ran out before both stages finished. */
  capReached: boolean;
}

/**
 * The email's results block as HTML. Every value is escaped; the block goes in
 * through a raw-HTML template key. When the wait ran out, only a note is shown,
 * so no half-finished number reaches the reviewer.
 */
export function renderIntakeResultsHtml(
  results: IntakeNotificationResults | undefined,
  lang?: string,
): string {
  if (!results) return "";
  const t = (key: string, vars?: Record<string, string | number>) =>
    escapeHtml(translate(lang, key, vars));
  const title = `<p class="box-title">${t("Initial assessment")}</p>`;
  if (results.capReached) {
    return `<div class="box box-primary">${title}<p class="box-subtitle">${t(
      "Scoring was still running when this email was sent. Open the submission to see the results.",
    )}</p></div>`;
  }
  const row = (label: string, value: string) =>
    `<p class="box-subtitle" style="margin-bottom: 6px;"><strong>${t(label)}</strong> ${value}</p>`;
  return (
    `<div class="box box-primary">${title}` +
    row(
      "EU AI Act level:",
      results.level ? escapeHtml(translate(lang, results.level)) : t("Not rule-checked"),
    ) +
    row("Risk score:", escapeHtml(results.scoreText)) +
    row("Suggested risks:", escapeHtml(String(results.suggestionCount))) +
    `</div>`
  );
}

/**
 * Send notification email to designated recipients (or org admins as fallback)
 * Accepts either an array of user IDs or an organization ID for fallback.
 * `results` adds the initial assessment; `laneText` (already worded) adds the
 * review lane line. Without them the email is unchanged.
 */
export async function sendNewSubmissionAdminNotification(
  recipientsOrOrgId: number[] | number,
  formName: string,
  submitterName: string,
  submitterEmail: string,
  submissionId: number,
  entityType: IntakeEntityType,
  lang?: string,
  results?: IntakeNotificationResults,
  laneText?: string,
): Promise<void> {
  try {
    let recipients: Array<{ id: number; name: string; email: string }>;

    if (Array.isArray(recipientsOrOrgId)) {
      // Per-form recipients (user IDs)
      recipients = await getUsersByIds(recipientsOrOrgId);
    } else {
      // Fallback: org admins
      recipients = await getAdminUsersForOrganization(recipientsOrOrgId);
    }

    if (recipients.length === 0) {
      logger.warn(`No recipients found for submission #${submissionId} notification`);
      return;
    }

    const reviewLink = buildFrontendUrl(`/intake-forms`);
    const entityTypeDisplay = getEntityTypeDisplayName(entityType);

    const subject = translate(lang, "New submission pending review: {formName}", { formName });
    const resultsHtml = renderIntakeResultsHtml(results, lang);
    const laneHtml = laneText
      ? `<p class="box-subtitle" style="margin-top: 6px;"><strong>${escapeHtml(
          translate(lang, "Review level:"),
        )}</strong> ${escapeHtml(laneText)}</p>`
      : "";
    let sent = 0;
    for (const recipient of recipients) {
      try {
        await notificationService.sendEmailWithTemplate(
          recipient.email,
          subject,
          EMAIL_TEMPLATES.INTAKE_NEW_SUBMISSION_ADMIN,
          {
            adminName: recipient.name || recipient.email.split("@")[0],
            formName,
            submitterName: submitterName || submitterEmail.split("@")[0],
            submitterEmail,
            submissionId: String(submissionId),
            entityType: entityTypeDisplay,
            reviewLink,
            laneHtml,
            resultsHtml,
          },
        );
        sent += 1;
      } catch (error) {
        logger.error(`Failed to send admin notification to ${recipient.email}:`, error);
      }
    }

    logger.info(
      `Admin notification emails sent for submission #${submissionId}: ${sent} of ${recipients.length}`,
    );
  } catch (error) {
    logger.error("Failed to send admin notification emails:", error);
  }
}

/**
 * Send approval email to submitter
 */
export async function sendSubmissionApprovedEmail(
  submitterEmail: string,
  submitterName: string,
  formName: string,
  submissionId: number,
  entityType: IntakeEntityType,
  lang?: string,
): Promise<void> {
  try {
    const entityTypeDisplay = getEntityTypeDisplayName(entityType);

    const subject = translate(lang, "Submission approved: {formName}", { formName });
    await notificationService.sendEmailWithTemplate(
      submitterEmail,
      subject,
      EMAIL_TEMPLATES.INTAKE_SUBMISSION_APPROVED,
      {
        submitterName: submitterName || submitterEmail.split("@")[0],
        formName,
        submissionId: String(submissionId),
        entityType: entityTypeDisplay,
      },
    );

    logger.info(
      `Submission approved email sent to ${submitterEmail} for submission #${submissionId}`,
    );
  } catch (error) {
    logger.error("Failed to send submission approved email:", error);
  }
}

/**
 * Send rejection email to submitter with reason and resubmit link
 */
export async function sendSubmissionRejectedEmail(
  submitterEmail: string,
  submitterName: string,
  formName: string,
  submissionId: number,
  rejectionReason: string,
  resubmissionToken: string,
  publicId: string,
  tenantSlug?: string,
  formSlug?: string,
  lang?: string,
): Promise<void> {
  try {
    const resubmitLink = buildResubmitLink(resubmissionToken, publicId, tenantSlug, formSlug);

    const subject = translate(lang, "Submission requires changes: {formName}", { formName });
    await notificationService.sendEmailWithTemplate(
      submitterEmail,
      subject,
      EMAIL_TEMPLATES.INTAKE_SUBMISSION_REJECTED,
      {
        submitterName: submitterName || submitterEmail.split("@")[0],
        formName,
        submissionId: String(submissionId),
        rejectionReason,
        resubmitLink,
      },
    );

    logger.info(
      `Submission rejected email sent to ${submitterEmail} for submission #${submissionId}`,
    );
  } catch (error) {
    logger.error("Failed to send submission rejected email:", error);
  }
}

/**
 * Ask the form's senior reviewers for a second review of an approval that was
 * picked for sampling. Never throws: a failed email is logged.
 */
export async function sendSecondReviewRequestEmail(
  organizationId: number,
  submissionId: number,
  seniorReviewerIds: number[],
  lang?: string,
): Promise<void> {
  try {
    const submission = await getSubmissionByIdQuery(submissionId, organizationId);
    if (!submission) return;
    const form = await getIntakeFormByIdQuery(submission.formId, organizationId);
    const formName = form?.name || "Unknown Form";
    const approvers = submission.reviewedBy ? await getUsersByIds([submission.reviewedBy]) : [];
    const approverName = approvers[0]?.name || approvers[0]?.email || "A reviewer";
    const eligibleIds = await getEligibleReviewerIdsQuery(organizationId, seniorReviewerIds);
    const recipients = await getUsersByIds(eligibleIds);
    if (recipients.length === 0) {
      logger.warn(`No eligible senior reviewers for submission #${submissionId} second review`);
      return;
    }

    const reviewLink = buildFrontendUrl(`/intake-forms/submissions?submission=${submissionId}`);
    const subject = translate(lang, "Second review requested: {formName}", { formName });
    let sent = 0;
    for (const recipient of recipients) {
      try {
        await notificationService.sendEmailWithTemplate(
          recipient.email,
          subject,
          EMAIL_TEMPLATES.INTAKE_SECOND_REVIEW,
          {
            reviewerName: recipient.name || recipient.email.split("@")[0],
            formName,
            submissionId: String(submissionId),
            entityType: getEntityTypeDisplayName(submission.entityType),
            approverName,
            reviewLink,
          },
        );
        sent += 1;
      } catch (error) {
        logger.error(`Failed to send second review request to ${recipient.email}:`, error);
      }
    }

    logger.info(
      `Second review request emails sent for submission #${submissionId}: ${sent} of ${recipients.length}`,
    );
  } catch (error) {
    logger.error("Failed to send second review request emails:", error);
  }
}
