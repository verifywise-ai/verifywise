import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import { validateUpdateDashboardPreferences } from "../../middleware/validators/dashboardPreferences.validator";
import {
  getDashboardPreferencesHandler,
  updateDashboardPreferencesHandler,
} from "../../controllers/dashboardPreferences.ctrl";

// A layout is personal, so every role reads and writes its own and no one else's.
router.get("/preferences", authenticateJWT, getDashboardPreferencesHandler);
router.put(
  "/preferences",
  authenticateJWT,
  validateUpdateDashboardPreferences,
  updateDashboardPreferencesHandler,
);

export default router;
