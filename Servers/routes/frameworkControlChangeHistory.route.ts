import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  getControlEUChangeHistoryById,
  getSubcontrolEUChangeHistoryById,
  getAnnexCategoryChangeHistoryById,
} from "../controllers/frameworkControlChangeHistory.ctrl";

// GET change history for an EU AI Act control
export const controlEUChangeHistoryRoutes = express.Router();
controlEUChangeHistoryRoutes.get("/:id", authenticateJWT, getControlEUChangeHistoryById);

// GET change history for an EU AI Act subcontrol
export const subcontrolEUChangeHistoryRoutes = express.Router();
subcontrolEUChangeHistoryRoutes.get("/:id", authenticateJWT, getSubcontrolEUChangeHistoryById);

// GET change history for an ISO 42001 annex category
export const annexCategoryChangeHistoryRoutes = express.Router();
annexCategoryChangeHistoryRoutes.get("/:id", authenticateJWT, getAnnexCategoryChangeHistoryById);
