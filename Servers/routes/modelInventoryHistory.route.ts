import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  getTimeseries,
  getCurrentCounts,
  createSnapshot,
} from "../controllers/modelInventoryHistory.ctrl";

// GET - Retrieve timeseries data
router.get("/timeseries", authenticateJWT, getTimeseries);

// GET - Get current parameter counts
router.get("/current-counts", authenticateJWT, getCurrentCounts);

// POST - Manually create a snapshot
router.post("/snapshot", authenticateJWT, authorize("model.edit"), createSnapshot);

export default router;
