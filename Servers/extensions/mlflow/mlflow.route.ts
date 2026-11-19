import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";
import { getModelById, listModels, syncFromMlflow } from "./mlflow.ctrl";

const router = express.Router();
router.use(authenticateJWT);
router.use(requireExtensionEnabled("mlflow"));

router.get("/models", listModels);
// Sync writes model records, so it needs the same right as editing the model
// inventory. Reads stay open to every role.
router.post("/sync", authorize("model.edit"), syncFromMlflow);
router.get("/models/:modelId", getModelById);

export default router;
