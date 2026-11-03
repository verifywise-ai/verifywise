import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
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

// ---- Config (phases + items) ------------------------------------------
router.get("/config", listConfig);
router.post("/phases", createPhaseCtrl);
// /phases/reorder MUST be declared before /phases/:id so Express doesn't
// interpret 'reorder' as a numeric phase id.
router.put("/phases/reorder", reorderPhasesCtrl);
router.put("/phases/:id", updatePhaseCtrl);
router.delete("/phases/:id", deletePhaseCtrl);
router.post("/phases/:phaseId/items", createItemCtrl);
router.put("/phases/:phaseId/items/reorder", reorderItemsCtrl);
router.put("/items/:id", updateItemCtrl);
router.delete("/items/:id", deleteItemCtrl);

// ---- Per-model reads + value upsert -----------------------------------
router.get("/models/:id/lifecycle", getLifecycleCtrl);
router.get("/models/:id/lifecycle/progress", getProgressCtrl);
router.put("/models/:id/lifecycle/items/:itemId", upsertValueCtrl);

// ---- Files ------------------------------------------------------------
// fileId is in the body here, so router.param does not see it.
router.post("/models/:id/lifecycle/items/:itemId/files", validateId("fileId"), attachFileCtrl);
router.delete("/models/:id/lifecycle/items/:itemId/files/:fileId", detachFileCtrl);

// ---- People -----------------------------------------------------------
router.post("/models/:id/lifecycle/items/:itemId/people", addPersonCtrl);
router.delete("/models/:id/lifecycle/items/:itemId/people/:userId", removePersonCtrl);

// ---- Approvals --------------------------------------------------------
router.post("/models/:id/lifecycle/items/:itemId/approvals", addApproverCtrl);
router.put("/models/:id/lifecycle/items/:itemId/approvals/:userId", updateApprovalStatusCtrl);
router.delete("/models/:id/lifecycle/items/:itemId/approvals/:userId", removeApproverCtrl);

export default router;
