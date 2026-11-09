import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import { validateShadowAiIdParam } from "../../middleware/validators/shadowAi.validator";
import { getSyslogStatus, regenerateSyslogKey } from "../../controllers/shadowAi.ctrl";

// Shadow AI syslog listener endpoints added with the listener. The legacy
// /api/shadow-ai/config/syslog source routes are unchanged. Both handlers
// allow Admin and SuperAdmin only.

// Whether the listener is configured and running on the replica that answers.
router.get("/status", authenticateJWT, getSyslogStatus);

// Replace a source's key; the new key is returned once.
router.post(
  "/sources/:id/regenerate-key",
  authenticateJWT,
  validateShadowAiIdParam,
  regenerateSyslogKey,
);

export default router;
