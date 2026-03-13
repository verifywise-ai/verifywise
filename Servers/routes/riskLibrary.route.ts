import express from "express";
const router = express.Router();

import authenticateJWT from "../middleware/auth.middleware";
import {
  searchRiskLibrary,
  getRiskLibraryEntry,
  getRiskLibraryFilters,
  getRiskLibraryStats,
} from "../controllers/riskLibrary.ctrl";

router.get("/", authenticateJWT, searchRiskLibrary);
router.get("/filters", authenticateJWT, getRiskLibraryFilters);
router.get("/stats", authenticateJWT, getRiskLibraryStats);
router.get("/:id", authenticateJWT, getRiskLibraryEntry);

export default router;
