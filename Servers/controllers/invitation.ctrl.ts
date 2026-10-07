import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  getInvitationsByTenantQuery,
  checkedInvitation,
  getInvitationByIdQuery,
  revokeInvitationQuery,
  updateInvitationExpiryQuery,
} from "../utils/invitation.utils";
import { sendInviteEmail } from "../utils/inviteEmail.utils";
import { inviteRoleRefusal } from "../utils/inviteRole.utils";
import { INVITATION_LIFETIME_MS } from "../utils/jwt.utils";

/**
 * GET /api/invitations
 * Returns all pending invitations for the authenticated user's organization.
 */
export const getInvitations = async (req: Request, res: Response): Promise<Response> => {
  try {
    const organizationId = req.organizationId!;
    const invitations = await getInvitationsByTenantQuery(organizationId);
    return res.status(200).json({ invitations });
  } catch (error) {
    console.error("Error fetching invitations:", error);
    return res.status(500).json(STATUS_CODE[500](req.t!("Failed to fetch invitations")));
  }
};

/**
 * The answer when a guarded revoke or resend matched no row: 404 if the
 * invitation was accepted or revoked meanwhile, 409 if a re-invite or another
 * resend changed it after the caller was checked against it.
 */
const invitationChangedResponse = async (
  req: Request,
  res: Response,
  organizationId: number,
  id: number,
): Promise<Response> => {
  if (!(await getInvitationByIdQuery(organizationId, id))) {
    return res.status(404).json(STATUS_CODE[404](req.t!("Invitation not found")));
  }
  return res
    .status(409)
    .json(STATUS_CODE[409](req.t!("The invitation was changed by someone else. Try again.")));
};

/**
 * DELETE /api/invitations/:id
 * Revoke a pending invitation.
 */
export const revokeInvitation = async (req: Request, res: Response): Promise<Response> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const organizationId = req.organizationId!;

    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid invitation ID")));
    }

    // Revoking follows the same ceiling as sending and resending: a role
    // may only withdraw invitations for roles it could itself grant. An
    // invitation whose role no longer exists stays revocable.
    const invitation = await getInvitationByIdQuery(organizationId, id);
    if (!invitation) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Invitation not found")));
    }
    const refusal = await inviteRoleRefusal(organizationId, req.role!, invitation.role_id);
    if (refusal === "exceeds_access") {
      return res
        .status(403)
        .json(
          STATUS_CODE[403](
            req.t!("You cannot revoke an invitation for a role with more access than your own"),
          ),
        );
    }

    const deleted = await revokeInvitationQuery(organizationId, checkedInvitation(invitation));
    if (!deleted) {
      return invitationChangedResponse(req, res, organizationId, id);
    }

    return res.status(200).json({ message: req.t!("Invitation revoked") });
  } catch (error) {
    console.error("Error revoking invitation:", error);
    return res.status(500).json(STATUS_CODE[500](req.t!("Failed to revoke invitation")));
  }
};

/**
 * POST /api/invitations/:id/resend
 * Resend an invitation email with a fresh token and updated expiry.
 */
export const resendInvitation = async (req: Request, res: Response): Promise<Response> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const organizationId = req.organizationId!;

    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid invitation ID")));
    }

    const invitation = await getInvitationByIdQuery(organizationId, id);
    if (!invitation) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Invitation not found")));
    }

    // A resend re-issues a working link, so the caller must be allowed to
    // grant the invitation's role, as when inviting.
    const refusal = await inviteRoleRefusal(organizationId, req.role!, invitation.role_id);
    if (refusal === "unknown_role") {
      return res.status(400).json(STATUS_CODE[400](req.t!("Unknown role")));
    }
    if (refusal === "exceeds_access") {
      return res
        .status(403)
        .json(STATUS_CODE[403](req.t!("You cannot invite a user with more access than your own")));
    }

    // Save the new expiry first, then email a link signed for it: a link
    // only registers while it matches the row. If the save fails nothing is
    // sent and the invitee's current link keeps working.
    const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);
    const updated = await updateInvitationExpiryQuery(
      organizationId,
      checkedInvitation(invitation),
      expiresAt,
    );
    if (!updated) {
      return invitationChangedResponse(req, res, organizationId, id);
    }

    const { link, info } = await sendInviteEmail({
      email: updated.email,
      name: updated.name,
      surname: updated.surname,
      roleId: updated.role_id,
      organizationId: organizationId,
      lang: req.lang,
      expiresAt,
    });

    if (info.error) {
      return res.status(206).json(
        STATUS_CODE[206]({
          error: `${info.error.name}: ${info.error.message}`,
          link,
        }),
      );
    }

    return res.status(200).json({ message: req.t!("Invitation resent successfully") });
  } catch (error) {
    console.error("Error resending invitation:", error);
    return res.status(500).json(STATUS_CODE[500](req.t!("Failed to resend invitation")));
  }
};
