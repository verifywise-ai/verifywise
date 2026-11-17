import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { requireProjectAccess } from "../../middleware/projectAccess.middleware";
import {
  createNewModelInventoryV1,
  getModelByProjectId,
  updateModelInventoryByIdV1,
} from "../../controllers/modelInventory.ctrl";

// Decision 8: the model inventory is the organization's register and stays
// visible to everyone in it (legacy /api/modelInventory). What belongs to one
// use case needs access to that use case: its model list, and linking a
// model to it or unlinking it.

// Models linked directly to a use case the caller can open.
router.get(
  "/by-project/:projectId",
  authenticateJWT,
  requireProjectAccess("projectId"),
  getModelByProjectId,
);

// Create and update, with write access to every use case whose link changes.
router.post("/", authenticateJWT, authorize("model.edit"), createNewModelInventoryV1);
router.patch("/:id", authenticateJWT, authorize("model.edit"), updateModelInventoryByIdV1);

export default router;
