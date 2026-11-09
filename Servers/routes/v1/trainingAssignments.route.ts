import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import {
  completeTrainingAssignment,
  createTrainingAssignments,
  deleteTrainingAssignment,
  getTrainingAssignmentStats,
  listTrainingAssignments,
} from "../../controllers/trainingAssignment.ctrl";

// Training assignments (#5260). Reads are open to any authenticated user;
// assigning, completing and deleting need training.assign.

// Register "/stats" before "/:id" so the literal segment wins.
router.get("/stats", authenticateJWT, getTrainingAssignmentStats);
router.get("/", authenticateJWT, listTrainingAssignments);
router.post("/", authenticateJWT, authorize("training.assign"), createTrainingAssignments);
router.post(
  "/:id/complete",
  authenticateJWT,
  authorize("training.assign"),
  completeTrainingAssignment,
);
router.delete("/:id", authenticateJWT, authorize("training.assign"), deleteTrainingAssignment);

export default router;
