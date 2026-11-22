import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  archiveIncidentById,
  createNewIncident,
  deleteIncidentById,
  getAllIncidents,
  getIncidentById,
  updateIncidentById,
} from "../controllers/incident-management.ctrl";

// GET all incidents
router.get("/", authenticateJWT, getAllIncidents);

// GET incident by ID
router.get("/:id", authenticateJWT, getIncidentById);

// POST create new incident
router.post("/", authenticateJWT, authorize("incident.create"), createNewIncident);

// PATCH update incident by ID
router.patch("/:id", authenticateJWT, authorize("incident.edit"), updateIncidentById);

// PATCH archive incident by ID
router.patch("/:id/archive", authenticateJWT, authorize("incident.edit"), archiveIncidentById);

// DELETE incident by ID
router.delete("/:id", authenticateJWT, authorize("incident.delete"), deleteIncidentById);

export default router;
