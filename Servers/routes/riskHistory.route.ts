import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import { getTimeseries, getCurrentCounts, createSnapshot } from "../controllers/riskHistory.ctrl";

// GET - Retrieve timeseries data
router.get("/timeseries", authenticateJWT, getTimeseries);

// GET - Get current parameter counts
router.get("/current-counts", authenticateJWT, getCurrentCounts);

// POST - Manually create a snapshot
router.post("/snapshot", authenticateJWT, createSnapshot);

export default router;
