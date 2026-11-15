import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";
import { requireProjectAccess } from "../../middleware/projectAccess.middleware";
import { createMemoryUpload } from "../../utils/upload.utils";
import {
  attachToProject,
  detachFromProject,
  getImpl,
  getImplRisks,
  getLinkDashboard,
  getLinkTree,
  listProjectLinks,
  replaceImplRisks,
  updateImpl,
} from "../../extensions/framework-import/importedAssessment.ctrl";

/**
 * Imported framework assessment on use cases (#5254), served at
 * /api/v1/imported-framework-assessments.
 *
 * Every route needs a token. Project routes check access to the use case
 * here; link routes check it in the controller after resolving the link.
 * Attaching needs the framework-import extension enabled; reading and
 * assessing an attached framework keep working when it is turned off.
 * Attach / detach need useCase.edit; assessing needs only access to the use
 * case, like the bundled PATCH /api/frameworks/:id/impl/... route.
 */
const router = express.Router();

// Bounded upload config: 30MB/file, 10 files, MIME allowlist.
const upload = createMemoryUpload();

router.use(authenticateJWT);

// GET /projects/:projectId — imported frameworks attached to the use case
router.get("/projects/:projectId", requireProjectAccess("projectId"), listProjectLinks);

// POST /projects/:projectId — attach an imported framework { imported_framework_id }
router.post(
  "/projects/:projectId",
  authorize("useCase.edit"),
  requireExtensionEnabled("framework-import"),
  requireProjectAccess("projectId"),
  attachToProject,
);

// DELETE /projects/:projectId/:linkId — detach (deletes its assessment data)
router.delete(
  "/projects/:projectId/:linkId",
  authorize("useCase.edit"),
  requireProjectAccess("projectId"),
  detachFromProject,
);

// GET /links/:linkId/tree — generic framework tree for the link
router.get("/links/:linkId/tree", getLinkTree);

// GET /links/:linkId/dashboard — progress / assignment / status counts
router.get("/links/:linkId/dashboard", getLinkDashboard);

// GET /links/:linkId/impl/:level/:implId — one topic (l2) or subtopic (l3) assessment
router.get("/links/:linkId/impl/:level/:implId", getImpl);

// PATCH /links/:linkId/impl/:level/:implId — save it (multipart, evidence files)
router.patch("/links/:linkId/impl/:level/:implId", upload.any(), updateImpl);

// GET /links/:linkId/impl/:level/:implId/risks — linked risks
router.get("/links/:linkId/impl/:level/:implId/risks", getImplRisks);

// PUT /links/:linkId/impl/:level/:implId/risks — replace linked risks { risk_ids }
router.put("/links/:linkId/impl/:level/:implId/risks", replaceImplRisks);

export default router;
