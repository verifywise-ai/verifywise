import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { InviteRefusalError, inviteUserToOrganization } from "../services/invitation.service";

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

  try {
    const result = await inviteUserToOrganization({
      organizationId,
      email: to,
      name,
      surname,
      roleId,
      invitedBy: req.userId!,
      inviterRole: trusted ? null : req.role!,
      lang: req.lang,
    });

    if (!result.emailSent) {
      return res.status(206).json(STATUS_CODE[206]({ error: result.error, link: result.link }));
    }
    return res.status(200).json({ message: req.t!("Email sent successfully") });
  } catch (error) {
    if (error instanceof InviteRefusalError) {
      switch (error.code) {
        case "unknown_role":
          return res.status(400).json(STATUS_CODE[400](req.t!("Unknown role")));
        case "exceeds_access":
          return res
            .status(403)
            .json(
              STATUS_CODE[403](req.t!("You cannot invite a user with more access than your own")),
            );
        case "cannot_replace":
          return res
            .status(403)
            .json(
              STATUS_CODE[403](
                req.t!(
                  "You cannot replace an invitation for a role with more access than your own",
                ),
              ),
            );
        case "conflict":
          return res
            .status(409)
            .json(
              STATUS_CODE[409](req.t!("The invitation was changed by someone else. Try again.")),
            );
      }
    }
    return res.status(500).json(
      STATUS_CODE[500]({
        error: req.t!("Failed to send email"),
        details: (error as Error).message,
      }),
    );
  }
};
