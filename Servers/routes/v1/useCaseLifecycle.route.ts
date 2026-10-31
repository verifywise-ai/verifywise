import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import {
  confirmStillLiveHandler,
  getLifecycleDashboardHandler,
  getLifecycleSummaryHandler,
  goLiveHandler,
  retireHandler,
  updateDepartmentHandler,
} from "../../controllers/useCaseLifecycle.ctrl";

// Use case lifecycle (#5187). Writes are allowed for useCase.edit holders and
// the use case owner (never Auditors); the controller checks that, because the
// owner rule depends on the row.

// Tab counts and stale markers for the use cases list.
router.get("/summary", authenticateJWT, getLifecycleSummaryHandler);
// Lifecycle widgets for the dashboard.
router.get("/dashboard", authenticateJWT, getLifecycleDashboardHandler);

router.post("/:id/go-live", authenticateJWT, goLiveHandler);
router.post("/:id/retire", authenticateJWT, retireHandler);
router.post("/:id/confirm", authenticateJWT, confirmStillLiveHandler);
router.patch("/:id/department", authenticateJWT, updateDepartmentHandler);

export default router;
