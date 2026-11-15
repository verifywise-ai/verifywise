import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
// accessControl.middleware exports authorize as its DEFAULT export.
import authorize from "../../middleware/accessControl.middleware";
import {
  submitPolicyForApproval,
  approvePolicyDirectly,
  getPolicyApprovalState,
  getPolicyFolderCounts,
} from "../../controllers/policyApproval.ctrl";

const router = express.Router();

// Policy approval through the generic approval workflows. These replace the
// deprecated legacy /policies/:id/review/* endpoints (ADR 0001 §7).

// Policies per folder for the policies folder sidebar. Any member of the
// organization may read it. Registered before the /:id routes.
router.get("/folder-counts", authenticateJWT, getPolicyFolderCounts);

// Approval state for the editor: any member of the organization may read it.
router.get("/:id/approval", authenticateJWT, getPolicyApprovalState);

// Opens an approval request on a usable policy workflow.
router.post(
  "/:id/submit-for-approval",
  authenticateJWT,
  authorize("policy.edit"),
  submitPolicyForApproval,
);

// Admin approval when the organization has no usable policy workflow. The
// Admin check (organization.admin) is made in the service and answers 403.
router.post("/:id/approve", authenticateJWT, authorize("policy.edit"), approvePolicyDirectly);

export default router;
