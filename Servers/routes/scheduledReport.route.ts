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

const router = express.Router();

router.get("/", authenticateJWT, listScheduledReports);
router.post("/", authenticateJWT, authorize("scheduledReport.edit"), createScheduledReport);
router.patch("/:id", authenticateJWT, authorize("scheduledReport.edit"), updateScheduledReport);
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
