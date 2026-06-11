import express from "express";
const router = express.Router();

import {
  createCustomFieldDefinition,
  deleteCustomFieldDefinition,
  deleteCustomFieldValue,
  getCustomFieldDefinitionById,
  getCustomFieldValuesForEntity,
  getMissingRequiredCustomFields,
  listCustomFieldDefinitions,
  setCustomFieldValue,
  updateCustomFieldDefinition,
} from "../controllers/customField.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";

// Definitions — Admin can mutate; any authenticated user can read.
router.get("/definitions/by-id/:id", authenticateJWT, getCustomFieldDefinitionById);
router.get("/definitions/:entityType", authenticateJWT, listCustomFieldDefinitions);
router.post("/definitions", authenticateJWT, authorize(["Admin"]), createCustomFieldDefinition);
router.patch(
  "/definitions/:id",
  authenticateJWT,
  authorize(["Admin"]),
  updateCustomFieldDefinition,
);
router.delete(
  "/definitions/:id",
  authenticateJWT,
  authorize(["Admin"]),
  deleteCustomFieldDefinition,
);

// Values — any authenticated user with access to the parent entity.
router.get(
  "/values/:entityType/:entityId/missing-required",
  authenticateJWT,
  getMissingRequiredCustomFields,
);
router.get("/values/:entityType/:entityId", authenticateJWT, getCustomFieldValuesForEntity);
router.put("/values", authenticateJWT, setCustomFieldValue);
router.delete("/values/:definitionId/:entityId", authenticateJWT, deleteCustomFieldValue);

export default router;
