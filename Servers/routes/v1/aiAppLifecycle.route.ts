import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import {
  aiAppConfirmHandler,
  aiAppGoLiveHandler,
  aiAppRetireHandler,
  getAiAppHistoryHandler,
  getAiAppLifecycleHandler,
  getAiAppLifecycleSummaryHandler,
  getPendingAiAppSubmissionsHandler,
} from "../../controllers/aiAppLifecycle.ctrl";

// AI app lifecycle (#5193). Writes are allowed for aiApp.edit holders and the
// app owner (never Auditors); the controller checks that, because the owner
// rule depends on the row.

// Tab counts and stale markers for the AI apps page.
router.get("/summary", authenticateJWT, getAiAppLifecycleSummaryHandler);
// Pending AI app intake requests, listed in the In review tab. Read from
// intake_submissions; no AI app exists until approval.
router.get("/intake-submissions", authenticateJWT, getPendingAiAppSubmissionsHandler);
router.get("/:id", authenticateJWT, getAiAppLifecycleHandler);
router.get("/:id/history", authenticateJWT, getAiAppHistoryHandler);

router.post("/:id/go-live", authenticateJWT, aiAppGoLiveHandler);
router.post("/:id/retire", authenticateJWT, aiAppRetireHandler);
router.post("/:id/confirm", authenticateJWT, aiAppConfirmHandler);

export default router;
