import express from "express";
const router = express.Router();

import {
  allProjectsAssessmentProgress,
  allProjectsComplianceProgress,
  createProject,
  deleteProjectById,
  getAllProjects,
  getCompliances,
  getProjectById,
  getProjectRisksCalculations,
  getProjectStatsById,
  getVendorRisksCalculations,
  projectAssessmentProgress,
  projectComplianceProgress,
  // saveControls,
  updateProjectById,
  updateProjectStatus,
} from "../controllers/project.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import {
  validateCreateProject,
  validateProjectIdParam,
  validateProjectProjIdParam,
  validateUpdateProject,
  validateUpdateProjectStatus,
} from "../middleware/validators/project.validator";

// GET requests
router.get("/", authenticateJWT, getAllProjects);
router.get(
  "/calculateProjectRisks/:id",
  authenticateJWT,
  validateProjectIdParam,
  getProjectRisksCalculations,
);
router.get(
  "/calculateVendorRisks/:id",
  authenticateJWT,
  validateProjectIdParam,
  getVendorRisksCalculations,
);
router.get("/:id", authenticateJWT, validateProjectIdParam, getProjectById);
router.get("/stats/:id", authenticateJWT, validateProjectIdParam, getProjectStatsById);

router.get("/complainces/:projid", authenticateJWT, validateProjectProjIdParam, getCompliances);

router.get(
  "/compliance/progress/:id",
  authenticateJWT,
  validateProjectIdParam,
  projectComplianceProgress,
);
router.get(
  "/assessment/progress/:id",
  authenticateJWT,
  validateProjectIdParam,
  projectAssessmentProgress,
);

router.get("/all/compliance/progress", authenticateJWT, allProjectsComplianceProgress);
router.get("/all/assessment/progress", authenticateJWT, allProjectsAssessmentProgress);

// POSTs
router.post("/", authenticateJWT, validateCreateProject, createProject);
// router.post("/saveControls", authenticateJWT, saveControls);

// Patches
router.patch("/:id", authenticateJWT, validateUpdateProject, updateProjectById);
router.patch("/:id/status", authenticateJWT, validateUpdateProjectStatus, updateProjectStatus);

// DELETEs
router.delete("/:id", authenticateJWT, validateProjectIdParam, deleteProjectById);

export default router;
