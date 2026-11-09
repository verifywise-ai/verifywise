import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import { getAnnexCategoryChangeHistoryById } from "../../controllers/frameworkControlChangeHistory.ctrl";

// GET change history for an ISO 42001 annex category
router.get("/:id", authenticateJWT, getAnnexCategoryChangeHistoryById);

export default router;
