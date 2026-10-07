import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import { getAuditLedger, verifyAuditLedger } from "../controllers/auditLedger.ctrl";

const router = express.Router();

router.use(authenticateJWT);

// Admins and super-admins can view the ledger; only admins can verify
router.get("/", authorize("auditLedger.super"), getAuditLedger);
router.get("/verify", authorize("auditLedger.admin"), verifyAuditLedger);

export default router;
