import express from "express";
const router = express.Router();

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  createRiskLink,
  getRiskLinks,
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
router.get("/:riskId", authenticateJWT, getRiskLinks);
router.patch("/:id", authenticateJWT, updateRiskLinkStatus);

export default router;
