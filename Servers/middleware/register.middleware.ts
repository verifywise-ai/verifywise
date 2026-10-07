import { NextFunction, Request, Response } from "express";
import { getTokenPayload } from "../utils/jwt.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { hasRoleId } from "../utils/roleMap";
import { getPendingInvitationQuery } from "../utils/invitation.utils";

const registerJWT = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  // Extract Bearer token from Authorization header
  const token = req.headers.authorization?.split(" ")[1];
  const { roleId, organizationId, email } = req.body;

  if (!token) {
    return res.status(400).json(
      STATUS_CODE[400]({
        message: req.t!("Token not found"),
      }),
    );
  }

  try {
    // Verify JWT signature and decode payload
    const decoded = getTokenPayload(token);

    if (!decoded)
      return res.status(401).json(
        STATUS_CODE[401]({
          message: req.t!("Unauthorized **"),
        }),
      );

    // Check token expiration. A missing or non-numeric expiry would compare
    // as NaN and pass this check and the link match below, so refuse it.
    const expire = Number(decoded.expire);
    if (!Number.isFinite(expire) || expire < Date.now())
      return res.status(406).json(
        STATUS_CODE[406]({
          message: req.t!(
            "This invitation link is expired. You need to be invited again to gain access to the dashboard",
          ),
        }),
      );

    const roleIsKnown = await hasRoleId(Number(roleId));

    // Convert both to numbers for comparison to handle string/number mismatches
    if (
      Number(decoded.roleId) !== Number(roleId) ||
      Number(decoded.organizationId) !== Number(organizationId) ||
      !roleIsKnown
    ) {
      console.error("❌ Registration validation failed");
      return res.status(403).json(STATUS_CODE[403](req.t!("Role or Organization mismatch")));
    }

    if (!decoded.email) {
      return res.status(401).json(STATUS_CODE[401](req.t!("This invitation link is invalid.")));
    }

    // The request's email must be the invited one. The form shows it
    // read-only, but a crafted request could otherwise use one invite link to
    // register any address.
    const normalise = (value: unknown) =>
      String(value ?? "")
        .trim()
        .toLowerCase();
    if (normalise(email) !== normalise(decoded.email)) {
      return res
        .status(403)
        .json(STATUS_CODE[403](req.t!("This invitation was sent to a different email address.")));
    }

    // Check if invitation is still pending (not revoked)
    const invitation = await getPendingInvitationQuery(
      Number(decoded.organizationId),
      decoded.email,
    );

    if (!invitation) {
      console.error("❌ Registration rejected: invitation was revoked or doesn't exist");
      return res
        .status(403)
        .json(
          STATUS_CODE[403](
            req.t!(
              "This invitation has been revoked. Please contact your administrator for a new invitation.",
            ),
          ),
        );
    }

    // The link must belong to the current invitation, not an earlier one for
    // the same email. Each link is signed to expire exactly at its invitation's
    // expires_at, so a resend (new expires_at) or a revoke and re-invite (new
    // row) leaves older links matching nothing, and an old link cannot carry an
    // old role. Acceptance ends the pending row, so a link works once. The
    // tolerance covers links sent before the two were signed from one value.
    const LINK_MATCH_TOLERANCE_MS = 60 * 1000;
    if (
      Number(invitation.role_id) !== Number(decoded.roleId) ||
      Math.abs(invitation.expires_at_ms - expire) > LINK_MATCH_TOLERANCE_MS
    ) {
      return res
        .status(403)
        .json(
          STATUS_CODE[403](
            req.t!(
              "This invitation link is no longer valid. Use the most recent invitation email, or ask your administrator to resend it.",
            ),
          ),
        );
    }

    // Create the account from the invitation itself, not the request: the
    // invited email exactly as stored (so the invitation can be marked
    // accepted), with the invited role and organization.
    req.body.email = decoded.email;
    req.body.roleId = decoded.roleId;
    req.body.organizationId = decoded.organizationId;
    // The invitation exactly as checked: registration accepts it only if it
    // is still in this state. A re-invite rewrites the same row (same id)
    // with a new role and expiry, and must not be used by this link.
    res.locals.invitation = {
      id: invitation.id,
      roleId: Number(invitation.role_id),
      expiresAtMs: invitation.expires_at_ms,
    };

    // Proceed to next middleware or route handler
    next();
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export default registerJWT;
