import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  createScheduledReport,
  listScheduledReports,
  pauseScheduledReport,
  resumeScheduledReport,
  deleteScheduledReport,
  runScheduledReportNow,
  updateScheduledReport,
} from "../controllers/scheduledReport.ctrl";
import { legacyScheduleWriteContract } from "../middleware/legacyReportingContract.middleware";

const router = express.Router();

router.get("/", authenticateJWT, listScheduledReports);
// Frozen contract: reportParameters and the quarterly frequency are v1 inputs
// (/api/v1/scheduled-reports); the legacy adapter drops or refuses them.
router.post(
  "/",
  authenticateJWT,
  authorize("scheduledReport.edit"),
  legacyScheduleWriteContract,
  createScheduledReport,
);
router.patch(
  "/:id",
  authenticateJWT,
  authorize("scheduledReport.edit"),
  legacyScheduleWriteContract,
  updateScheduledReport,
);
router.post("/:id/pause", authenticateJWT, authorize("scheduledReport.edit"), pauseScheduledReport);
router.post(
  "/:id/resume",
  authenticateJWT,
  authorize("scheduledReport.edit"),
  resumeScheduledReport,
);
router.post(
  "/:id/run-now",
  authenticateJWT,
  authorize("scheduledReport.edit"),
  runScheduledReportNow,
);
router.delete("/:id", authenticateJWT, authorize("scheduledReport.edit"), deleteScheduledReport);

export default router;
