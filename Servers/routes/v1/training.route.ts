import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import {
  completeAllTrainingAssignments,
  completeTrainingAssignment,
  createTrainingAssignments,
  deleteTrainingAssignment,
  getTrainingAssignmentSummary,
  listMyTrainingAssignments,
  listTrainingAssignments,
  reopenTrainingAssignment,
  updateTrainingAssignment,
} from "../../controllers/trainingAssignment.ctrl";

// Training assignments (#5260). Anyone in the organization can read. Complete
// and reopen are decided in the controller: the assignee, or training.edit.
router.get("/assignments/mine", authenticateJWT, listMyTrainingAssignments);
router.get("/assignments/summary", authenticateJWT, getTrainingAssignmentSummary);
router.get("/assignments", authenticateJWT, listTrainingAssignments);
router.post("/assignments", authenticateJWT, authorize("training.edit"), createTrainingAssignments);
router.post(
  "/assignments/complete-all",
  authenticateJWT,
  authorize("training.edit"),
  completeAllTrainingAssignments,
);
router.patch(
  "/assignments/:id",
  authenticateJWT,
  authorize("training.edit"),
  updateTrainingAssignment,
);
router.post("/assignments/:id/complete", authenticateJWT, completeTrainingAssignment);
router.post("/assignments/:id/reopen", authenticateJWT, reopenTrainingAssignment);
router.delete(
  "/assignments/:id",
  authenticateJWT,
  authorize("training.edit"),
  deleteTrainingAssignment,
);

export default router;
