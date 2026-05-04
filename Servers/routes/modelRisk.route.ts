import { Router } from "express";
import {
  getAllModelRisks,
  getModelRiskById,
  createNewModelRisk,
  updateModelRiskById,
  deleteModelRiskById,
} from "../controllers/modelRisk.ctrl";
import authenticateJWT from "../middleware/auth.middleware";

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateJWT);

// GET /modelRisks - Get all model risks
router.get("/", getAllModelRisks);

// GET /modelRisks/:id - Get model risk by ID
router.get("/:id", getModelRiskById);

// POST /modelRisks - Create new model risk
router.post("/", createNewModelRisk);

// PUT /modelRisks/:id - Update model risk by ID
router.put("/:id", updateModelRiskById);

// PATCH /modelRisks/:id - Update model risk by ID (alternative)
router.patch("/:id", updateModelRiskById);

// DELETE /modelRisks/:id - Delete model risk by ID
router.delete("/:id", deleteModelRiskById);

export default router;
