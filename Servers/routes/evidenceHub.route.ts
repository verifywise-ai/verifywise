import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import {
  createNewEvidence,
  deleteEvidenceById,
  getAllEvidences,
  getEvidenceById,
  updateEvidenceById,
} from "../controllers/evidenceHub.ctrl";

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
