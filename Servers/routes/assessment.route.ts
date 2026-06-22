import express from "express";
const router = express.Router();

import {
  getAllAssessments,
  getAnswers,
  getAssessmentById,
  getAssessmentByProjectId,
  createAssessment,
  updateAssessmentById,
  deleteAssessmentById,
} from "../controllers/assessment.ctrl";

import authenticateJWT from "../middleware/auth.middleware";

// GET requests
router.get("/", authenticateJWT, getAllAssessments);
router.get("/getAnswers/:id", authenticateJWT, getAnswers);
router.get("/:id", authenticateJWT, getAssessmentById);
router.get("/project/byid/:id", authenticateJWT, getAssessmentByProjectId);

// POST requests
router.post("/", authenticateJWT, createAssessment);

// PUT requests
router.put("/:id", authenticateJWT, updateAssessmentById);

// DELETE requests
router.delete("/:id", authenticateJWT, deleteAssessmentById);

export default router;
