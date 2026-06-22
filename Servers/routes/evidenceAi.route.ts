import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  analyzeFile,
  getAnalysis,
  getQualityScores,
  getGaps,
  getSuggestions,
  applySuggestions,
} from "../controllers/evidenceAi.ctrl";

const router = express.Router();

// POST trigger AI analysis for a file
router.post("/analyze/:fileId", authenticateJWT, analyzeFile);

// GET analysis results for a file
router.get("/analysis/:fileId", authenticateJWT, getAnalysis);

// GET quality scores dashboard
router.get("/quality-scores", authenticateJWT, getQualityScores);

// GET evidence gap analysis
router.get("/gaps", authenticateJWT, getGaps);

// GET suggested control links for a file
router.get("/suggestions/:fileId", authenticateJWT, getSuggestions);

// POST apply suggested control links
router.post("/suggestions/:fileId/apply", authenticateJWT, applySuggestions);

export default router;
