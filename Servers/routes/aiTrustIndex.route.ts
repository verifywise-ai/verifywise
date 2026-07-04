import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  getApps,
  getApp,
  getTracked,
  trackApp,
  trackAppsBulk,
  untrackApp,
  getSettings,
  updateSettings,
} from "../controllers/aiTrustIndex.ctrl";

const router = express.Router();

router.get("/apps", authenticateJWT, getApps);
router.get("/apps/:slug", authenticateJWT, getApp);
router.get("/tracked", authenticateJWT, getTracked);
router.post("/tracked/bulk", authenticateJWT, trackAppsBulk);
router.post("/tracked", authenticateJWT, trackApp);
router.delete("/tracked/:slug", authenticateJWT, untrackApp);
router.get("/settings", authenticateJWT, getSettings);
router.put("/settings", authenticateJWT, updateSettings);

export default router;
