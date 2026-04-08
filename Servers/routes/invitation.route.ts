import express from "express";
import {
  getInvitations,
  revokeInvitation,
  resendInvitation,
} from "../controllers/invitation.ctrl";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import rateLimit from "express-rate-limit";

const router = express.Router();

// Rate limiter for resend: max 5 per minute per IP
const resendLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5,
  message: {
    error:
      "Too many resend requests from this IP, please try again later.",
  },
});

router.get("/", authenticateJWT, authorize(["Admin", "SuperAdmin"]), getInvitations);
router.delete("/:id", authenticateJWT, authorize(["Admin", "SuperAdmin"]), revokeInvitation);
router.post(
  "/:id/resend",
  authenticateJWT,
  authorize(["Admin", "SuperAdmin"]),
  resendLimiter,
  resendInvitation
);

export default router;
