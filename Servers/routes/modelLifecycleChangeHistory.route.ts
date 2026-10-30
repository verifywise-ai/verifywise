import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import { requireExtensionEnabled } from "../middleware/requireExtensionEnabled.middleware";
import { getModelLifecycleChangeHistoryById } from "../controllers/modelLifecycleChangeHistory.ctrl";

// GET change history for a model's lifecycle (per-model answer, file, person
// and approval changes). Gated like every other lifecycle route: an org that
// disabled the extension gets 403 here too.
router.get(
  "/:id",
  authenticateJWT,
  requireExtensionEnabled("model-lifecycle"),
  getModelLifecycleChangeHistoryById,
);

export default router;
