import { Router } from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  getAuditLog,
  getActionAuditTrail,
  getAnalytics,
  exportAuditLog,
} from "../controllers/aiAudit.ctrl";

const router = Router();

router.get("/analytics", authenticateJWT, getAnalytics);
router.get("/export", authenticateJWT, exportAuditLog);
router.get("/log/:actionId", authenticateJWT, getActionAuditTrail);
router.get("/log", authenticateJWT, getAuditLog);

export default router;
