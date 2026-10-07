import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import logger from "../utils/logger/fileLogger";
import { createInvitationQuery } from "../utils/invitation.utils";
import { sendInviteEmail } from "../utils/inviteEmail.utils";
import { inviteRoleRefusal, pendingInvitationToReplace } from "../utils/inviteRole.utils";
import { INVITATION_LIFETIME_MS } from "../utils/jwt.utils";

export const invite = async (
  req: Request,
  res: Response,
  body: {
    to: string;
    name: string;
    surname?: string;
    roleId: number | string;
    /** Ignored: an invite goes to the inviter's own organization. */
    organizationId?: number | string;
  },
  /**
   * Set only by trusted internal callers (the super-admin route, which has
   * already checked the caller is a super admin): invite into this
   * organization, without the inviter's role ceiling. Never from the body.
   */
  trusted?: { organizationId: number },
) => {
  const { to, name, surname } = body;
  const organizationId = trusted ? trusted.organizationId : req.organizationId;
  if (organizationId == null) {
    return res.status(403).json(STATUS_CODE[403](req.t!("Not allowed to access")));
  }
  // The invite form sends the id as a string.
  const roleId = Number(body.roleId);
  if (!Number.isInteger(roleId) || roleId <= 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Unknown role")));
  }
  logProcessing({
    description: `starting invite email for user: ${to}`,
    functionName: "invite",
    fileName: "vwmailer.ctrl.ts",
    userId: req.userId!,
    organizationId,
  });
  logger.debug(`📧 Sending invitation email to ${to} for user ${name} ${surname || ""}`);

  try {
    const refusal = await inviteRoleRefusal(organizationId, trusted ? null : req.role!, roleId);
    if (refusal === "unknown_role") {
      return res.status(400).json(STATUS_CODE[400](req.t!("Unknown role")));
    }
    if (refusal === "exceeds_access") {
      return res
        .status(403)
        .json(STATUS_CODE[403](req.t!("You cannot invite a user with more access than your own")));
    }

    // Save the invitation first: its link only registers while it matches
    // this row, so a link for an unsaved row would never work. A failure
    // here is a 500 and no email goes out.
    // A trusted caller may replace any pending invitation for this email.
    const replace = trusted
      ? undefined
      : await pendingInvitationToReplace(organizationId, to, roleId, (pendingRoleId) =>
          inviteRoleRefusal(organizationId, req.role!, pendingRoleId),
        );
    if (replace?.refused) {
      return res
        .status(403)
        .json(
          STATUS_CODE[403](
            req.t!("You cannot replace an invitation for a role with more access than your own"),
          ),
        );
    }

    const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);
    const saved = await createInvitationQuery(
      organizationId,
      to,
      name,
      surname || "",
      roleId,
      req.userId!,
      expiresAt,
      { replace: replace?.replace },
    );
    if (!saved) {
      return res
        .status(409)
        .json(STATUS_CODE[409](req.t!("The invitation was changed by someone else. Try again.")));
    }

    const { link, info } = await sendInviteEmail({
      email: to,
      name,
      surname,
      roleId,
      organizationId,
      lang: req.lang,
      expiresAt,
    });

    if (info.error) {
      console.error("Error sending email:", info.error);
      await logFailure({
        eventType: "Create",
        description: `Failed to send invitation email to ${to}: ${info.error.name}: ${info.error.message}`,
        functionName: "invite",
        fileName: "vwmailer.ctrl.ts",
        error: new Error(`${info.error.name}: ${info.error.message}`),
        userId: req.userId!,
        organizationId,
      });
      return res.status(206).json(
        STATUS_CODE[206]({
          error: `${info.error.name}: ${info.error.message}`,
          link,
        }),
      );
    } else {
      await logSuccess({
        eventType: "Create",
        description: `Successfully sent invitation email to ${to} for user ${name}`,
        functionName: "invite",
        fileName: "vwmailer.ctrl.ts",
        userId: req.userId!,
        organizationId,
      });
      return res.status(200).json({ message: req.t!("Email sent successfully") });
    }
  } catch (error) {
    console.error("Error sending email:", error);
    await logFailure({
      eventType: "Create",
      description: `Failed to send invitation email to ${to}`,
      functionName: "invite",
      fileName: "vwmailer.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId,
    });
    return res.status(500).json(
      STATUS_CODE[500]({
        error: req.t!("Failed to send email"),
        details: (error as Error).message,
      }),
    );
  }
};
