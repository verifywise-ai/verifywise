import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  getFria,
  updateFria,
  updateFriaRights,
  getRiskItems,
  addRiskItem,
  updateRiskItem,
  deleteRiskItem,
  getModelLinks,
  linkModel,
  unlinkModel,
  submitFria,
  getVersions,
  getVersion,
  getFriaEvidence,
  linkFriaEvidence,
  unlinkFriaEvidence,
} from "../controllers/fria.ctrl";

const router = express.Router();

router.use(authenticateJWT);

// Sub-resource routes (2+ segments) registered BEFORE bare /:projectId to avoid shadowing
// Rights matrix
router.put("/:friaId/rights", authorize("fria.edit"), updateFriaRights);

// Risk items
router.get("/:friaId/risk-items", getRiskItems);
router.post("/:friaId/risk-items", authorize("fria.edit"), addRiskItem);
router.patch("/:friaId/risk-items/:itemId", authorize("fria.edit"), updateRiskItem);
router.delete("/:friaId/risk-items/:itemId", authorize("fria.edit"), deleteRiskItem);

// Model links
router.get("/:friaId/models", getModelLinks);
router.post("/:friaId/models/:modelId", authorize("fria.edit"), linkModel);
router.delete("/:friaId/models/:modelId", authorize("fria.edit"), unlinkModel);

// Evidence attachments
router.get("/:friaId/evidence", getFriaEvidence);
router.post("/:friaId/evidence", authorize("fria.edit"), linkFriaEvidence);
router.delete("/:friaId/evidence/:linkId", authorize("fria.edit"), unlinkFriaEvidence);

// Submit & versioning
router.post("/:friaId/submit", authorize("fria.edit"), submitFria);
router.get("/:friaId/versions", getVersions);
router.get("/:friaId/versions/:version", getVersion);

// Assessment CRUD — bare /:projectId registered LAST so it cannot shadow sub-resource routes
router.get("/:projectId", getFria);
router.put("/:projectId", authorize("fria.edit"), updateFria);

export default router;
