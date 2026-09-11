import express from "express";
const router = express.Router();

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  createRiskLink,
  getControlCoverage,
  getDismissalAnalytics,
  getDuplicateCandidates,
  getRiskGraph,
  getRiskLinks,
  getSharedProjects,
  recomputeAllRiskLinks,
  suggestRiskHierarchy,
  updateRiskLinkStatus,
} from "../controllers/riskLinks.ctrl";

// Declared before GET /:riskId is irrelevant (different verb), but kept first
// so the backfill route is the obvious one in this file.
router.post("/recompute", authenticateJWT, authorize(["Admin"]), recomputeAllRiskLinks);
router.post(
  "/suggest-hierarchy",
  authenticateJWT,
  authorize(["Admin"]),
  suggestRiskHierarchy,
);

router.post("/", authenticateJWT, createRiskLink);
router.get("/", authenticateJWT, getRiskGraph);
router.get("/dismissals", authenticateJWT, getDismissalAnalytics);
// Declared before /:riskId: the param route would swallow /duplicates as a
// risk id. Read-only report, so authenticateJWT only — same as /dismissals.
router.get("/duplicates", authenticateJWT, getDuplicateCandidates);
// Same param-route trap as /duplicates: /coverage must sit above /:riskId.
router.get("/coverage", authenticateJWT, getControlCoverage);
router.get("/:riskId", authenticateJWT, getRiskLinks);
router.get("/:riskId/shared-projects", authenticateJWT, getSharedProjects);
router.patch("/:id", authenticateJWT, updateRiskLinkStatus);

export default router;
