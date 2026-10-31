import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import { getSubcontrolEUChangeHistoryById } from "../../controllers/frameworkControlChangeHistory.ctrl";

// GET change history for an EU AI Act subcontrol
router.get("/:id", authenticateJWT, getSubcontrolEUChangeHistoryById);

export default router;
