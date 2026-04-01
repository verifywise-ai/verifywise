import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  getFeatureSettings,
  updateFeatureSettings,
} from "../controllers/featureSettings.ctrl";

const router = express.Router();

router.get("/", authenticateJWT, getFeatureSettings);
router.patch("/", authenticateJWT, updateFeatureSettings);

export default router;
