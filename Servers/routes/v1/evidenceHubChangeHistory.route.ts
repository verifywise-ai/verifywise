import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import { getEvidenceHubChangeHistoryById } from "../../controllers/evidenceHubChangeHistory.ctrl";

// GET change history for a specific evidence hub entry
router.get("/:id", authenticateJWT, getEvidenceHubChangeHistoryById);

export default router;
