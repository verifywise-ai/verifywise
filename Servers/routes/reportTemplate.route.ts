import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
// accessControl.middleware exports authorize as its DEFAULT export
// (accessControl.middleware.ts:79), matching scheduledReport.route.ts:3.
// A named import here compiles under ts-jest (diagnostics: false) and then
// fails at runtime with "authorize is not a function".
import authorize from "../middleware/accessControl.middleware";
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  archiveTemplate,
  runTemplateNow,
} from "../controllers/reportTemplate.ctrl";

const router = express.Router();

router.get("/", authenticateJWT, listTemplates);
router.get("/:id", authenticateJWT, getTemplate);

// Write RBAC matches the scheduled_reports write routes rather than the
// stricter Admin-only generate route: custom templates are org-shared content,
// not a privileged operation. System templates are read-only for everyone,
// enforced in the query WHERE clause rather than here.
router.post("/", authenticateJWT, authorize(["Admin", "Editor"]), createTemplate);
router.patch("/:id", authenticateJWT, authorize(["Admin", "Editor"]), updateTemplate);
router.delete("/:id", authenticateJWT, authorize(["Admin", "Editor"]), archiveTemplate);

// Ad-hoc run: same write RBAC as the rest of this router's mutating routes.
router.post("/:id/run", authenticateJWT, authorize(["Admin", "Editor"]), runTemplateNow);

export default router;
