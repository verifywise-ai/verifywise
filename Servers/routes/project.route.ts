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
import authorize from "../middleware/accessControl.middleware";
import { requireProjectAccess } from "../middleware/projectAccess.middleware";
import {
  classifyUseCase,
  getUseCaseClassification,
} from "../controllers/euAiActClassification.ctrl";
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
  requireProjectAccess(),
  getProjectRisksCalculations,
);
router.get(
  "/calculateVendorRisks/:id",
  authenticateJWT,
  validateProjectIdParam,
  requireProjectAccess(),
  getVendorRisksCalculations,
);
// Not behind requireProjectAccess: workflow approvers need not be members, and
// the approval request email and notification link them to this use case.
router.get("/:id", authenticateJWT, validateProjectIdParam, getProjectById);
router.get(
  "/stats/:id",
  authenticateJWT,
  validateProjectIdParam,
  requireProjectAccess(),
  getProjectStatsById,
);

router.get(
  "/complainces/:projid",
  authenticateJWT,
  validateProjectProjIdParam,
  requireProjectAccess("projid"),
  getCompliances,
);

router.get(
  "/compliance/progress/:id",
  authenticateJWT,
  validateProjectIdParam,
  requireProjectAccess(),
  projectComplianceProgress,
);
router.get(
  "/assessment/progress/:id",
  authenticateJWT,
  validateProjectIdParam,
  requireProjectAccess(),
  projectAssessmentProgress,
);

router.get(
  "/:id/eu-ai-act-classification",
  authenticateJWT,
  validateProjectIdParam,
  requireProjectAccess(),
  getUseCaseClassification,
);
router.get("/all/compliance/progress", authenticateJWT, allProjectsComplianceProgress);
router.get("/all/assessment/progress", authenticateJWT, allProjectsAssessmentProgress);

// POSTs
router.post("/", authenticateJWT, authorize("useCase.edit"), validateCreateProject, createProject);
router.post(
  "/:id/eu-ai-act-classification",
  authenticateJWT,
  validateProjectIdParam,
  authorize("useCase.classify"),
  requireProjectAccess(),
  classifyUseCase,
);
// router.post("/saveControls", authenticateJWT, saveControls);

// Patches
router.patch(
  "/:id",
  authenticateJWT,
  authorize("useCase.edit"),
  validateUpdateProject,
  updateProjectById,
);
router.patch(
  "/:id/status",
  authenticateJWT,
  authorize("useCase.edit"),
  validateUpdateProjectStatus,
  requireProjectAccess(),
  updateProjectStatus,
);

// DELETEs
router.delete(
  "/:id",
  authenticateJWT,
  authorize("useCase.edit"),
  validateProjectIdParam,
  requireProjectAccess(),
  deleteProjectById,
);

export default router;
