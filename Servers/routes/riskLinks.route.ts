import express from "express";
const router = express.Router();

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  getRiskLinks,
  recomputeAllRiskLinks,
  updateRiskLinkStatus,
} from "../controllers/riskLinks.ctrl";

// Declared before GET /:riskId is irrelevant (different verb), but kept first
// so the backfill route is the obvious one in this file.
router.post("/recompute", authenticateJWT, authorize(["Admin"]), recomputeAllRiskLinks);

router.get("/:riskId", authenticateJWT, getRiskLinks);
router.patch("/:id", authenticateJWT, updateRiskLinkStatus);

export default router;
