import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";
import {
  deleteUseCaseCtrl,
  getAttributes,
  getConfig,
  getCustomFrameworksProgressCtrl,
  getObjects,
  getObjectTypes,
  getSchemas,
  getSyncHistoryCtrl,
  getSyncStatusCtrl,
  getUseCaseCtrl,
  getVwAttributes,
  listUseCasesCtrl,
  postConfig,
  postImport,
  postSync,
} from "./jiraAssets.ctrl";

const router = express.Router();
router.use(authenticateJWT);
router.use(requireExtensionEnabled("jira-assets"));

// Configuration.
//
// Note: POST /test-connection is served by the generic
// /api/extensions/:key/test-connection route (see controllers/extension.ctrl.ts
// TEST_CONNECTION_DISPATCH). Because the generic /api/extensions router is
// mounted before this per-extension router in app.ts, a dedicated
// /test-connection route here would be shadowed and never fire.
router.get("/config", getConfig);
router.post("/config", postConfig);
router.get("/vw-attributes", getVwAttributes);

// Schema / object-type discovery
router.get("/schemas", getSchemas);
router.get("/schemas/:schemaId/object-types", getObjectTypes);
router.get("/object-types/:objectTypeId/attributes", getAttributes);
router.get("/object-types/:objectTypeId/objects", getObjects);

// Import + sync
router.post("/import", postImport);
router.post("/sync", postSync);
router.get("/sync/status", getSyncStatusCtrl);
router.get("/sync/history", getSyncHistoryCtrl);

// Use cases
router.get("/use-cases", listUseCasesCtrl);
router.get("/use-cases/:id", getUseCaseCtrl);
router.delete("/use-cases/:id", deleteUseCaseCtrl);

// Custom frameworks progress (rendered inside a JIRA use-case Overview tab)
router.get("/projects/:projectId/custom-frameworks-progress", getCustomFrameworksProgressCtrl);

export default router;
