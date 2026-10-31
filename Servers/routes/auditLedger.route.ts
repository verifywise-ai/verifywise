import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  exportAuditLedger,
  getAuditLedger,
  verifyAuditLedger,
} from "../controllers/auditLedger.ctrl";

const router = express.Router();

router.use(authenticateJWT);

// Admins and super-admins can view the ledger; only admins can verify and export
router.get("/", authorize("auditLedger.super"), getAuditLedger);
router.get("/verify", authorize("auditLedger.admin"), verifyAuditLedger);
router.get("/export", authorize("auditLedger.admin"), exportAuditLedger);

export default router;
