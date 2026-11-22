/**
 * Report run endpoints under /api/v1. Thin: they reuse the controllers of the
 * frozen /api/reporting/runs router, with the same per-run visibility gate.
 */
import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import { downloadRunCompanion } from "../../controllers/reportRun.ctrl";

const router = express.Router();

// The internal fix-it list stored beside an OSFI E-23 report (spec 8.6).
router.get("/:id/download/fix-it-list", authenticateJWT, downloadRunCompanion);

export default router;
