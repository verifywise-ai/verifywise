import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  calculateAll,
  calculateForFramework,
  getScores,
  getScoresByFramework,
  getControlScores,
  getWeakest,
  getRecommendations,
  getHistory,
} from "../controllers/readiness.ctrl";

const router = express.Router();

// POST trigger readiness calculation for all frameworks
router.post("/calculate", authenticateJWT, calculateAll);

// POST trigger readiness calculation for a specific framework
router.post("/calculate/:frameworkType", authenticateJWT, calculateForFramework);

// GET all framework readiness scores
router.get("/scores", authenticateJWT, getScores);

// GET scores for a specific framework
router.get("/scores/:frameworkType", authenticateJWT, getScoresByFramework);

// GET per-control readiness scores for a framework
router.get("/controls/:frameworkType", authenticateJWT, getControlScores);

// GET weakest controls across all frameworks
router.get("/weakest", authenticateJWT, getWeakest);

// GET top improvement recommendations
router.get("/recommendations", authenticateJWT, getRecommendations);

// GET historical readiness scores (trend)
router.get("/history", authenticateJWT, getHistory);

export default router;
