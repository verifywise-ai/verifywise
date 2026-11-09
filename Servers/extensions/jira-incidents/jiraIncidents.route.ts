import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";
import {
  getConfigCtrl,
  getEventsCtrl,
  getIssueTypesCtrl,
  getLabelsCtrl,
  getLinksCtrl,
  getPrioritiesCtrl,
  getProjectsCtrl,
  getStatusesCtrl,
  putConfigCtrl,
} from "./jiraIncidents.ctrl";

const router = express.Router();
router.use(authenticateJWT);

// The chips on incidents: any member who can see incidents, and an empty list
// (not 403) when the extension is off. Registered before the extension gate.
router.get("/links", getLinksCtrl);

router.use(requireExtensionEnabled("jira-incidents"));
// Everything else holds connection details and mappings: Admin only, reads included.
// POST /test-connection is served by the generic /api/extensions/:key/test-connection
// route (controllers/extension.ctrl.ts TEST_CONNECTION_DISPATCH); a route here
// would be shadowed by the catalog router mounted first in app.ts.
const admin = authorize("extension.admin");
router.get("/config", admin, getConfigCtrl);
router.put("/config", admin, putConfigCtrl);
router.get("/jira/projects", admin, getProjectsCtrl);
router.get("/jira/issue-types", admin, getIssueTypesCtrl);
router.get("/jira/statuses", admin, getStatusesCtrl);
router.get("/jira/priorities", admin, getPrioritiesCtrl);
router.get("/jira/labels", admin, getLabelsCtrl);
router.get("/events", admin, getEventsCtrl);

export default router;
