/**
 * Controls Hub — master_controls route definitions.
 *
 * All routes require an authenticated JWT. Multi-tenant scoping is applied
 * in the controller via `req.organizationId`.
 *
 * Registered in `index.ts` as `app.use("/api/master-controls", …)`.
 */

import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  addMasterControlMapping,
  createMasterControl,
  deleteMasterControl,
  deleteMasterControlMapping,
  getAllMasterControls,
  getMasterControlById,
  getMasterControlMappings,
  updateMasterControl,
} from "../controllers/masterControl.ctrl";

const router = express.Router();

// Mappings — defined BEFORE "/:id" so the literal "mappings" segment wins.
router.delete("/mappings/:mappingId", authenticateJWT, deleteMasterControlMapping);
router.get("/:id/mappings", authenticateJWT, getMasterControlMappings);
router.post("/:id/mappings", authenticateJWT, addMasterControlMapping);

// Master controls CRUD
router.get("/", authenticateJWT, getAllMasterControls);
router.get("/:id", authenticateJWT, getMasterControlById);
router.post("/", authenticateJWT, createMasterControl);
router.patch("/:id", authenticateJWT, updateMasterControl);
router.delete("/:id", authenticateJWT, deleteMasterControl);

export default router;
