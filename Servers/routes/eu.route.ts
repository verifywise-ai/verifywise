import express from "express";
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

import authenticateJWT from "../middleware/auth.middleware";
import {
  deleteAssessmentsByProjectId,
  deleteCompliancesByProjectId,
  getAllControlCategories,
  getAllProjectsAssessmentProgress,
  getAllProjectsComplianceProgress,
  getAllTopics,
  getAssessmentsByProjectId,
  getCompliancesByProjectId,
  getControlById,
  getControlsByControlCategoryId,
  getProjectAssessmentProgress,
  getProjectComplianceProgress,
  getTopicById,
  saveControls,
  updateQuestionById,
} from "../controllers/eu.ctrl";

router.get("/controlCategories", authenticateJWT, getAllControlCategories);
router.get("/controls/byControlCategoryId/:id", authenticateJWT, getControlsByControlCategoryId);

router.get("/topics", authenticateJWT, getAllTopics);

// "/project/byid/:id"
router.get("/assessments/byProjectId/:id", authenticateJWT, getAssessmentsByProjectId);
// "/byprojectid/:id"
router.get("/compliances/byProjectId/:id", authenticateJWT, getCompliancesByProjectId);

router.get("/compliances/progress/:id", authenticateJWT, getProjectComplianceProgress);
router.get("/assessments/progress/:id", authenticateJWT, getProjectAssessmentProgress);

router.get("/all/compliances/progress", authenticateJWT, getAllProjectsComplianceProgress);
router.get("/all/assessments/progress", authenticateJWT, getAllProjectsAssessmentProgress);

// get answer by id
router.get("/topicById", authenticateJWT, getTopicById);
// get control by id
router.get("/controlById", authenticateJWT, getControlById);

router.patch("/saveControls/:id", authenticateJWT, upload.any(), saveControls);
router.patch("/saveAnswer/:id", authenticateJWT, upload.any(), updateQuestionById);

router.delete("/assessments/byProjectId/:id", authenticateJWT, deleteAssessmentsByProjectId);
router.delete("/compliances/byProjectId/:id", authenticateJWT, deleteCompliancesByProjectId);

export default router;
