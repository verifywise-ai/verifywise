import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import { getAllAiAppsV1 } from "../../controllers/aiApp.ctrl";

// GET /api/v1/ai-apps (#5193): the legacy list plus lifecycle columns and an
// optional ?lifecycle_stage= filter. The legacy /api/ai-apps is unchanged.
router.get("/", authenticateJWT, getAllAiAppsV1);

export default router;
