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

// GET
router.get("/", authenticateJWT, getAllModelInventories);
router.get("/evaluations", authenticateJWT, getAllModelEvaluations);
router.get("/:id/evaluations", authenticateJWT, getModelEvaluations);
router.get("/:id", authenticateJWT, getModelInventoryById);
router.get("/by-projectId/:projectId", authenticateJWT, getModelByProjectId);
router.get("/by-frameworkId/:frameworkId", authenticateJWT, getModelByFrameworkId);

// POST
router.post("/", authenticateJWT, createNewModelInventory);

// PATCH (Update)
router.patch("/:id", authenticateJWT, updateModelInventoryById);

// DELETE
router.delete("/:id", authenticateJWT, deleteModelInventoryById);

// Note: Model Lifecycle endpoints are now provided by the model-lifecycle plugin
// Install the plugin from the marketplace to enable lifecycle tracking

export default router;
