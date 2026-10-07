import express from "express";
import { getInvitations, revokeInvitation, resendInvitation } from "../controllers/invitation.ctrl";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import { invitationResendLimiter } from "../middleware/rateLimit.middleware";

const router = express.Router();

router.get("/", authenticateJWT, authorize("invitation.super"), getInvitations);
router.delete("/:id", authenticateJWT, authorize("invitation.super"), revokeInvitation);
router.post(
  "/:id/resend",
  authenticateJWT,
  authorize("invitation.super"),
  invitationResendLimiter,
  resendInvitation,
);

export default router;
