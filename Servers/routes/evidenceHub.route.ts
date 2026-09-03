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
import {
  getEvidenceHubSettingsHandler,
  updateEvidenceHubSettingsHandler,
} from "../controllers/evidenceHubSettings.ctrl";

// GET org-level Evidence Hub settings (must precede /:id)
router.get("/settings", authenticateJWT, getEvidenceHubSettingsHandler);

// PUT org-level Evidence Hub settings
router.put("/settings", authenticateJWT, updateEvidenceHubSettingsHandler);

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
