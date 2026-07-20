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
router.post("/", authenticateJWT, authorize(["Admin", "Editor"]), createScheduledReport);
router.patch("/:id", authenticateJWT, authorize(["Admin", "Editor"]), updateScheduledReport);
router.post("/:id/pause", authenticateJWT, authorize(["Admin", "Editor"]), pauseScheduledReport);
router.post("/:id/resume", authenticateJWT, authorize(["Admin", "Editor"]), resumeScheduledReport);
router.post("/:id/run-now", authenticateJWT, authorize(["Admin", "Editor"]), runScheduledReportNow);
router.delete("/:id", authenticateJWT, authorize(["Admin", "Editor"]), deleteScheduledReport);

export default router;
