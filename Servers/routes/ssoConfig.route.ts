import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  checkSSOStatus,
  disableSSO,
  enableSSO,
  getSSOConfig,
  getSSOFeatureStatus,
  listSSOOrgs,
  saveSSOConfig,
} from "../controllers/ssoConfig.ctrl";
import { isSSOFeatureEnabled } from "../utils/ssoConfig.utils";

const router = express.Router();

router.get("/feature", getSSOFeatureStatus);

router.use((_req, res, next) => {
  if (!isSSOFeatureEnabled()) {
    return res.status(404).json({ message: "SSO feature is not enabled" });
  }
  return next();
});

router.get("/check-status", checkSSOStatus);
router.get("/orgs", listSSOOrgs);

router.get("/", authenticateJWT, getSSOConfig);
router.put("/", authenticateJWT, saveSSOConfig);
router.put("/enable", authenticateJWT, enableSSO);
router.put("/disable", authenticateJWT, disableSSO);

export default router;
