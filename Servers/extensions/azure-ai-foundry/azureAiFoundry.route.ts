import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";
import {
  discoverAiAgents,
  getDeploymentById,
  listDeployments,
  syncFromAzure,
} from "./azureAiFoundry.ctrl";

const router = express.Router();
router.use(authenticateJWT);
router.use(requireExtensionEnabled("azure-ai-foundry"));

router.get("/models", listDeployments);
// Sync writes model records and discovery calls Azure with the stored key, so
// both need the same right as editing the model inventory. Reads stay open.
router.post("/sync", authorize("model.edit"), syncFromAzure);
router.get("/models/:deploymentId", getDeploymentById);
router.get("/discover", authorize("model.edit"), discoverAiAgents);

export default router;
