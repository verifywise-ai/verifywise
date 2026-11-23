/**
 * Scheduled report writes under /api/v1. Thin: they reuse the controllers and
 * RBAC of the frozen /api/reporting/scheduled-reports router; the v1 contract
 * adds reportParameters and the quarterly frequency.
 */
import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
// accessControl.middleware exports authorize as its DEFAULT export.
import authorize from "../../middleware/accessControl.middleware";
import {
  createScheduledReport,
  updateScheduledReport,
} from "../../controllers/scheduledReport.ctrl";

const router = express.Router();

router.post("/", authenticateJWT, authorize("scheduledReport.edit"), createScheduledReport);
router.patch("/:id", authenticateJWT, authorize("scheduledReport.edit"), updateScheduledReport);

export default router;
