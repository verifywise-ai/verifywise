import { Router } from "express";
import {
  getAllModelRisks,
  getModelRiskById,
  createNewModelRisk,
  updateModelRiskById,
  deleteModelRiskById,
} from "../controllers/modelRisk.ctrl";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateJWT);

// GET /modelRisks - Get all model risks
router.get("/", getAllModelRisks);

// GET /modelRisks/:id - Get model risk by ID
router.get("/:id", getModelRiskById);

// POST /modelRisks - Create new model risk
router.post("/", authorize("model.edit"), createNewModelRisk);

// PUT /modelRisks/:id - Update model risk by ID
router.put("/:id", authorize("model.edit"), updateModelRiskById);

// PATCH /modelRisks/:id - Update model risk by ID (alternative)
router.patch("/:id", authorize("model.edit"), updateModelRiskById);

// DELETE /modelRisks/:id - Delete model risk by ID
router.delete("/:id", authorize("model.edit"), deleteModelRiskById);

export default router;
