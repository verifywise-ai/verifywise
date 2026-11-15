import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { EMAIL_TEMPLATES } from "../constants/emailTemplates";
import { notificationService } from "./notificationService";
import { getOrganizationByIdQuery } from "../utils/organization.utils";
import logger from "../utils/logger/fileLogger";
import { translate } from "../utils/i18n.utils";
import redisClient from "../database/redis";
import { TIMED_OUT, withDeadline } from "./intakeLiveChecks/deadline";
import { REDIS_TIMEOUT_MS } from "./intakeLiveChecks/formBudget";

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

interface ContactRow {
  name: string | null;
  surname: string | null;
  email: string | null;
}

/** "Name (email)" for the preferred user, or an org admin, or generic wording. */
async function resolveContact(
  organizationId: number,
  organization: string,
  preferredUserId: number | null,
) {
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
  return `an administrator of ${organization}`;
}

async function organizationName(organizationId: number): Promise<string> {
  try {
    return (await getOrganizationByIdQuery(organizationId))?.name || "your organization";
  } catch {
    return "your organization";
  }
}

/**
 * Assignment emails one person can trigger per hour in an organization. The
 * address and the use case title are free text, so without a cap anyone with
 * useCase.edit could send VerifyWise-branded mail to any list of addresses.
 */
export const ASSIGNMENT_EMAILS_PER_USER_PER_HOUR = 30;

const HOUR_SECONDS = 3600;

/**
 * Counts one assignment email against the sender's hourly cap. True while within
 * it. A Redis failure also returns true: the email is the owner's only notice,
 * so an outage must not lose it.
 */
async function withinAssignmentEmailLimit(
  organizationId: number,
  userId: number,
): Promise<boolean> {
  // The client queues commands while disconnected and replays them on reconnect.
  if (redisClient.status !== "ready") {
    logger.warn("External owner email limit: Redis not connected, not counting");
    return true;
  }
  const hour = new Date().toISOString().slice(0, 13).replace(/[-T]/g, "");
  const key = `external-owner:assigned:${organizationId}:${userId}:${hour}`;
  try {
    const replies = await withDeadline(
      redisClient.multi().incr(key).expire(key, HOUR_SECONDS).exec(),
      REDIS_TIMEOUT_MS,
    );
    if (replies === TIMED_OUT) {
      logger.warn("External owner email limit: Redis did not answer, not counting");
      return true;
    }
    const [incrReply, expireReply] = replies ?? [];
    if (!incrReply || incrReply[0]) throw incrReply?.[0] ?? new Error("no reply to INCR");
    if (expireReply?.[0]) logger.warn("External owner email limit: expiry not set");
    return Number(incrReply[1]) <= ASSIGNMENT_EMAILS_PER_USER_PER_HOUR;
  } catch (error) {
    logger.warn(
      `External owner email limit: Redis error, not counting: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return true;
  }
}

/**
 * Tell a newly named external owner, unless the person naming them is over the
 * hourly cap. Resolves once the lookups are done and the send has started, so
 * callers can await it without waiting on the mail provider. They must await it
 * before responding: with RLS on, a query issued after the response runs on the
 * request's finished transaction and the email would lose its named contact.
 */
export async function notifyExternalOwnerAssigned(params: {
  organizationId: number;
  useCaseTitle: string;
  recipient: ExternalOwnerRecipient;
  assignedByUserId: number;
}): Promise<void> {
  const { organizationId, useCaseTitle, recipient, assignedByUserId } = params;
  if (!(await withinAssignmentEmailLimit(organizationId, assignedByUserId))) {
    logger.warn(
      `External owner email skipped: user ${assignedByUserId} in organization ${organizationId} is over the hourly limit`,
    );
    return;
  }
  const organization = await organizationName(organizationId);
  const contact = await resolveContact(organizationId, organization, assignedByUserId);

  notificationService
    .sendEmailWithTemplate(
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
    )
    .catch((error) => logger.error("Failed to notify external owner:", error));
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
  const organization = await organizationName(organizationId);
  const contact = await resolveContact(organizationId, organization, contactUserId);

  // External owners have no saved language, so the email stays English. The
  // subject shares its key with the in-app "still live?" notice.
  const subject = translate("en", 'Is "{title}" still live?', { title: entryTitle });
  await notificationService.sendEmailWithTemplate(
    recipient.email,
    subject,
    EMAIL_TEMPLATES.EXTERNAL_OWNER_NOTICE,
    {
      recipient_name: recipient.name,
      heading: subject,
      message: `You own the ${noun} ${entryTitle}. It has not been confirmed as live since ${since}, and ${organization} asks owners to confirm every ${intervalDays} days.`,
      action_message: ACCOUNT_NOTE,
      contact_message: `Please tell ${contact} whether it is still in use, so they can confirm it or retire it.`,
    },
  );
}
