import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import {
  createNewModelInventory,
  deleteModelInventoryById,
  getAllModelInventories,
  getModelByFrameworkId,
  getModelByProjectId,
  getModelInventoryById,
  updateModelInventoryById,
} from "../controllers/modelInventory.ctrl";
import { getModelEvaluations, getAllModelEvaluations } from "../controllers/modelEvaluations.ctrl";
import authorize from "../middleware/accessControl.middleware";
import { requireProjectAccess } from "../middleware/projectAccess.middleware";

// GET
router.get("/", authenticateJWT, getAllModelInventories);
router.get("/evaluations", authenticateJWT, getAllModelEvaluations);
router.get("/:id/evaluations", authenticateJWT, getModelEvaluations);
router.get("/:id", authenticateJWT, getModelInventoryById);
// Decision 8: the inventory is the organization's register and stays visible
// to everyone in it; the models of one use case need access to that use case.
router.get(
  "/by-projectId/:projectId",
  authenticateJWT,
  requireProjectAccess("projectId"),
  getModelByProjectId,
);
router.get("/by-frameworkId/:frameworkId", authenticateJWT, getModelByFrameworkId);

// POST and PATCH: linking a model to a use case, or unlinking it, also needs
// access to that use case (checked in the write query).
router.post("/", authenticateJWT, authorize("model.edit"), createNewModelInventory);

// PATCH (Update)
router.patch("/:id", authenticateJWT, authorize("model.edit"), updateModelInventoryById);

// DELETE
router.delete("/:id", authenticateJWT, authorize("model.edit"), deleteModelInventoryById);

// Note: Model Lifecycle endpoints are now provided by the model-lifecycle plugin
// Install the plugin from the marketplace to enable lifecycle tracking

export default router;
