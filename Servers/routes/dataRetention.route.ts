import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  getDataRetention,
  previewAuditRetention,
  updateAuditRetention,
} from "../controllers/dataRetention.ctrl";

const router = express.Router();

// Retention periods apply organization-wide, so every route is Admin-only.
router.get("/", authenticateJWT, authorize("organization.admin"), getDataRetention);
router.get(
  "/audit-records/preview",
  authenticateJWT,
  authorize("organization.admin"),
  previewAuditRetention,
);
router.put(
  "/audit-records",
  authenticateJWT,
  authorize("organization.admin"),
  updateAuditRetention,
);

export default router;
