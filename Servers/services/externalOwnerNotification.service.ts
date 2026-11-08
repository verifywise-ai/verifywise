import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { EMAIL_TEMPLATES } from "../constants/emailTemplates";
import { notificationService } from "./notificationService";
import { getOrganizationByIdQuery } from "../utils/organization.utils";
import logger from "../utils/logger/fileLogger";

/**
 * Email-only notices for external use case owners (#5256).
 *
 * External owners have no account: never an in-app notification row, and never
 * a link they could not open. inAppNotification.service stays user-id based.
 * Every email names a person at the organization to contact instead.
 */

export interface ExternalOwnerRecipient {
  name: string;
  email: string;
}

const ACCOUNT_NOTE = "You do not need a VerifyWise account and this email has no sign-in link.";
const FALLBACK_CONTACT = "an administrator of your organization";

interface ContactRow {
  name: string | null;
  surname: string | null;
  email: string | null;
}

/** "Name (email)" for the preferred user, or an org admin, or generic wording. */
async function resolveContact(organizationId: number, preferredUserId: number | null) {
  try {
    const rows = await sequelize.query<ContactRow>(
      `SELECT u.name, u.surname, u.email
         FROM users u
         JOIN organization_members om ON om.user_id = u.id AND om.organization_id = :organizationId
        WHERE u.id = :preferredUserId OR om.role_id = 1
        ORDER BY (u.id = :preferredUserId) DESC, u.id ASC
        LIMIT 1;`,
      {
        replacements: { organizationId, preferredUserId: preferredUserId ?? 0 },
        type: QueryTypes.SELECT,
      },
    );
    const contact = rows[0];
    if (contact?.email) {
      const name = `${contact.name ?? ""} ${contact.surname ?? ""}`.trim();
      return name ? `${name} (${contact.email})` : contact.email;
    }
  } catch (error) {
    // The notice is still worth sending with the generic wording.
    logger.error("Could not look up a contact for an external owner notice:", error);
  }
  return FALLBACK_CONTACT;
}

async function organizationName(organizationId: number): Promise<string> {
  try {
    return (await getOrganizationByIdQuery(organizationId))?.name || "your organization";
  } catch {
    return "your organization";
  }
}

/** Tell a newly named external owner. The caller decides what a failure means. */
export async function notifyExternalOwnerAssigned(params: {
  organizationId: number;
  useCaseTitle: string;
  recipient: ExternalOwnerRecipient;
  assignedByUserId: number;
}): Promise<void> {
  const { organizationId, useCaseTitle, recipient, assignedByUserId } = params;
  const contact = await resolveContact(organizationId, assignedByUserId);
  const organization = await organizationName(organizationId);

  await notificationService.sendEmailWithTemplate(
    recipient.email,
    `You are the owner of "${useCaseTitle}"`,
    EMAIL_TEMPLATES.EXTERNAL_OWNER_NOTICE,
    {
      recipient_name: recipient.name,
      heading: `You are the owner of "${useCaseTitle}"`,
      message: `${organization} has named you the owner of the use case ${useCaseTitle}. You will get reminders about it by email.`,
      action_message: ACCOUNT_NOTE,
      contact_message: `If this is not right, or you have questions, contact ${contact}.`,
    },
  );
}

/**
 * The "still live?" reminder. Unlike a user, an external owner cannot confirm in
 * the app, so the email asks them to tell someone who can. A failed send rejects:
 * the sweep leaves the entry unstamped and retries it the next day.
 */
export async function notifyExternalOwnerConfirmationDue(params: {
  organizationId: number;
  entryTitle: string;
  noun: string;
  since: string;
  intervalDays: number;
  recipient: ExternalOwnerRecipient;
  contactUserId: number | null;
}): Promise<void> {
  const { organizationId, entryTitle, noun, since, intervalDays, recipient, contactUserId } =
    params;
  const contact = await resolveContact(organizationId, contactUserId);

  await notificationService.sendEmailWithTemplate(
    recipient.email,
    `Is "${entryTitle}" still live?`,
    EMAIL_TEMPLATES.EXTERNAL_OWNER_NOTICE,
    {
      recipient_name: recipient.name,
      heading: `Is "${entryTitle}" still live?`,
      message: `You own the ${noun} ${entryTitle}. It has not been confirmed as live since ${since}, and your organization asks owners to confirm every ${intervalDays} days.`,
      action_message: ACCOUNT_NOTE,
      contact_message: `Please tell ${contact} whether it is still in use, so they can confirm it or retire it.`,
    },
  );
}
