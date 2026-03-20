import { sendEmail } from "./emailService";
import { EMAIL_TEMPLATES } from "../constants/emailTemplates";
import { IntakeEntityType } from "../domain.layer/enums/intake-entity-type.enum";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import logger from "../utils/logger/fileLogger";
import { getUsersByIds } from "../utils/intakeForm.utils";

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
async function getAdminUsersForOrganization(organizationId: number): Promise<Array<{ id: number; name: string; email: string }>> {
  try {
    const admins = await sequelize.query(
      `SELECT u.id, u.name, u.email
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE r.name = 'Admin' AND u.organization_id = :organizationId`,
      {
        replacements: { organizationId },
        type: QueryTypes.SELECT,
      }
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
  formSlug?: string
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
  formSlug?: string
): Promise<void> {
  try {
    const resubmitLink = buildResubmitLink(resubmissionToken, publicId, tenantSlug, formSlug);

    await sendEmail(
      submitterEmail,
      `Submission received: ${formName}`,
      EMAIL_TEMPLATES.INTAKE_SUBMISSION_RECEIVED,
      {
        submitterName: submitterName || submitterEmail.split("@")[0],
        formName,
        submissionId: String(submissionId),
        resubmitLink,
      }
    );

    logger.info(`Submission received email sent to ${submitterEmail} for submission #${submissionId}`);
  } catch (error) {
    logger.error("Failed to send submission received email:", error);
  }
}

/**
 * Send notification email to designated recipients (or org admins as fallback)
 * Accepts either an array of user IDs or an organization ID for fallback
 */
export async function sendNewSubmissionAdminNotification(
  recipientsOrOrgId: number[] | number,
  formName: string,
  submitterName: string,
  submitterEmail: string,
  submissionId: number,
  entityType: IntakeEntityType
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

    for (const recipient of recipients) {
      try {
        await sendEmail(
          recipient.email,
          `New submission pending review: ${formName}`,
          EMAIL_TEMPLATES.INTAKE_NEW_SUBMISSION_ADMIN,
          {
            adminName: recipient.name || recipient.email.split("@")[0],
            formName,
            submitterName: submitterName || submitterEmail.split("@")[0],
            submitterEmail,
            submissionId: String(submissionId),
            entityType: entityTypeDisplay,
            reviewLink,
          }
        );
      } catch (error) {
        logger.error(`Failed to send admin notification to ${recipient.email}:`, error);
      }
    }

    logger.info(`Admin notification emails sent for submission #${submissionId}`);
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
  entityType: IntakeEntityType
): Promise<void> {
  try {
    const entityTypeDisplay = getEntityTypeDisplayName(entityType);

    await sendEmail(
      submitterEmail,
      `Submission approved: ${formName}`,
      EMAIL_TEMPLATES.INTAKE_SUBMISSION_APPROVED,
      {
        submitterName: submitterName || submitterEmail.split("@")[0],
        formName,
        submissionId: String(submissionId),
        entityType: entityTypeDisplay,
      }
    );

    logger.info(`Submission approved email sent to ${submitterEmail} for submission #${submissionId}`);
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
  formSlug?: string
): Promise<void> {
  try {
    const resubmitLink = buildResubmitLink(resubmissionToken, publicId, tenantSlug, formSlug);

    await sendEmail(
      submitterEmail,
      `Submission requires changes: ${formName}`,
      EMAIL_TEMPLATES.INTAKE_SUBMISSION_REJECTED,
      {
        submitterName: submitterName || submitterEmail.split("@")[0],
        formName,
        submissionId: String(submissionId),
        rejectionReason,
        resubmitLink,
      }
    );

    logger.info(`Submission rejected email sent to ${submitterEmail} for submission #${submissionId}`);
  } catch (error) {
    logger.error("Failed to send submission rejected email:", error);
  }
}
