import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import { requireExtensionEnabledFromParam } from "../middleware/requireExtensionEnabled.middleware";
import {
  getRunStatusCtrl,
  getRunsCtrl,
  onlySyncProviderKeys,
  patchScheduleCtrl,
  postRunCtrl,
} from "../controllers/extensionRuns.ctrl";
import { registerAllSyncProviders } from "../extensions/sync-engine/providers";

registerAllSyncProviders();

/**
 * Sync engine routes, mounted at /api/extensions next to the catalog router.
 * Each starts with onlySyncProviderKeys, so a key without a sync provider
 * falls through to the per-extension routers. Writes need extension.admin.
 */
const router = express.Router();
const extensionEnabled = requireExtensionEnabledFromParam("key");

router.post(
  "/:key/runs",
  onlySyncProviderKeys,
  authenticateJWT,
  extensionEnabled,
  authorize("extension.admin"),
  postRunCtrl,
);
router.get(
  "/:key/runs/status",
  onlySyncProviderKeys,
  authenticateJWT,
  extensionEnabled,
  getRunStatusCtrl,
);
router.get("/:key/runs", onlySyncProviderKeys, authenticateJWT, extensionEnabled, getRunsCtrl);
router.patch(
  "/:key/schedule",
  onlySyncProviderKeys,
  authenticateJWT,
  extensionEnabled,
  authorize("extension.admin"),
  patchScheduleCtrl,
);

export default router;
