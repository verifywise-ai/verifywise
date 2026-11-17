import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
// accessControl.middleware exports authorize as its DEFAULT export
// (accessControl.middleware.ts:79), matching scheduledReport.route.ts:3.
// A named import here compiles under ts-jest (diagnostics: false) and then
// fails at runtime with "authorize is not a function".
import authorize from "../../middleware/accessControl.middleware";
import {
  listPolicyTemplates,
  getPolicyTemplate,
  createPolicyTemplate,
  updatePolicyTemplate,
  deletePolicyTemplate,
  createPolicyTemplateFromPolicy,
} from "../../controllers/policyTemplate.ctrl";

const router = express.Router();

router.get("/", authenticateJWT, listPolicyTemplates);
router.get("/:id", authenticateJWT, getPolicyTemplate);

// Write RBAC mirrors the report template routes: custom templates are
// org-shared content, not a privileged operation. System templates are
// read-only for everyone, enforced in the query WHERE clause rather than here.
router.post("/", authenticateJWT, authorize("policyTemplate.edit"), createPolicyTemplate);
router.patch("/:id", authenticateJWT, authorize("policyTemplate.edit"), updatePolicyTemplate);
router.delete("/:id", authenticateJWT, authorize("policyTemplate.edit"), deletePolicyTemplate);

// "Save as template" from an existing policy: same write RBAC.
router.post(
  "/from-policy",
  authenticateJWT,
  authorize("policyTemplate.edit"),
  createPolicyTemplateFromPolicy,
);

export default router;
