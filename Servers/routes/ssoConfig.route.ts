import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
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

router.get("/", authenticateJWT, authorize(["Admin"]), getSSOConfig);
router.put("/", authenticateJWT, authorize(["Admin"]), saveSSOConfig);
router.put("/enable", authenticateJWT, authorize(["Admin"]), enableSSO);
router.put("/disable", authenticateJWT, authorize(["Admin"]), disableSSO);

export default router;
