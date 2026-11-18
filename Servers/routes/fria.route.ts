import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  requireProjectAccess,
  requireUseCaseAccessVia,
} from "../middleware/projectAccess.middleware";
import { useCaseOfFria } from "../utils/useCaseOfChild.utils";
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

// Every route keyed by a FRIA runs the access rule of its use case.
const friaUseCase = requireUseCaseAccessVia(useCaseOfFria, { param: "friaId" });

// Sub-resource routes (2+ segments) registered BEFORE bare /:projectId to avoid shadowing
// Rights matrix
router.put("/:friaId/rights", authorize("fria.edit"), friaUseCase, updateFriaRights);

// Risk items
router.get("/:friaId/risk-items", friaUseCase, getRiskItems);
router.post("/:friaId/risk-items", authorize("fria.edit"), friaUseCase, addRiskItem);
router.patch("/:friaId/risk-items/:itemId", authorize("fria.edit"), friaUseCase, updateRiskItem);
router.delete("/:friaId/risk-items/:itemId", authorize("fria.edit"), friaUseCase, deleteRiskItem);

// Model links
router.get("/:friaId/models", friaUseCase, getModelLinks);
router.post("/:friaId/models/:modelId", authorize("fria.edit"), friaUseCase, linkModel);
router.delete("/:friaId/models/:modelId", authorize("fria.edit"), friaUseCase, unlinkModel);

// Evidence attachments
router.get("/:friaId/evidence", friaUseCase, getFriaEvidence);
router.post("/:friaId/evidence", authorize("fria.edit"), friaUseCase, linkFriaEvidence);
router.delete("/:friaId/evidence/:linkId", authorize("fria.edit"), friaUseCase, unlinkFriaEvidence);

// Submit & versioning
router.post("/:friaId/submit", authorize("fria.edit"), friaUseCase, submitFria);
router.get("/:friaId/versions", friaUseCase, getVersions);
router.get("/:friaId/versions/:version", friaUseCase, getVersion);

// Assessment CRUD — bare /:projectId registered LAST so it cannot shadow sub-resource routes
router.get("/:projectId", requireProjectAccess("projectId"), getFria);
router.put("/:projectId", authorize("fria.edit"), requireProjectAccess("projectId"), updateFria);

export default router;
