import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import { getControlEUChangeHistoryById } from "../../controllers/frameworkControlChangeHistory.ctrl";

// GET change history for an EU AI Act control
router.get("/:id", authenticateJWT, getControlEUChangeHistoryById);

export default router;
