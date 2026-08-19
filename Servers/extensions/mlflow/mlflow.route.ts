import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";
import { getModelById, listModels, syncFromMlflow } from "./mlflow.ctrl";

const router = express.Router();
router.use(authenticateJWT);
router.use(requireExtensionEnabled("mlflow"));

router.get("/models", listModels);
router.post("/sync", syncFromMlflow);
router.get("/models/:modelId", getModelById);

export default router;
