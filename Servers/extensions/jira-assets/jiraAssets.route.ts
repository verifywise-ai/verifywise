import express from "express";
import { param } from "express-validator";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";
import { validate } from "../../middleware/validate.middleware";
import { JIRA_NUMERIC_ID_PATTERN } from "./jira.client";
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
  patchSelection,
  patchSyncSettings,
  postConfig,
  postImport,
  postSync,
  removeMissingCtrl,
} from "./jiraAssets.ctrl";

/**
 * 400 unless the path parameter is a numeric Jira id. Express has already
 * decoded it, so "..%2F..%2Fapi%23" arrives as "../../api#" and is refused
 * here before the controller (the client checks again before any request).
 */
const jiraIdParam = (name: string) =>
  validate(param(name).matches(JIRA_NUMERIC_ID_PATTERN).withMessage(`${name} must be a Jira id`));

const router = express.Router();
router.use(authenticateJWT);
router.use(requireExtensionEnabled("jira-assets"));

// Writes (config, sync settings, selection, import, sync, removing missing use
// cases, use-case delete) need "extension.admin" — the
// same permission as enabling or configuring an extension in the catalog.
// So do the schema, object-type and object listings: only the admin
// configuration panel calls them, and each one is a live call to Jira with
// the organization's stored credentials. The other reads stay open to any
// member of an org with the extension enabled, because the use-case views in
// the project pages call them.

// Configuration.
//
// Note: POST /test-connection is served by the generic
// /api/extensions/:key/test-connection route (see controllers/extension.ctrl.ts
// TEST_CONNECTION_DISPATCH). Because the generic /api/extensions router is
// mounted before this per-extension router in app.ts, a dedicated
// /test-connection route here would be shadowed and never fire.
router.get("/config", getConfig);
router.post("/config", authorize("extension.admin"), postConfig);
// Partial update of the automatic-sync settings only. These are three segments below
// /api/extensions, so the catalog router's /:key routes can't shadow it.
router.patch("/config/sync", authorize("extension.admin"), patchSyncSettings);
// Partial update of the selected schema / object type only.
router.patch("/config/selection", authorize("extension.admin"), patchSelection);
router.get("/vw-attributes", getVwAttributes);

// Schema / object-type discovery (the configuration panel's pickers)
router.get("/schemas", authorize("extension.admin"), getSchemas);
router.get(
  "/schemas/:schemaId/object-types",
  authorize("extension.admin"),
  jiraIdParam("schemaId"),
  getObjectTypes,
);
// Open to members: a use case's Settings tab (JiraUseCaseSettings) reads the
// object type's attribute schema to list every attribute.
router.get("/object-types/:objectTypeId/attributes", jiraIdParam("objectTypeId"), getAttributes);
router.get(
  "/object-types/:objectTypeId/objects",
  authorize("extension.admin"),
  jiraIdParam("objectTypeId"),
  getObjects,
);

// Import + sync
router.post("/import", authorize("extension.admin"), postImport);
router.post("/sync", authorize("extension.admin"), postSync);
router.get("/sync/status", getSyncStatusCtrl);
router.get("/sync/history", getSyncHistoryCtrl);

// Use cases
router.get("/use-cases", listUseCasesCtrl);
// Explicit removal of use cases flagged as missing in Jira (syncs never delete).
router.post("/use-cases/remove-missing", authorize("extension.admin"), removeMissingCtrl);
router.get("/use-cases/:id", getUseCaseCtrl);
router.delete("/use-cases/:id", authorize("extension.admin"), deleteUseCaseCtrl);

// Custom frameworks progress (rendered inside a JIRA use-case Overview tab)
router.get("/projects/:projectId/custom-frameworks-progress", getCustomFrameworksProgressCtrl);

export default router;
