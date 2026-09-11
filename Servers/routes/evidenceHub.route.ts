import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  createNewEvidence,
  deleteEvidenceById,
  getAllEvidences,
  getEvidenceById,
  runFreshnessSweep,
  updateEvidenceById,
} from "../controllers/evidenceHub.ctrl";

// Manual trigger for the nightly evidence-freshness sweep. Exists so the job
// is testable by hand — mirrors POST /riskLinks/recompute. Declared before
// GET /:id so the literal segment is never parsed as an id.
router.post(
  "/freshness-sweep",
  authenticateJWT,
  authorize(["Admin"]),
  runFreshnessSweep,
);

// GET all evidences
router.get("/", authenticateJWT, getAllEvidences);

// GET evidence by ID
router.get("/:id", authenticateJWT, getEvidenceById);

// POST create new evidence
router.post("/", authenticateJWT, createNewEvidence);

// PATCH update evidence by ID
router.patch("/:id", authenticateJWT, updateEvidenceById);

// DELETE evidence by ID
router.delete("/:id", authenticateJWT, deleteEvidenceById);

export default router;
