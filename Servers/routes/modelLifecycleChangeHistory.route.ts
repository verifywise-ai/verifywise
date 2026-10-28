import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import { getModelLifecycleChangeHistoryById } from "../controllers/modelLifecycleChangeHistory.ctrl";

// GET change history for a model's lifecycle (per-model value edits and
// future lifecycle events recorded against the model)
router.get("/:id", authenticateJWT, getModelLifecycleChangeHistoryById);

export default router;
