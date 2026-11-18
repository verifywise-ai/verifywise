import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import {
  validateCreateModelInventoryV1,
  validateUpdateModelInventoryV1,
} from "../../middleware/validators/modelInventory.validator";
import {
  createNewModelInventory,
  updateModelInventoryById,
} from "../../controllers/modelInventory.ctrl";

const router = express.Router();

// Model create and update with strict validation (audit M-M7): required
// fields, enum values, ISO dates and integer ids, answered with field
// messages. The legacy /api/modelInventory contract is frozen; reads and
// delete stay there. Same controller, same approval rule.
router.post(
  "/",
  authenticateJWT,
  authorize("model.edit"),
  validateCreateModelInventoryV1,
  createNewModelInventory,
);
router.patch(
  "/:id",
  authenticateJWT,
  authorize("model.edit"),
  validateUpdateModelInventoryV1,
  updateModelInventoryById,
);

export default router;
