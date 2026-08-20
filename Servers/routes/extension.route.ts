import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  listExtensions,
  getExtension,
  enableExtension,
  disableExtension,
  updateExtensionConfiguration,
  testExtensionConnection,
} from "../controllers/extension.ctrl";

const router = express.Router();

// Read paths: any authenticated org user can browse the catalog and see
// what's enabled for their org. Mutating paths (enable/disable/configuration/
// test-connection) require the Admin role — extensions can carry credentials
// (Slack tokens, MLflow passwords, Azure keys, JIRA API tokens) and toggling
// an extension changes what data leaves the org, so this is admin-only by
// policy. The frontend `ExtensionsPage` already blocks non-Admins in the UI;
// this middleware makes it authoritative.
router.get("/", authenticateJWT, listExtensions);
router.get("/:key", authenticateJWT, getExtension);
router.post("/:key/enable", authenticateJWT, authorize(["Admin"]), enableExtension);
router.post("/:key/disable", authenticateJWT, authorize(["Admin"]), disableExtension);
router.patch(
  "/:key/configuration",
  authenticateJWT,
  authorize(["Admin"]),
  updateExtensionConfiguration,
);
router.post(
  "/:key/test-connection",
  authenticateJWT,
  authorize(["Admin"]),
  testExtensionConnection,
);

export default router;
