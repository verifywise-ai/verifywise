import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  getAllDatasets,
  getDatasetById,
  getDatasetsByModelId,
  getDatasetsByProjectId,
  createNewDataset,
  updateDatasetById,
  deleteDatasetById,
  getDatasetHistory,
} from "../controllers/dataset.ctrl";

// GET
router.get("/", authenticateJWT, getAllDatasets);
router.get("/:id", authenticateJWT, getDatasetById);
router.get("/by-model/:modelId", authenticateJWT, getDatasetsByModelId);
router.get("/by-project/:projectId", authenticateJWT, getDatasetsByProjectId);
router.get("/:id/history", authenticateJWT, getDatasetHistory);

// POST
router.post("/", authenticateJWT, authorize("model.edit"), createNewDataset);

// PATCH (Update)
router.patch("/:id", authenticateJWT, authorize("model.edit"), updateDatasetById);

// DELETE
router.delete("/:id", authenticateJWT, authorize("model.edit"), deleteDatasetById);

export default router;
