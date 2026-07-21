import { Router } from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  listApprovalsCtrl,
  getApprovalStatsCtrl,
  getApprovalDetailCtrl,
  approveApprovalCtrl,
  rejectApprovalCtrl,
} from "../controllers/aiApproval.ctrl";

const router = Router();

// Stats route must come before :id to avoid matching "stats" as an ID
router.get("/stats", authenticateJWT, getApprovalStatsCtrl);
router.get("/", authenticateJWT, listApprovalsCtrl);
router.get("/:id", authenticateJWT, getApprovalDetailCtrl);
router.post("/:id/approve", authenticateJWT, authorize(["Admin"]), approveApprovalCtrl);
router.post("/:id/reject", authenticateJWT, authorize(["Admin"]), rejectApprovalCtrl);

export default router;
