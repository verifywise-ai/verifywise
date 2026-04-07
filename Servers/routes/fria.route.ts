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
router.put("/:friaId/rights", authorize(["Admin", "Editor"]), updateFriaRights);

// Risk items
router.get("/:friaId/risk-items", getRiskItems);
router.post("/:friaId/risk-items", authorize(["Admin", "Editor"]), addRiskItem);
router.patch("/:friaId/risk-items/:itemId", authorize(["Admin", "Editor"]), updateRiskItem);
router.delete("/:friaId/risk-items/:itemId", authorize(["Admin", "Editor"]), deleteRiskItem);

// Model links
router.get("/:friaId/models", getModelLinks);
router.post("/:friaId/models/:modelId", authorize(["Admin", "Editor"]), linkModel);
router.delete("/:friaId/models/:modelId", authorize(["Admin", "Editor"]), unlinkModel);

// Evidence attachments
router.get("/:friaId/evidence", getFriaEvidence);
router.post("/:friaId/evidence", authorize(["Admin", "Editor"]), linkFriaEvidence);
router.delete("/:friaId/evidence/:linkId", authorize(["Admin", "Editor"]), unlinkFriaEvidence);

// Submit & versioning
router.post("/:friaId/submit", authorize(["Admin", "Editor"]), submitFria);
router.get("/:friaId/versions", getVersions);
router.get("/:friaId/versions/:version", getVersion);

// Assessment CRUD — bare /:projectId registered LAST so it cannot shadow sub-resource routes
router.get("/:projectId", getFria);
router.put("/:projectId", authorize(["Admin", "Editor"]), updateFria);

export default router;
