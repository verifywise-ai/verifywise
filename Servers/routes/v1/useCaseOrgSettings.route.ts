import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import {
  getUseCaseOrgSettingsHandler,
  updateUseCaseOrgSettingsHandler,
} from "../../controllers/useCaseOrgSettings.ctrl";

// Every member reads the defaults (the use case form applies them); only an Admin changes them.
router.get("/", authenticateJWT, getUseCaseOrgSettingsHandler);
router.put("/", authenticateJWT, authorize(["Admin"]), updateUseCaseOrgSettingsHandler);

export default router;
