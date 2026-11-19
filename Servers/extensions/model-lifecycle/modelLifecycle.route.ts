import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";
import { idParamCheck, validateId } from "../../domain.layer/validations/id.valid";
import { handleValidationErrors } from "../../middleware/validate.middleware";
import {
  addApproverCtrl,
  addPersonCtrl,
  attachFileCtrl,
  createItemCtrl,
  createPhaseCtrl,
  deleteItemCtrl,
  deletePhaseCtrl,
  detachFileCtrl,
  getLifecycleCtrl,
  getProgressCtrl,
  listConfig,
  removeApproverCtrl,
  removePersonCtrl,
  reorderItemsCtrl,
  reorderPhasesCtrl,
  requireItemInOrganization,
  requireModelInOrganization,
  updateApprovalStatusCtrl,
  updateItemCtrl,
  updatePhaseCtrl,
  upsertValueCtrl,
} from "./modelLifecycle.ctrl";

const router = express.Router();
router.use(authenticateJWT);
router.use(requireExtensionEnabled("model-lifecycle"));

// Every id in these paths is a Postgres INTEGER: reject anything else with a
// 400 before it reaches a query (an oversized id would otherwise 500 there).
for (const name of ["id", "phaseId", "itemId", "fileId", "userId"]) {
  const chain = idParamCheck(name);
  router.param(name, (req, res, next) => {
    chain
      .run(req)
      .then(() => handleValidationErrors(req, res, next))
      .catch(next);
  });
}

// Lifecycle setup (phases and items) is organization configuration: Admins
// only. Per-model answers, files, people and approvers follow the model
// inventory's own write permission. Reads stay open to every member, and an
// approval decision is open to the named approver alone (checked in the
// controller, with no Admin override).
const configAdmin = authorize("extension.admin");
const modelEdit = authorize("model.edit");

// ---- Config (phases + items) ------------------------------------------
router.get("/config", listConfig);
router.post("/phases", configAdmin, createPhaseCtrl);
// /phases/reorder MUST be declared before /phases/:id so Express doesn't
// interpret 'reorder' as a numeric phase id.
router.put("/phases/reorder", configAdmin, reorderPhasesCtrl);
router.put("/phases/:id", configAdmin, updatePhaseCtrl);
router.delete("/phases/:id", configAdmin, deletePhaseCtrl);
router.post("/phases/:phaseId/items", configAdmin, createItemCtrl);
router.put("/phases/:phaseId/items/reorder", configAdmin, reorderItemsCtrl);
router.put("/items/:id", configAdmin, updateItemCtrl);
router.delete("/items/:id", configAdmin, deleteItemCtrl);

// ---- Organization scope -----------------------------------------------
// Every per-model route, read or write, answers 404 for a model or item id
// outside the caller's organization before anything else runs. The id
// bounds above run first, as router.param applies to these paths too.
router.use("/models/:id/lifecycle", requireModelInOrganization);
router.use("/models/:id/lifecycle/items/:itemId", requireItemInOrganization);

// ---- Per-model reads + value upsert -----------------------------------
router.get("/models/:id/lifecycle", getLifecycleCtrl);
router.get("/models/:id/lifecycle/progress", getProgressCtrl);
router.put("/models/:id/lifecycle/items/:itemId", modelEdit, upsertValueCtrl);

// ---- Files ------------------------------------------------------------
// fileId is in the body here, so router.param does not see it.
router.post(
  "/models/:id/lifecycle/items/:itemId/files",
  modelEdit,
  validateId("fileId"),
  attachFileCtrl,
);
router.delete("/models/:id/lifecycle/items/:itemId/files/:fileId", modelEdit, detachFileCtrl);

// ---- People -----------------------------------------------------------
router.post("/models/:id/lifecycle/items/:itemId/people", modelEdit, addPersonCtrl);
router.delete("/models/:id/lifecycle/items/:itemId/people/:userId", modelEdit, removePersonCtrl);

// ---- Approvals --------------------------------------------------------
router.post("/models/:id/lifecycle/items/:itemId/approvals", modelEdit, addApproverCtrl);
router.put("/models/:id/lifecycle/items/:itemId/approvals/:userId", updateApprovalStatusCtrl);
router.delete(
  "/models/:id/lifecycle/items/:itemId/approvals/:userId",
  modelEdit,
  removeApproverCtrl,
);

export default router;
