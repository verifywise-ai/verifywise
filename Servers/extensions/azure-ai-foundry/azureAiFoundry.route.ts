import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
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
router.post("/sync", syncFromAzure);
router.get("/models/:deploymentId", getDeploymentById);
router.get("/discover", discoverAiAgents);

export default router;
