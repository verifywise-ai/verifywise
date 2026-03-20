import { Request, Response } from "express";
import {
  getInvitationsByTenantQuery,
  getInvitationByIdQuery,
  revokeInvitationQuery,
  updateInvitationExpiryQuery,
} from "../utils/invitation.utils";
import { sendInviteEmail } from "../utils/inviteEmail.utils";

/**
 * GET /api/invitations
 * Returns all pending invitations for the authenticated user's organization.
 */
export const getInvitations = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const organizationId = req.organizationId!;
    const invitations = await getInvitationsByTenantQuery(organizationId);
    return res.status(200).json({ invitations });
  } catch (error) {
    console.error("Error fetching invitations:", error);
    return res.status(500).json({ error: "Failed to fetch invitations" });
  }
};

/**
 * DELETE /api/invitations/:id
 * Revoke a pending invitation.
 */
export const revokeInvitation = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const organizationId = req.organizationId!;

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid invitation ID" });
    }

    const deleted = await revokeInvitationQuery(organizationId, id);
    if (!deleted) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    return res.status(200).json({ message: "Invitation revoked" });
  } catch (error) {
    console.error("Error revoking invitation:", error);
    return res.status(500).json({ error: "Failed to revoke invitation" });
  }
};

/**
 * POST /api/invitations/:id/resend
 * Resend an invitation email with a fresh token and updated expiry.
 */
export const resendInvitation = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const organizationId = req.organizationId!;

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid invitation ID" });
    }

    const invitation = await getInvitationByIdQuery(organizationId, id);
    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    const { link, expiresAt, info } = await sendInviteEmail({
      email: invitation.email,
      name: invitation.name,
      surname: invitation.surname,
      roleId: invitation.role_id,
      organizationId: organizationId,
    });

    await updateInvitationExpiryQuery(organizationId, id, expiresAt);

    if (info.error) {
      return res.status(206).json({
        error: `${info.error.name}: ${info.error.message}`,
        message: link,
      });
    }

    return res.status(200).json({ message: "Invitation resent successfully" });
  } catch (error) {
    console.error("Error resending invitation:", error);
    return res.status(500).json({ error: "Failed to resend invitation" });
  }
};
