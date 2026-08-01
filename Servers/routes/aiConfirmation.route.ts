import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  approveConfirmation,
  rejectConfirmation,
  getPendingConfirmations,
} from "../controllers/aiConfirmation.ctrl";

const router = express.Router();

// Same approveAction/rejectAction as aiApproval.route.ts, which is Admin-only.
// Without the same guard here, that rule — and the Admin-only workflow gate
// built on it — is bypassable through this path.
router.post("/approve/:id", authenticateJWT, authorize(["Admin"]), approveConfirmation);
router.post("/reject/:id", authenticateJWT, authorize(["Admin"]), rejectConfirmation);
router.get("/pending", authenticateJWT, getPendingConfirmations);

export default router;
