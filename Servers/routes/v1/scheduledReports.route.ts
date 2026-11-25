/**
 * Scheduled reports under /api/v1. Thin: they reuse the controllers and RBAC
 * of the frozen /api/reporting/scheduled-reports router; the v1 contract adds
 * reportParameters, the quarterly frequency, and a single-schedule read that
 * carries the template version's parameters_config (the legacy list does not).
 * The read has no authorize(), matching the legacy list.
 */
import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
// accessControl.middleware exports authorize as its DEFAULT export.
import authorize from "../../middleware/accessControl.middleware";
import {
  createScheduledReport,
  getScheduledReport,
  updateScheduledReport,
} from "../../controllers/scheduledReport.ctrl";

const router = express.Router();

router.get("/:id", authenticateJWT, getScheduledReport);
router.post("/", authenticateJWT, authorize("scheduledReport.edit"), createScheduledReport);
router.patch("/:id", authenticateJWT, authorize("scheduledReport.edit"), updateScheduledReport);

export default router;
