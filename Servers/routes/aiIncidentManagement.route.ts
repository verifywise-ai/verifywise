import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import authorize, { authorizeAny } from "../middleware/accessControl.middleware";
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

// PATCH update incident by ID. Either key gets in; the write path then needs
// incident.edit for the incident's details and incident.approve for
// approval_status / approval_notes (403 otherwise).
router.patch(
  "/:id",
  authenticateJWT,
  authorizeAny("incident.edit", "incident.approve"),
  updateIncidentById,
);

// PATCH archive incident by ID
router.patch("/:id/archive", authenticateJWT, authorize("incident.edit"), archiveIncidentById);

// DELETE incident by ID
router.delete("/:id", authenticateJWT, authorize("incident.delete"), deleteIncidentById);

export default router;
