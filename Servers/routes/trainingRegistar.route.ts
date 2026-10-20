import express from "express";
const router = express.Router();

import {
  getAllTrainingRegistar,
  getTrainingRegistarById,
  createNewTrainingRegistar,
  updateTrainingRegistarById,
  deleteTrainingRegistarById,
} from "../controllers/trainingRegistar.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";

// GET requests
router.get("/", authenticateJWT, getAllTrainingRegistar);
router.get("/training-id/:id", authenticateJWT, getTrainingRegistarById);
// POST, PATCH, DELETE requests
router.post("/", authenticateJWT, authorize("training.edit"), createNewTrainingRegistar);
router.patch("/:id", authenticateJWT, authorize("training.edit"), updateTrainingRegistarById);
router.delete("/:id", authenticateJWT, authorize("training.admin"), deleteTrainingRegistarById);

export default router;
