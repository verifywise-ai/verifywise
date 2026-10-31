/**
 * Inviting a user into an organization.
 *
 * Extracted from controllers/vwmailer.ctrl.ts so the MCP tools can invite
 * without an HTTP request. The controller is now a thin wrapper that maps
 * these results and refusals back to the status codes it has always returned.
 *
 * Transport-free by design: refusals are raised as codes, not translated
 * strings, so the caller owns the wording and the status.
 */

import { createInvitationQuery } from "../utils/invitation.utils";
import { sendInviteEmail } from "../utils/inviteEmail.utils";
import { inviteRoleRefusal, pendingInvitationToReplace } from "../utils/inviteRole.utils";
import { INVITATION_LIFETIME_MS } from "../utils/jwt.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import logger from "../utils/logger/fileLogger";

export type InviteRefusalCode =
  /** No such role, or not one this organization can use. */
  | "unknown_role"
  /** The inviter's own role does not reach the role being granted. */
  | "exceeds_access"
  /** A pending invitation exists for a role above the inviter's ceiling. */
  | "cannot_replace"
  /** Another writer changed the pending invitation first. */
  | "conflict";

/** A refusal the caller is expected to report, not an unexpected failure. */
export class InviteRefusalError extends Error {
  constructor(public readonly code: InviteRefusalCode) {
    super(code);
    this.name = "InviteRefusalError";
  }
}

export interface InviteUserInput {
  organizationId: number;
  email: string;
  name: string;
  surname?: string;
  roleId: number;
  /** Recorded as the inviter on the invitation row. */
  invitedBy: number;
  /**
   * The inviter's role name, used as the ceiling on what they may grant.
   * null for a trusted caller (a verified super admin), which lifts the
   * ceiling and allows replacing any pending invitation.
   */
  inviterRole: string | null;
  /** Language for the invitation email. */
  lang?: string;
}

export type InviteUserResult =
  { emailSent: true; link: string } | { emailSent: false; link: string; error: string };

/**
 * Create the invitation and send its email.
 *
 * The row is saved before the email goes out: the link only works while it
 * matches a stored row, so a link for an unsaved invitation would be dead.
 * A send failure therefore still leaves a usable invitation behind, reported
 * as `emailSent: false` with the link so it can be passed on by hand.
 */
export async function inviteUserToOrganization(input: InviteUserInput): Promise<InviteUserResult> {
  const { organizationId, email, name, surname, roleId, invitedBy, inviterRole, lang } = input;
  const trusted = inviterRole === null;

  // Log strings are kept as the controller wrote them, so existing log
  // queries and assertions still match after the move.
  logProcessing({
    description: `starting invite email for user: ${email}`,
    functionName: "invite",
    fileName: "vwmailer.ctrl.ts",
    userId: invitedBy,
    organizationId,
  });
  logger.debug(`📧 Sending invitation email to ${email} for user ${name} ${surname || ""}`);

  try {
    const refusal = await inviteRoleRefusal(organizationId, inviterRole, roleId);
    if (refusal === "unknown_role") {
      throw new InviteRefusalError("unknown_role");
    }
    if (refusal === "exceeds_access") {
      throw new InviteRefusalError("exceeds_access");
    }

    // A trusted caller may replace any pending invitation for this email.
    const replace = trusted
      ? undefined
      : await pendingInvitationToReplace(organizationId, email, roleId, (pendingRoleId) =>
          inviteRoleRefusal(organizationId, inviterRole, pendingRoleId),
        );
    if (replace?.refused) {
      throw new InviteRefusalError("cannot_replace");
    }

    const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);
    const saved = await createInvitationQuery(
      organizationId,
      email,
      name,
      surname || "",
      roleId,
      invitedBy,
      expiresAt,
      { replace: replace?.replace },
    );
    if (!saved) {
      throw new InviteRefusalError("conflict");
    }

    const { link, info } = await sendInviteEmail({
      email,
      name,
      surname,
      roleId,
      organizationId,
      lang,
      expiresAt,
    });

    if (info.error) {
      const error = `${info.error.name}: ${info.error.message}`;
      console.error("Error sending email:", info.error);
      await logFailure({
        eventType: "Create",
        description: `Failed to send invitation email to ${email}: ${error}`,
        functionName: "invite",
        fileName: "vwmailer.ctrl.ts",
        error: new Error(error),
        userId: invitedBy,
        organizationId,
      });
      return { emailSent: false, link, error };
    }

    await logSuccess({
      eventType: "Create",
      description: `Successfully sent invitation email to ${email} for user ${name}`,
      functionName: "invite",
      fileName: "vwmailer.ctrl.ts",
      userId: invitedBy,
      organizationId,
    });
    return { emailSent: true, link };
  } catch (error) {
    // A refusal is an expected outcome the caller reports; only genuine
    // failures are logged here, as the controller did.
    if (error instanceof InviteRefusalError) {
      throw error;
    }
    console.error("Error sending email:", error);
    await logFailure({
      eventType: "Create",
      description: `Failed to send invitation email to ${email}`,
      functionName: "invite",
      fileName: "vwmailer.ctrl.ts",
      error: error as Error,
      userId: invitedBy,
      organizationId,
    });
    throw error;
  }
}
