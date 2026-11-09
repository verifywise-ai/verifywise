import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { getAllAiAppsV1 } from "../../controllers/aiApp.ctrl";
import {
  linkAiAppUseCase,
  listAiAppUseCases,
  unlinkAiAppUseCase,
} from "../../controllers/aiAppProject.ctrl";

// GET /api/v1/ai-apps (#5193): the legacy list plus lifecycle columns and an
// optional ?lifecycle_stage= filter. The legacy /api/ai-apps is unchanged.
router.get("/", authenticateJWT, getAllAiAppsV1);

// The use cases an AI app serves (#5259).
router.get("/:id/use-cases", authenticateJWT, listAiAppUseCases);
router.post("/:id/use-cases", authenticateJWT, authorize("aiApp.edit"), linkAiAppUseCase);
router.delete(
  "/:id/use-cases/:projectId",
  authenticateJWT,
  authorize("aiApp.edit"),
  unlinkAiAppUseCase,
);

export default router;
