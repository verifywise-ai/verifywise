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
  bulkUpdateMasterControls,
  createMasterControl,
  deleteMasterControl,
  deleteMasterControlMapping,
  exportMasterControlsCsv,
  getAllMasterControls,
  getFrameworkCatalog,
  getMasterControlById,
  getMasterControlMappings,
  getMasterControlPropagationPreview,
  importRecommendedMappings,
  updateMasterControl,
} from "../controllers/masterControl.ctrl";

const router = express.Router();

// Literal segments — defined BEFORE "/:id" so they don't get matched as ids.
router.patch("/bulk", authenticateJWT, bulkUpdateMasterControls);
router.get("/export", authenticateJWT, exportMasterControlsCsv);
router.get("/framework-catalog", authenticateJWT, getFrameworkCatalog);
router.post("/seed-recommended", authenticateJWT, importRecommendedMappings);
router.delete("/mappings/:mappingId", authenticateJWT, deleteMasterControlMapping);
router.get("/:id/mappings", authenticateJWT, getMasterControlMappings);
router.post("/:id/mappings", authenticateJWT, addMasterControlMapping);
router.post("/:id/propagation-preview", authenticateJWT, getMasterControlPropagationPreview);

// Master controls CRUD
router.get("/", authenticateJWT, getAllMasterControls);
router.get("/:id", authenticateJWT, getMasterControlById);
router.post("/", authenticateJWT, createMasterControl);
router.patch("/:id", authenticateJWT, updateMasterControl);
router.delete("/:id", authenticateJWT, deleteMasterControl);

export default router;
