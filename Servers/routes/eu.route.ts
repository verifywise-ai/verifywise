import express from "express";
const router = express.Router();
import { createMemoryUpload } from "../utils/upload.utils";
// Security: bounded upload config (30MB/file, 10 files, MIME allowlist).
const upload = createMemoryUpload();

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import { requireFrameworkWriteAccess } from "../middleware/frameworkWriteAccess.middleware";
import { euAnswerChanges, euControlChanges } from "../utils/frameworkWriteAccess.utils";
import { requireUseCaseAccessVia } from "../middleware/projectAccess.middleware";
import {
  useCaseOfEuAnswer,
  useCaseOfEuControl,
  useCaseOfProjectFramework,
} from "../utils/useCaseOfChild.utils";
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

// Every route keyed by a projects_frameworks row, control or answer runs the
// access rule of the use case it belongs to (requireUseCaseAccessVia).
const pfInPath = requireUseCaseAccessVia(useCaseOfProjectFramework);
const pfInQuery = requireUseCaseAccessVia(useCaseOfProjectFramework, {
  param: "projectFrameworkId",
  source: "query",
});

// Without projectFrameworkId this lists the shared catalogue; with it, the
// categories one use case shows.
router.get(
  "/controlCategories",
  authenticateJWT,
  requireUseCaseAccessVia(useCaseOfProjectFramework, {
    param: "projectFrameworkId",
    source: "query",
    optional: true,
  }),
  getAllControlCategories,
);
router.get(
  "/controls/byControlCategoryId/:id",
  authenticateJWT,
  pfInQuery,
  getControlsByControlCategoryId,
);

router.get("/topics", authenticateJWT, getAllTopics);

// "/project/byid/:id"
router.get("/assessments/byProjectId/:id", authenticateJWT, pfInPath, getAssessmentsByProjectId);
// "/byprojectid/:id"
router.get("/compliances/byProjectId/:id", authenticateJWT, pfInPath, getCompliancesByProjectId);

router.get("/compliances/progress/:id", authenticateJWT, pfInPath, getProjectComplianceProgress);
router.get("/assessments/progress/:id", authenticateJWT, pfInPath, getProjectAssessmentProgress);

router.get("/all/compliances/progress", authenticateJWT, getAllProjectsComplianceProgress);
router.get("/all/assessments/progress", authenticateJWT, getAllProjectsAssessmentProgress);

// get answer by id
router.get("/topicById", authenticateJWT, pfInQuery, getTopicById);
// get control by id
router.get("/controlById", authenticateJWT, pfInQuery, getControlById);

router.patch(
  "/saveControls/:id",
  authenticateJWT,
  requireUseCaseAccessVia(useCaseOfEuControl),
  upload.any(),
  requireFrameworkWriteAccess(euControlChanges),
  saveControls,
);
router.patch(
  "/saveAnswer/:id",
  authenticateJWT,
  requireUseCaseAccessVia(useCaseOfEuAnswer),
  upload.any(),
  requireFrameworkWriteAccess(euAnswerChanges),
  updateQuestionById,
);

router.delete(
  "/assessments/byProjectId/:id",
  authenticateJWT,
  authorize("framework.edit"),
  pfInPath,
  deleteAssessmentsByProjectId,
);
router.delete(
  "/compliances/byProjectId/:id",
  authenticateJWT,
  authorize("framework.edit"),
  pfInPath,
  deleteCompliancesByProjectId,
);

export default router;
