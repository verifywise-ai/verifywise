import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  getCountries,
  getCountryDetail,
  getTracked,
  trackCountryCtrl,
  trackBulkCtrl,
  untrackCountryCtrl,
  getSettingsCtrl,
  updateSettingsCtrl,
} from "../controllers/regulationsTracker.ctrl";

const router = express.Router();

router.get("/countries", authenticateJWT, getCountries);
router.get("/countries/:slug", authenticateJWT, getCountryDetail);
router.get("/tracked", authenticateJWT, getTracked);
router.post("/tracked/bulk", authenticateJWT, trackBulkCtrl);
router.post("/tracked", authenticateJWT, trackCountryCtrl);
router.delete("/tracked/:slug", authenticateJWT, untrackCountryCtrl);
router.get("/settings", authenticateJWT, getSettingsCtrl);
router.put("/settings", authenticateJWT, updateSettingsCtrl);

export default router;
