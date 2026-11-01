import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import {
  getLifecycleSettingsHandler,
  updateLifecycleSettingsHandler,
} from "../../controllers/useCaseLifecycle.ctrl";

// Org-wide "still live?" check interval (30, 90 or 180 days). Shared by every
// inventory with a lifecycle. Anyone signed in may read it; only admins change it.
router.get("/", authenticateJWT, getLifecycleSettingsHandler);
router.patch("/", authenticateJWT, authorize("organization.admin"), updateLifecycleSettingsHandler);

export default router;
