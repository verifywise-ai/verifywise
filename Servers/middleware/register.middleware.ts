import { NextFunction, Request, Response } from "express";
import { getTokenPayload } from "../utils/jwt.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { roleMap } from "./auth.middleware";
import { checkPendingInvitationQuery } from "../utils/invitation.utils";

const registerJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  // Extract Bearer token from Authorization header
  const token = req.headers.authorization?.split(" ")[1];
  const { roleId, organizationId } = req.body;

  if (!token) {
    return res.status(400).json(
      STATUS_CODE[400]({
        message: "Token not found",
      })
    );
  }

  try {
    // Verify JWT signature and decode payload
    const decoded = getTokenPayload(token);

    if (!decoded)
      return res.status(401).json(
        STATUS_CODE[401]({
          message: "Unauthorized **",
        })
      );

    // Check token expiration
    if (decoded.expire < Date.now())
      return res
        .status(406)
        .json(STATUS_CODE[406]({ message: "This invitation link is expired. You need to be invited again to gain access to the dashboard" }));

    console.log("🔍 Registration validation:", {
      tokenRoleId: decoded.roleId,
      requestRoleId: roleId,
      tokenOrgId: decoded.organizationId,
      requestOrgId: organizationId,
      roleIdMatch: Number(decoded.roleId) === Number(roleId),
      orgIdMatch: Number(decoded.organizationId) === Number(organizationId),
      roleInMap: roleMap.has(Number(roleId))
    });

    // Convert both to numbers for comparison to handle string/number mismatches
    if (Number(decoded.roleId) !== Number(roleId) || Number(decoded.organizationId) !== Number(organizationId) || !roleMap.has(Number(roleId))) {
      console.error("❌ Registration validation failed");
      return res.status(403).json({ message: 'Role or Organization mismatch' });
    }

    // Check if invitation is still pending (not revoked)
    const hasPendingInvitation = await checkPendingInvitationQuery(Number(decoded.organizationId), decoded.email);

    if (!hasPendingInvitation) {
      console.error("❌ Registration rejected: invitation was revoked or doesn't exist");
      return res.status(403).json({
        message: 'This invitation has been revoked. Please contact your administrator for a new invitation.'
      });
    }

    // Proceed to next middleware or route handler
    next();
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export default registerJWT;