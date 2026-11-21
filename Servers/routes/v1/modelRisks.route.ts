import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import {
  validateCreateModelRiskV1,
  validateUpdateModelRiskV1,
} from "../../middleware/validators/modelInventory.validator";
import { createNewModelRisk, updateModelRiskById } from "../../controllers/modelRisk.ctrl";

const router = express.Router();

// Model risk create and update with strict validation (audit M-M7, M-M10).
// The legacy /api/modelRisks contract is frozen; reads and delete stay there.
router.post(
  "/",
  authenticateJWT,
  authorize("model.edit"),
  validateCreateModelRiskV1,
  createNewModelRisk,
);
router.patch(
  "/:id",
  authenticateJWT,
  authorize("model.edit"),
  validateUpdateModelRiskV1,
  updateModelRiskById,
);

export default router;
