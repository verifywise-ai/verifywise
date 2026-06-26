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
  getHorizon,
  getDeadlines,
  getFrameworks,
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
router.get("/horizon", authenticateJWT, getHorizon);
router.get("/deadlines", authenticateJWT, getDeadlines);
router.get("/frameworks", authenticateJWT, getFrameworks);

export default router;
